import assert from "node:assert/strict";
import test from "node:test";

process.env.ZENMUX_API_KEY = "test-zenmux-key";
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TOKENDANCE_API_KEY;
delete process.env.DASHSCOPE_API_KEY;

test("模拟模型可以完成守卫行动，且座位模型只走 ZenMux", async () => {
  const { supabase } = await import("@/lib/supabase");
  const session = await supabase.auth.getSession();
  assert.equal(session.data.session, null);

  const { PLAYER_MODELS, SUMMARY_MODEL, REVIEW_MODEL, GENERATOR_MODEL } = await import("@/types/game");
  assert.deepEqual(PLAYER_MODELS.map((model) => `${model.provider}:${model.model}`), [
    "zenmux:deepseek/deepseek-v3.2",
    "zenmux:google/gemini-3.5-flash-lite",
    "zenmux:minimax/minimax-m2.1",
  ]);
  assert.equal(SUMMARY_MODEL, "deepseek/deepseek-v3.2");
  assert.equal(REVIEW_MODEL, "deepseek/deepseek-v3.2");
  assert.equal(GENERATOR_MODEL, "google/gemini-3.5-flash-lite");

  const seenModels = new Set<string>();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/api/demo-config")) {
      return Response.json({
        active: true,
        enabled: true,
        source: "database",
        startsAt: null,
        expiresAt: null,
        serverNow: new Date().toISOString(),
      });
    }
    if (url === "/api/chat") {
      const body = JSON.parse(String(init?.body || "{}")) as { model?: string; provider?: string };
      assert.equal(body.provider, "zenmux");
      assert.ok(body.model?.startsWith("deepseek/") || body.model?.startsWith("google/") || body.model?.startsWith("minimax/"));
      assert.equal(String(body.provider).includes("tokendance"), false);
      if (body.model) seenModels.add(body.model);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("X-Tokendance-Api-Key"), null);
      return Response.json({
        choices: [{ message: { role: "assistant", content: "{\"seat\":2}" }, finish_reason: "stop" }],
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const { setupPlayers, createInitialGameState, generateGuardAction } = await import("@/lib/game-master");
    const character = {
      displayName: "甲",
      persona: { styleLabel: "calm", voiceRules: [], mbti: "INTJ", gender: "female" as const, age: 28 },
    };
    const players = setupPlayers(
      Array.from({ length: 7 }, () => character),
      0,
      "你",
      8,
      ["Villager", "Werewolf", "Villager", "Guard", "Seer", "Witch", "Hunter", "Werewolf"],
      undefined,
      PLAYER_MODELS,
    );
    const guard = players.find((player) => player.role === "Guard");
    assert.ok(guard && !guard.isHuman);
    assert.equal(players.filter((player) => !player.isHuman).every((player) => player.agentProfile?.modelRef.provider === "zenmux"), true);
    const state = createInitialGameState();
    state.players = players;
    state.day = 1;
    state.phase = "NIGHT_GUARD_ACTION";
    const target = await generateGuardAction(state, guard);
    assert.equal(target, 1);
    assert.equal(seenModels.size > 0, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
