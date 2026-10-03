import assert from "node:assert/strict";
import test from "node:test";
import type { GameState } from "@/types/game";
import { phaseBarDayChip, phaseBarStatus } from "./phase-bar-copy";

function state(partial: Partial<GameState>): GameState {
  return {
    gameId: "phase-bar",
    phase: "DAY_SPEECH",
    day: 1,
    difficulty: "normal",
    players: [
      {
        playerId: "p0",
        seat: 0,
        displayName: "你",
        alive: true,
        role: "Villager",
        alignment: "village",
        isHuman: true,
      },
      {
        playerId: "p2",
        seat: 2,
        displayName: "老汉斯",
        alive: true,
        role: "Werewolf",
        alignment: "wolf",
        isHuman: false,
      },
    ],
    events: [],
    messages: [],
    currentSpeakerSeat: 2,
    daySpeechStartSeat: 0,
    badge: { holderSeat: 2, candidates: [], signup: {}, votes: {}, allVotes: {}, history: {}, revoteCount: 0, electionWinners: { 1: 2 } },
    votes: {},
    voteHistory: {},
    dailySummaries: {},
    dailySummaryFacts: {},
    dailySummaryVoteData: {},
    nightActions: {},
    roleAbilities: {
      witchHealUsed: false,
      witchPoisonUsed: false,
      hunterCanShoot: true,
      idiotRevealed: false,
      whiteWolfKingBoomUsed: false,
    },
    winner: null,
    ...partial,
  };
}

test("警长投票刚结束不会闪出警长移交警徽", () => {
  const copy = phaseBarStatus(state({ phase: "BADGE_TRANSFER", day: 1 }), false);
  assert.equal(copy.includes("移交警徽"), false);
  assert.equal(copy, "天亮了，正在公布昨夜结果");
});

test("夜晚状态条的日夜标记跟阶段走", () => {
  const chip = phaseBarDayChip("NIGHT_START", 1);
  assert.equal(chip.night, true);
  assert.equal(chip.label, "第 1 天 · 夜晚");
  assert.equal(phaseBarStatus(state({ phase: "NIGHT_START", day: 1 }), false), "夜晚 · 其他玩家正在行动");
  assert.equal(phaseBarDayChip("DAY_SPEECH", 1).label, "第 1 天 · 白天");
  assert.equal(phaseBarDayChip("DAY_SPEECH", 1).night, false);
});

test("夜晚不是本人行动时不写出具体身份阶段", () => {
  for (const phase of ["NIGHT_START", "NIGHT_GUARD_ACTION", "NIGHT_WOLF_ACTION", "NIGHT_WITCH_ACTION", "NIGHT_SEER_ACTION"] as const) {
    const copy = phaseBarStatus(state({ phase }), false);
    assert.equal(copy, "夜晚 · 其他玩家正在行动");
    assert.equal(/预言家|女巫|守卫|狼人/.test(copy), false);
  }
});

test("白天发言条带座位和名字", () => {
  assert.equal(phaseBarStatus(state({ phase: "DAY_SPEECH" }), false), "3号 · 老汉斯 正在发言");
});

test("等待发言时相位条显示正在思考", () => {
  assert.equal(phaseBarStatus(state({ phase: "DAY_SPEECH" }), false, true), "3号 · 老汉斯 正在思考…");
  assert.equal(phaseBarStatus(state({ phase: "DAY_SPEECH" }), true, true), "3号 · 老汉斯 正在发言");
});
