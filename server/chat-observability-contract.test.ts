import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";

const projectRoot = join(dirname(new URL(import.meta.url).pathname), "..");
const routeSource = readFileSync(join(projectRoot, "src/app/api/chat/route.ts"), "utf8");
const llmSource = readFileSync(join(projectRoot, "src/lib/llm.ts"), "utf8");
const loggerSource = readFileSync(join(projectRoot, "src/lib/ai-logger.ts"), "utf8");

test("chat provider attempt 使用客户端 attempt ID 作为幂等事件，并记录实际结果", () => {
  assert.match(routeSource, /eventId:\s*randomUUID\(\)/);
  assert.match(routeSource, /eventId:\s*stableId\(request\.headers\.get\(ATTEMPT_ID_HEADER\)\)/);
  assert.doesNotMatch(routeSource, /withAttemptHeaders/);
  assert.match(routeSource, /await recordGameSessionAiAttempt\(/);
  assert.match(routeSource, /fetchProvider\(/);
  assert.match(routeSource, /"http_error"/);
  assert.match(routeSource, /"network_error"/);
  assert.match(routeSource, /trackedStreamResponse\(/);

  const recordBlock = routeSource.slice(
    routeSource.indexOf("async function recordAttempt"),
    routeSource.indexOf("async function fetchProvider"),
  );
  for (const forbidden of ["messages", "content", "apiKey", "displayName", "seat", "role"]) {
    assert.doesNotMatch(recordBlock, new RegExp(forbidden, "i"), `事件不应包含 ${forbidden}`);
  }
});

test("客户端每个逻辑调用生成 UUID，batch item 独立，充值恢复后 attempt 仍单调递增", () => {
  assert.match(llmSource, /const logicalRequestId = generateUUID\(\)/);
  assert.match(llmSource, /headers\.set\("X-Request-ID", logicalRequestId\)/);
  assert.match(llmSource, /headers\.set\("X-Attempt-ID", generateUUID\(\)\)/);
  assert.match(llmSource, /headers\.set\("X-Attempt", String\(attemptNumber\)\)/);
  assert.match(llmSource, /const attemptSequence = \{ current: 0 \}/);
  assert.match(llmSource, /logicalRequestId,\s*attemptSequence/);
  assert.match(llmSource, /request_id: logicalRequestId/);
  assert.match(llmSource, /request_id: generateUUID\(\)/);
});

test("每次 /api/chat 完成只打一行，不含提示词或密钥，普通尝试 25 秒后放弃", () => {
  const logSource = readFileSync(join(projectRoot, "src/lib/chat-request-log.ts"), "utf8");
  const gameMasterSource = readFileSync(join(projectRoot, "src/lib/game-master.ts"), "utf8");
  assert.match(routeSource, /logChatRequest\(/);
  assert.match(routeSource, /openUpstreamAttempt\(/);
  assert.match(logSource, /NORMAL_ATTEMPT_TIMEOUT_MS = 25_000/);
  assert.doesNotMatch(routeSource, /API_TIMEOUT_MS/);
  assert.doesNotMatch(routeSource, /console\.error\("\[api\/chat\] Error:"/);
  assert.equal(routeSource.match(/await fetchUpstream\(/g)?.length, 6);
  assert.equal(llmSource.match(/call_type:/g)?.length, 3);
  assert.equal(gameMasterSource.match(/callType: "speech"/g)?.length, 4);
  assert.equal(gameMasterSource.match(/callType: "vote"/g)?.length, 2);
  assert.equal(gameMasterSource.match(/callType: "summary"/g)?.length, 1);
  assert.equal(gameMasterSource.match(/callType: "night"/g)?.length, 6);

  const logBlock = logSource.slice(
    logSource.indexOf("export function logChatRequest"),
    logSource.indexOf("export type UpstreamAttempt"),
  );
  for (const forbidden of ["messages", "content", "apiKey", "authorization", "prompt", "displayName"]) {
    assert.doesNotMatch(logBlock, new RegExp(forbidden, "i"), `完成日志不应包含 ${forbidden}`);
  }
  assert.match(logBlock, /source: "api\/chat"/);
  assert.match(logBlock, /elapsedMs/);
  assert.match(logBlock, /callType: log\.callType/);
});

test("batch 单项异常被隔离，生产 logger 不写 localStorage，旧日志路由已移除", () => {
  assert.match(routeSource, /requests\.map\([\s\S]*?\.catch\(/);
  assert.match(loggerSource, /process\.env\.NODE_ENV !== "production"/);
  assert.equal(existsSync(join(projectRoot, "src/app/api/ai-log/route.ts")), false);
});
