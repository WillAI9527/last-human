import assert from "node:assert/strict";
import test from "node:test";
import {
  GAMES_PER_IP_PER_DAY,
  LLM_CALLS_PER_GAME,
  MSG_DAILY_LIMIT,
  MSG_LLM_CAP,
  MSG_SERVER_NOT_CONFIGURED,
  consumeDemoLlmCall,
  resetDemoRateLimitForTests,
  startDemoGame,
} from "./demo-rate-limit";

function requestFrom(ip: string, cookie = ""): Request {
  return new Request("http://localhost/api/games/start", {
    method: "POST",
    headers: {
      "x-forwarded-for": ip,
      ...(cookie ? { cookie } : {}),
    },
  });
}

test("未配置 ZenMux 时开局返回服务器未配置", async () => {
  const previous = process.env.ZENMUX_API_KEY;
  delete process.env.ZENMUX_API_KEY;
  resetDemoRateLimitForTests();
  const result = await startDemoGame(requestFrom("203.0.113.10"));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 503);
    assert.equal(result.message, MSG_SERVER_NOT_CONFIGURED);
  }
  if (previous === undefined) delete process.env.ZENMUX_API_KEY;
  else process.env.ZENMUX_API_KEY = previous;
});

test("同一 IP 每天只能开 3 局，第 4 局给出中文提示", async () => {
  process.env.ZENMUX_API_KEY = "test-key";
  resetDemoRateLimitForTests();
  const ip = "203.0.113.20";
  let cookie = "";
  for (let i = 0; i < GAMES_PER_IP_PER_DAY; i += 1) {
    const started = await startDemoGame(requestFrom(ip, cookie));
    assert.equal(started.ok, true);
    if (started.ok) cookie = started.cookies.map((item) => item.split(";")[0]).join("; ");
  }
  const blocked = await startDemoGame(requestFrom(ip, cookie));
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.status, 429);
    assert.equal(blocked.message, MSG_DAILY_LIMIT);
  }
});

test("单局模型调用达到上限后拒绝继续", async () => {
  process.env.ZENMUX_API_KEY = "test-key";
  resetDemoRateLimitForTests();
  const started = await startDemoGame(requestFrom("203.0.113.30"));
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const chat = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "x-demo-game-token": started.gameToken, "x-forwarded-for": "203.0.113.30" },
  });
  const filled = await consumeDemoLlmCall(chat, LLM_CALLS_PER_GAME);
  assert.equal(filled.ok, true);
  const blocked = await consumeDemoLlmCall(chat, 1);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.status, 429);
    assert.equal(blocked.message, MSG_LLM_CAP);
  }
});
