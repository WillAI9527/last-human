import assert from "node:assert/strict";
import test from "node:test";
import { setLocale } from "@/i18n/locale-store";
import type { GameState, Player, Role } from "@/types/game";
import { createInitialGameState } from "./game-master";
import { getWinCondition } from "./prompt-utils";
import {
  canWitchPoison,
  canWitchSave,
  checkSideKillWin,
  isWolfNightResolved,
  nightDeathHasLastWords,
  pickPeacefulSpeechStart,
  resolveTiedVote,
  shouldRunSheriffElection,
} from "./six-player-rules";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "six-player-rules-key";

const ROLES: Role[] = ["Werewolf", "Werewolf", "Seer", "Witch", "Villager", "Villager"];

function board(alive: boolean[]): GameState {
  const state = createInitialGameState();
  state.players = ROLES.map((role, seat): Player => ({
    playerId: `p${seat}`,
    seat,
    displayName: `玩家${seat + 1}`,
    alive: alive[seat] ?? true,
    role,
    alignment: role === "Werewolf" ? "wolf" : "village",
    isHuman: seat === 4,
  }));
  state.day = 1;
  return state;
}

test("屠边：两狼出局好人胜，平民全灭或神职全灭狼人胜", () => {
  assert.equal(checkSideKillWin(board([false, false, true, true, true, true])), "village");
  assert.equal(checkSideKillWin(board([true, true, true, true, false, false])), "wolf");
  assert.equal(checkSideKillWin(board([true, true, false, false, true, true])), "wolf");
  assert.equal(checkSideKillWin(board([true, false, true, true, true, false])), null);
});

test("非 6 人局仍用狼人数不少于好人", async () => {
  const { checkWinCondition } = await import("./game-master");
  const state = board([true, true, true, true, true, true]);
  state.players = state.players.slice(0, 4);
  state.players[2].alive = false;
  state.players[3].alive = false;
  assert.equal(checkWinCondition(state), "wolf");
  assert.equal(checkWinCondition(board([false, false, true, true, true, true])), "village");
});

test("女巫仅第一夜可自救，同一晚不能两瓶", () => {
  const night1 = { day: 1, roleAbilities: { witchHealUsed: false }, nightActions: {} };
  assert.equal(canWitchSave(night1, 3, 3), true);
  assert.equal(canWitchSave({ ...night1, day: 2 }, 3, 3), false);
  assert.equal(canWitchSave({ ...night1, day: 2 }, 3, 1), true);
  assert.equal(canWitchSave({ ...night1, nightActions: { witchPoison: 1 } }, 3, 4), false);
  assert.equal(canWitchPoison({ roleAbilities: { witchPoisonUsed: false }, nightActions: { witchSave: true } }), false);
  assert.equal(canWitchPoison({ roleAbilities: { witchPoisonUsed: false }, nightActions: {} }), true);
});

test("平票先 PK，PK 后再平则平安日", () => {
  assert.equal(resolveTiedVote(2, false), "pk");
  assert.equal(resolveTiedVote(2, true), "no-elimination");
  assert.equal(resolveTiedVote(1, false), "no-elimination");
});

test("空刀算狼人夜已结算，第一夜死亡有遗言", () => {
  assert.equal(isWolfNightResolved({ wolfSkipped: true }), true);
  assert.equal(isWolfNightResolved({}), false);
  assert.equal(isWolfNightResolved({ wolfTarget: 2 }), true);
  assert.equal(nightDeathHasLastWords(1), true);
  assert.equal(nightDeathHasLastWords(2), false);
});

test("6 人局不竞选警长，狼人胜负文案是屠边", () => {
  const state = board([true, true, true, true, true, true]);
  assert.equal(shouldRunSheriffElection({ day: 1, players: state.players, badge: { holderSeat: null } }), false);
  assert.equal(shouldRunSheriffElection({ day: 1, players: state.players.slice(0, 5), badge: { holderSeat: null } }), true);
  setLocale("zh");
  assert.match(getWinCondition("Werewolf", 6), /屠边/);
  assert.match(getWinCondition("Witch", 6), /只有第一夜可以救自己/);
  assert.doesNotMatch(getWinCondition("Werewolf", 12), /屠边/);
});

test("无人死亡时的发言起点由对局和天数决定，不总是 1 号", () => {
  const first = pickPeacefulSpeechStart([0, 1, 2, 3, 4], "game-a", 1);
  assert.equal(pickPeacefulSpeechStart([0, 1, 2, 3, 4], "game-a", 1), first);
  const seats = new Set([0, 1, 2, 3, 4].map((day) => pickPeacefulSpeechStart([0, 1, 2, 3, 4], `game-${day}`, day)));
  assert.ok(seats.size > 1);
});
