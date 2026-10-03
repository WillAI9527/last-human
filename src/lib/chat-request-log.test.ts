import assert from "node:assert/strict";
import test from "node:test";
import {
  createChatRequestLog,
  extractChatTokenUsage,
  logChatRequest,
  NORMAL_ATTEMPT_TIMEOUT_MS,
  normalizeChatCallType,
  openUpstreamAttempt,
  upstreamFailureStatus,
} from "./chat-request-log";

test("普通上游尝试在 25 秒记为 timeout，客户端断开记为 abort", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const attempt = openUpstreamAttempt(undefined, NORMAL_ATTEMPT_TIMEOUT_MS);
  assert.equal(NORMAL_ATTEMPT_TIMEOUT_MS, 25_000);
  assert.equal(attempt.signal.aborted, false);
  t.mock.timers.tick(NORMAL_ATTEMPT_TIMEOUT_MS - 1);
  assert.equal(attempt.signal.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(attempt.signal.reason, "timeout");
  assert.equal(upstreamFailureStatus(attempt.signal), "timeout");
  attempt.dispose();

  const parent = new AbortController();
  const linked = openUpstreamAttempt(parent.signal, NORMAL_ATTEMPT_TIMEOUT_MS);
  parent.abort();
  assert.equal(linked.signal.aborted, true);
  assert.equal(linked.signal.reason, "abort");
  assert.equal(upstreamFailureStatus(linked.signal), "abort");
  t.mock.timers.tick(NORMAL_ATTEMPT_TIMEOUT_MS);
  assert.equal(linked.signal.reason, "abort");
  linked.dispose();

  const already = new AbortController();
  already.abort();
  const immediate = openUpstreamAttempt(already.signal, NORMAL_ATTEMPT_TIMEOUT_MS);
  assert.equal(immediate.signal.reason, "abort");
  immediate.dispose();

  const released = openUpstreamAttempt(undefined, NORMAL_ATTEMPT_TIMEOUT_MS);
  released.releaseTimer();
  t.mock.timers.tick(NORMAL_ATTEMPT_TIMEOUT_MS);
  assert.equal(released.signal.aborted, false);
  released.dispose();
});

test("每次完成只打一行，且不含提示词或密钥", () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (line?: unknown) => {
    lines.push(String(line));
  };
  try {
    const log = createChatRequestLog({
      model: "deepseek/deepseek-v3.2",
      attempt: 2,
      callType: "speech",
      startedAt: Date.now() - 40,
    });
    logChatRequest(log, "timeout");
    logChatRequest(log, 200);
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed).sort(), [
      "attempt",
      "callType",
      "completionTokens",
      "elapsedMs",
      "model",
      "promptTokens",
      "reasoningTokens",
      "source",
      "status",
    ]);
    assert.equal(parsed.source, "api/chat");
    assert.equal(parsed.model, "deepseek/deepseek-v3.2");
    assert.equal(parsed.status, "timeout");
    assert.equal(parsed.attempt, 2);
    assert.equal(parsed.callType, "speech");
    assert.equal(parsed.promptTokens, null);
    assert.equal(parsed.completionTokens, null);
    assert.equal(parsed.reasoningTokens, null);
    assert.equal(typeof parsed.elapsedMs, "number");
    assert.ok((parsed.elapsedMs as number) >= 40);
    const serialized = lines[0];
    assert.equal(serialized.includes("sk-"), false);
    assert.equal(serialized.includes("messages"), false);
    assert.equal(normalizeChatCallType("vote"), "vote");
    assert.equal(normalizeChatCallType("badge"), "other");
    assert.equal(normalizeChatCallType(undefined), "other");

    const completed = createChatRequestLog({
      model: "google/gemini-3.5-flash-lite",
      attempt: 1,
      callType: "night",
      startedAt: Date.now(),
    });
    logChatRequest(completed, 200, extractChatTokenUsage({
      usage: {
        prompt_tokens: 120,
        completion_tokens: 40,
        completion_tokens_details: { reasoning_tokens: 17 },
      },
    }));
    const completedLine = JSON.parse(lines[1]) as Record<string, unknown>;
    assert.equal(completedLine.promptTokens, 120);
    assert.equal(completedLine.completionTokens, 40);
    assert.equal(completedLine.reasoningTokens, 17);

    const outputNamed = createChatRequestLog({
      model: "deepseek/deepseek-v3.2",
      attempt: 1,
      callType: "vote",
      startedAt: Date.now(),
    });
    logChatRequest(outputNamed, 200, extractChatTokenUsage({
      usage: { input_tokens: 8, output_tokens: 3, thinking_tokens: 2 },
    }));
    const outputLine = JSON.parse(lines[2]) as Record<string, unknown>;
    assert.equal(outputLine.promptTokens, 8);
    assert.equal(outputLine.completionTokens, 3);
    assert.equal(outputLine.reasoningTokens, 2);

    const noReasoning = createChatRequestLog({
      model: "deepseek/deepseek-v3.2",
      attempt: 1,
      callType: "summary",
      startedAt: Date.now(),
    });
    logChatRequest(noReasoning, 200, extractChatTokenUsage({
      usage: { prompt_tokens: 4, completion_tokens: 1 },
    }));
    const plainLine = JSON.parse(lines[3]) as Record<string, unknown>;
    assert.equal(plainLine.promptTokens, 4);
    assert.equal(plainLine.completionTokens, 1);
    assert.equal(plainLine.reasoningTokens, null);

    const aborted = createChatRequestLog({
      model: "deepseek/deepseek-v3.2",
      attempt: 1,
      callType: "speech",
      startedAt: Date.now(),
    });
    logChatRequest(aborted, "abort", extractChatTokenUsage({
      usage: {
        prompt_tokens: 99,
        completion_tokens: 12,
        completion_tokens_details: { reasoning_tokens: 5 },
      },
    }));
    const abortedLine = JSON.parse(lines[4]) as Record<string, unknown>;
    assert.equal(abortedLine.status, "abort");
    assert.equal(abortedLine.promptTokens, null);
    assert.equal(abortedLine.completionTokens, null);
    assert.equal(abortedLine.reasoningTokens, null);
    assert.equal(lines.length, 5);
  } finally {
    console.log = original;
  }
});
