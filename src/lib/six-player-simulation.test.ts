import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";
import type { GameState, Role } from "@/types/game";

process.env.ZENMUX_API_KEY ||= "test-zenmux-key";
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "six-player-sim-key";
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

setLocale("zh");

const ROLES: Role[] = ["Villager", "Werewolf", "Seer", "Witch", "Villager", "Werewolf"];

function completion(content: string) {
  return Response.json({
    id: "six-player-sim",
    choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
  });
}

async function withScripts(scripts: string[], run: () => Promise<void>) {
  const queue = [...scripts];
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("demo-config")) return Response.json({ active: false, enabled: false });
    if (url.includes("/api/chat")) {
      const next = queue.shift();
      if (!next) throw new Error(`unexpected chat call ${url}`);
      return completion(next);
    }
    return Response.json({});
  };
  try {
    await run();
    assert.equal(queue.length, 0, "scripted model replies were not all consumed");
  } finally {
    globalThis.fetch = original;
  }
}

async function makeState(): Promise<GameState> {
  const { PLAYER_MODELS } = await import("@/types/game");
  const { createInitialGameState, setupPlayers } = await import("./game-master");
  const character = {
    displayName: "村民",
    persona: { styleLabel: "calm", voiceRules: [] as string[], mbti: "INTJ", gender: "female" as const, age: 28 },
  };
  const players = setupPlayers(
    Array.from({ length: 6 }, () => character),
    0,
    "你",
    6,
    ROLES,
    undefined,
    PLAYER_MODELS,
  );
  const state = createInitialGameState();
  state.players = players;
  state.day = 1;
  state.phase = "NIGHT_WOLF_ACTION";
  return state;
}

function kill(state: GameState, seat: number) {
  const player = state.players.find((item) => item.seat === seat);
  if (player) player.alive = false;
}

async function runNight(state: GameState, wolfDisplaySeat: number, witch: "save" | "pass") {
  const { generateWolfAction, generateWitchAction, generateSeerAction } = await import("./game-master");
  const wolves = state.players.filter((player) => player.role === "Werewolf" && player.alive && !player.isHuman);
  let target: number | undefined;
  for (const wolf of wolves) {
    target = await generateWolfAction(state, wolf);
    assert.equal(typeof target, "number");
  }
  state.nightActions = { ...state.nightActions, wolfTarget: target, wolfSkipped: false };
  const witchPlayer = state.players.find((player) => player.role === "Witch" && player.alive && !player.isHuman);
  if (witchPlayer) {
    const action = await generateWitchAction(state, witchPlayer, target);
    if (action.type === "save") {
      state.nightActions.witchSave = true;
      state.roleAbilities.witchHealUsed = true;
    }
  }
  const seer = state.players.find((player) => player.role === "Seer" && player.alive && !player.isHuman);
  if (seer) await generateSeerAction(state, seer);
  if (target !== undefined && !state.nightActions.witchSave) kill(state, target);
  assert.equal(target, wolfDisplaySeat - 1);
  assert.equal(witch === "save" ? state.nightActions.witchSave : !state.nightActions.witchSave, true);
}

test("模拟 6 人局：好人屠边、平民全灭、神职全灭", async () => {
  const { checkWinCondition, generateAIVote, tallyVotes } = await import("./game-master");

  await withScripts(
    [
      '{"seat":1}', '{"seat":1}', '{"action":"save"}', '{"seat":2}',
      '{"analysis":"a","seat":5,"reason":"狼","suspects":[{"seat":2,"score":60}]}',
      '{"analysis":"a","seat":2,"reason":"预言家","suspects":[{"seat":2,"score":80}]}',
      '{"analysis":"a","seat":2,"reason":"女巫","suspects":[{"seat":2,"score":70}]}',
      '{"analysis":"a","seat":2,"reason":"平民","suspects":[{"seat":2,"score":55}]}',
      '{"analysis":"a","seat":5,"reason":"狼","suspects":[{"seat":5,"score":40}]}',
      '{"seat":5}', '{"action":"pass"}', '{"seat":3}',
      '{"analysis":"a","seat":6,"reason":"预言家","suspects":[{"seat":6,"score":90}]}',
      '{"analysis":"a","seat":6,"reason":"女巫","suspects":[{"seat":6,"score":75}]}',
      '{"analysis":"a","seat":1,"reason":"狼","suspects":[{"seat":1,"score":30}]}',
    ],
    async () => {
      const state = await makeState();
      await runNight(state, 1, "save");
      assert.equal(state.players.every((player) => player.alive), true);
      state.phase = "DAY_VOTE";
      state.votes = {};
      for (const player of state.players.filter((item) => item.alive && !item.isHuman)) {
        const vote = await generateAIVote(state, player);
        state.votes[player.playerId] = vote.seat;
        state.suspicionLog = [...(state.suspicionLog ?? []), {
          day: state.day,
          round: 0,
          voterId: player.playerId,
          voterSeat: player.seat,
          voteSeat: vote.seat,
          reason: vote.reason,
          suspects: vote.suspects,
        }];
      }
      const human = state.players.find((player) => player.isHuman)!;
      state.votes[human.playerId] = 1;
      assert.equal(tallyVotes(state)?.seat, 1);
      kill(state, 1);
      assert.equal(checkWinCondition(state), null);

      state.day = 2;
      state.nightActions = {};
      await runNight(state, 5, "pass");
      assert.equal(state.players.find((player) => player.seat === 4)?.alive, false);
      state.phase = "DAY_VOTE";
      state.votes = {};
      for (const player of state.players.filter((item) => item.alive && !item.isHuman)) {
        const vote = await generateAIVote(state, player);
        state.votes[player.playerId] = vote.seat;
      }
      state.votes[human.playerId] = 5;
      assert.equal(tallyVotes(state)?.seat, 5);
      kill(state, 5);
      assert.equal(checkWinCondition(state), "village");
      assert.ok((state.suspicionLog ?? []).length >= 5);
    },
  );

  await withScripts(
    ['{"seat":5}', '{"seat":5}', '{"action":"pass"}', '{"seat":2}', '{"seat":1}', '{"seat":1}', '{"action":"pass"}', '{"seat":3}'],
    async () => {
      const state = await makeState();
      await runNight(state, 5, "pass");
      state.day = 2;
      state.nightActions = {};
      await runNight(state, 1, "pass");
      assert.equal(checkWinCondition(state), "wolf");
      assert.equal(state.players.filter((player) => player.role === "Villager" && player.alive).length, 0);
    },
  );

  await withScripts(
    ['{"seat":3}', '{"seat":3}', '{"action":"pass"}', '{"seat":2}', '{"seat":4}', '{"seat":4}', '{"action":"pass"}'],
    async () => {
      const state = await makeState();
      await runNight(state, 3, "pass");
      state.day = 2;
      state.nightActions = {};
      await runNight(state, 4, "pass");
      assert.equal(checkWinCondition(state), "wolf");
      assert.equal(state.players.filter((player) => (player.role === "Seer" || player.role === "Witch") && player.alive).length, 0);
    },
  );
});

test("AI 狼人解析失败也不会空刀", async () => {
  await withScripts(['not-json'], async () => {
    const { generateWolfAction } = await import("./game-master");
    const state = await makeState();
    const wolf = state.players.find((player) => player.role === "Werewolf" && !player.isHuman)!;
    const seat = await generateWolfAction(state, wolf);
    assert.equal(typeof seat, "number");
    assert.notEqual(seat, wolf.seat);
  });
});

test("第二夜女巫刀口是自己时，提示词不提供解药", async () => {
  const state = await makeState();
  state.day = 2;
  state.phase = "NIGHT_WITCH_ACTION";
  const witch = state.players.find((player) => player.role === "Witch")!;
  const { PhaseManager } = await import("@/game/core/PhaseManager");
  const prompt = new PhaseManager().getPrompt(
    "NIGHT_WITCH_ACTION",
    { state, extras: { wolfTarget: witch.seat } },
    witch,
  );
  assert.ok(prompt);
  const full = `${prompt!.system}\n${prompt!.user}`;
  assert.match(full, /只有第一夜可以自救/);
  assert.doesNotMatch(full, /可以使用解药/);
});
