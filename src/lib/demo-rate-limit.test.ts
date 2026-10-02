import assert from "node:assert/strict";
import test from "node:test";
import {
  GAMES_PER_IP_PER_DAY,
  LLM_CALLS_PER_GAME,
  MSG_DAILY_LIMIT,
  MSG_LLM_CAP,
  MSG_SERVER_NOT_CONFIGURED,
  TESTER_TOKEN_HEADER,
  consumeDemoLlmCall,
  dailyLimitMessage,
  resetDemoRateLimitForTests,
  startDemoGame,
} from "./demo-rate-limit";
import { captureTesterTokenFromLocation, getTesterToken, reservePublicGame } from "./demo-game-client";

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
  delete process.env.DAILY_GAME_LIMIT;
  delete process.env.RATE_LIMIT_BYPASS_TOKEN;
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

test("签名对局令牌在内存清空后仍然有效", async () => {
  process.env.ZENMUX_API_KEY = "test-key";
  resetDemoRateLimitForTests();
  const started = await startDemoGame(requestFrom("203.0.113.40"));
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const first = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "x-demo-game-token": started.gameToken, "x-forwarded-for": "203.0.113.40" },
  });
  const used = await consumeDemoLlmCall(first, 2);
  assert.equal(used.ok, true);
  if (!used.ok) return;
  resetDemoRateLimitForTests();
  const cookie = used.cookies.map((item) => item.split(";")[0]).join("; ");
  const resumed = await consumeDemoLlmCall(new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "x-demo-game-token": started.gameToken,
      "x-forwarded-for": "203.0.113.40",
      cookie,
    },
  }), 1);
  assert.equal(resumed.ok, true);
  const otherIp = await consumeDemoLlmCall(new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "x-demo-game-token": started.gameToken, "x-forwarded-for": "203.0.113.41" },
  }), 1);
  assert.equal(otherIp.ok, false);
});

test("DAILY_GAME_LIMIT 决定每日局数，提示里带上这个数字", async () => {
  process.env.ZENMUX_API_KEY = "test-key";
  process.env.DAILY_GAME_LIMIT = "2";
  delete process.env.RATE_LIMIT_BYPASS_TOKEN;
  resetDemoRateLimitForTests();
  try {
    const ip = "203.0.113.60";
    let cookie = "";
    for (let i = 0; i < 2; i += 1) {
      const started = await startDemoGame(requestFrom(ip, cookie));
      assert.equal(started.ok, true);
      if (started.ok) cookie = started.cookies.map((item) => item.split(";")[0]).join("; ");
    }
    const blocked = await startDemoGame(requestFrom(ip, cookie));
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.status, 429);
      assert.equal(blocked.message, "今天的 2 局已经用完了。请明天（新加坡时间）再来。");
      assert.equal(blocked.message, dailyLimitMessage(2));
    }
    process.env.DAILY_GAME_LIMIT = "nope";
    assert.equal(dailyLimitMessage(), MSG_DAILY_LIMIT);
  } finally {
    delete process.env.DAILY_GAME_LIMIT;
  }
});

test("匹配的测试令牌跳过每日上限，且不消耗名额", async () => {
  process.env.ZENMUX_API_KEY = "test-key";
  process.env.DAILY_GAME_LIMIT = "1";
  process.env.RATE_LIMIT_BYPASS_TOKEN = "qa-secret";
  resetDemoRateLimitForTests();
  const ip = "203.0.113.70";
  try {
    const bypassHeaders = {
      "x-forwarded-for": ip,
      [TESTER_TOKEN_HEADER]: "qa-secret",
    };
    const bypassed = await startDemoGame(new Request("http://localhost/api/games/start", {
      method: "POST",
      headers: bypassHeaders,
    }));
    assert.equal(bypassed.ok, true);
    const stillOpen = await startDemoGame(requestFrom(ip));
    assert.equal(stillOpen.ok, true);
    if (!stillOpen.ok || !bypassed.ok) return;
    const cookie = stillOpen.cookies.map((item) => item.split(";")[0]).join("; ");
    const blocked = await startDemoGame(requestFrom(ip, cookie));
    assert.equal(blocked.ok, false);
    const again = await startDemoGame(new Request("http://localhost/api/games/start", {
      method: "POST",
      headers: { ...bypassHeaders, cookie },
    }));
    assert.equal(again.ok, true);
    if (!again.ok) return;
    const chat = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "x-demo-game-token": again.gameToken,
        "x-forwarded-for": ip,
        [TESTER_TOKEN_HEADER]: "qa-secret",
      },
    });
    assert.equal((await consumeDemoLlmCall(chat, LLM_CALLS_PER_GAME)).ok, true);
    const capped = await consumeDemoLlmCall(chat, 1);
    assert.equal(capped.ok, false);
    if (!capped.ok) assert.equal(capped.message, MSG_LLM_CAP);
    const wrong = await startDemoGame(new Request("http://localhost/api/games/start", {
      method: "POST",
      headers: { "x-forwarded-for": ip, [TESTER_TOKEN_HEADER]: "wrong", cookie },
    }));
    assert.equal(wrong.ok, false);
    delete process.env.RATE_LIMIT_BYPASS_TOKEN;
    const unset = await startDemoGame(new Request("http://localhost/api/games/start", {
      method: "POST",
      headers: { ...bypassHeaders, cookie },
    }));
    assert.equal(unset.ok, false);
  } finally {
    delete process.env.DAILY_GAME_LIMIT;
    delete process.env.RATE_LIMIT_BYPASS_TOKEN;
  }
});

test("?tester= 会保存，并在开局请求里带上同一个 header", async () => {
  const values = new Map<string, string>();
  let href = "http://localhost/?tester=qa-secret&stay=1";
  const fakeWindow = {
    location: { href },
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
    history: {
      replaceState: (_state: unknown, _title: string, next: string) => {
        href = next;
        fakeWindow.location.href = next;
      },
    },
  };
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  const originalFetch = globalThis.fetch;
  let sent = "";
  globalThis.fetch = async (_input, init) => {
    sent = new Headers(init?.headers).get(TESTER_TOKEN_HEADER) || "";
    return new Response(JSON.stringify({ gameToken: "game", remaining: 3 }), { status: 200 });
  };
  try {
    captureTesterTokenFromLocation();
    assert.equal(values.get("last_human_tester_token"), "qa-secret");
    assert.equal(fakeWindow.location.href.includes("tester="), false);
    assert.equal(fakeWindow.location.href.includes("stay=1"), true);
    assert.equal(getTesterToken(), "qa-secret");
    const reserved = await reservePublicGame();
    assert.equal(reserved.ok, true);
    assert.equal(sent, "qa-secret");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
