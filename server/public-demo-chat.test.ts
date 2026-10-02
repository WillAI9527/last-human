import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

process.env.ZENMUX_API_KEY = "test-zenmux-key";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TOKENDANCE_API_KEY;
delete process.env.DASHSCOPE_API_KEY;

test("聊天路由在没有 Supabase 时把请求送到 ZenMux", async () => {
  const { POST: startGame } = await import("@/app/api/games/start/route");
  const { POST: chat } = await import("@/app/api/chat/route");
  const started = await startGame(new Request("http://localhost/api/games/start", {
    method: "POST",
    headers: { "x-forwarded-for": "198.51.100.40" },
  }));
  assert.equal(started.status, 200);
  const startBody = await started.json() as { gameToken: string };

  const originalFetch = globalThis.fetch;
  let upstream = "";
  globalThis.fetch = async (input) => {
    upstream = String(input);
    assert.equal(upstream.includes("tokendance"), false);
    assert.match(upstream, /zenmux\.ai/);
    return new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "{\"seat\":2}" }, finish_reason: "stop" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const response = await chat(new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.40",
        "x-demo-game-token": startBody.gameToken,
      },
      body: JSON.stringify({
        model: "minimax/minimax-m2.1",
        provider: "zenmux",
        messages: [{ role: "user", content: "ping" }],
      }),
    }));
    assert.equal(response.status, 200);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    assert.match(body.choices?.[0]?.message?.content || "", /seat/);
    const missing = await chat(new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "deepseek/deepseek-v3.2", provider: "zenmux", messages: [] }),
    }));
    assert.equal(missing.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("没有 ZenMux Key 时开局接口说明服务器未配置", async () => {
  const previous = process.env.ZENMUX_API_KEY;
  delete process.env.ZENMUX_API_KEY;
  const { POST: startGame } = await import("@/app/api/games/start/route");
  const response = await startGame(new Request("http://localhost/api/games/start", { method: "POST" }));
  assert.equal(response.status, 503);
  const body = await response.json() as { error?: string };
  assert.match(body.error || "", /服务器未配置/);
  if (previous) process.env.ZENMUX_API_KEY = previous;
});
