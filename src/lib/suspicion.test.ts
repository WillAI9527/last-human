import assert from "node:assert/strict";
import test from "node:test";
import { createSinglePlayerContextAuditState } from "../../scripts/single-player-context-audit";
import { setLocale } from "@/i18n/locale-store";
import type { GameState, Phase } from "@/types/game";
import {
  appendSuspicion,
  buildSuspicionReview,
  parseSuspects,
  suspicionSchemaProperty,
  type SuspicionEntry,
} from "./suspicion";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "suspicion-test-key";

const entry = (p: Partial<SuspicionEntry>): SuspicionEntry => ({
  day: 1, round: 0, voterId: "p1", voterSeat: 0, voteSeat: 4, reason: "r", suspects: [], ...p,
});

test("schema：候选座位按显示座位号输出，最多 2 人，score 0–100", () => {
  const s = suspicionSchemaProperty([1, 4, 6]).suspects;
  assert.equal(s.maxItems, 2);
  assert.deepEqual(s.items.properties.seat.enum, [2, 5, 7]);
  assert.equal(s.items.properties.score.maximum, 100);
});

test("解析：转内部座位、夹分、去自己/去重/去非法、降序取前 2", () => {
  const got = parseSuspects(
    [
      { seat: 5, score: 80 },
      { seat: "3", score: "140" },
      { seat: 1, score: 99 }, // 投票者自己（内部 0）
      { seat: 5, score: 10 }, // 重复
      { seat: 12, score: 50 }, // 不在候选
      { seat: 7, score: -5 },
      "garbage",
    ],
    [2, 4, 6],
    0
  );
  assert.deepEqual(got, [{ seat: 2, score: 100 }, { seat: 4, score: 80 }]);
});

test("解析：任何坏输入都返回空数组，不抛错", () => {
  for (const bad of [undefined, null, "x", 42, {}, [null], [{ seat: "a", score: 1 }]]) {
    assert.deepEqual(parseSuspects(bad, [1, 2], 0), []);
  }
});

test("追加：同一 day/round/voter 覆盖，不同轮次保留", () => {
  let log = appendSuspicion(undefined, entry({ suspects: [{ seat: 4, score: 60 }] }));
  log = appendSuspicion(log, entry({ suspects: [{ seat: 4, score: 70 }] }));
  log = appendSuspicion(log, entry({ round: 1, suspects: [{ seat: 4, score: 90 }] }));
  assert.equal(log.length, 2);
  assert.equal(log[0].suspects[0].score, 70);
});

test("复盘：非 GAME_END 一律返回 null", () => {
  const log = [entry({ suspects: [{ seat: 6, score: 50 }] })];
  for (const phase of ["DAY_SPEECH", "DAY_VOTE", "NIGHT_START", "DAY_RESOLVE"]) {
    assert.equal(buildSuspicionReview(log, phase, 6), null);
  }
});

test("复盘：曲线未入榜记 0，focus 给出谁在何时怀疑真人", () => {
  const log = [
    entry({ day: 1, voterId: "a", voterSeat: 0, suspects: [{ seat: 6, score: 30 }] }),
    entry({ day: 2, voterId: "a", voterSeat: 0, suspects: [{ seat: 3, score: 70 }] }),
    entry({ day: 3, voterId: "a", voterSeat: 0, suspects: [{ seat: 6, score: 90 }] }),
    entry({ day: 2, voterId: "b", voterSeat: 1, suspects: [{ seat: 6, score: 55 }] }),
  ];
  const r = buildSuspicionReview(log, "GAME_END", 6)!;
  assert.deepEqual(r.voters[0].curveBySeat[6].map((p) => p.score), [30, 0, 90]);
  assert.deepEqual(r.focus.map((f) => [f.day, f.voterSeat, f.score]), [[1, 0, 30], [2, 1, 55], [3, 0, 90]]);
});

// —— 信息隔离：游戏进行中任何 AI prompt 都不能出现怀疑记录 ——
const MARKER = "心声泄漏标记XYZ";
const withLog = (phase: Phase): GameState => {
  const state = createSinglePlayerContextAuditState();
  state.phase = phase;
  (state as GameState & { suspicionLog: SuspicionEntry[] }).suspicionLog = state.players.map((p, i) =>
    entry({ voterId: p.playerId, voterSeat: p.seat, reason: MARKER, suspects: [{ seat: (i + 1) % state.players.length, score: 97 }] })
  );
  return state;
};

for (const locale of ["zh", "en"] as const) {
  test(`隔离：${locale} 所有阶段、所有 AI 的 prompt 都不含 suspicionLog`, async () => {
    await import("@/lib/game-master");
    const { PhaseManager } = await import("@/game/core/PhaseManager");
    setLocale(locale);
    try {
      const phases: Phase[] = [
        "NIGHT_GUARD_ACTION", "NIGHT_WOLF_ACTION", "NIGHT_WITCH_ACTION", "NIGHT_SEER_ACTION",
        "DAY_BADGE_SPEECH", "DAY_SPEECH", "DAY_LAST_WORDS", "DAY_VOTE", "HUNTER_SHOOT",
      ] as Phase[];
      let checked = 0;
      for (const phase of phases) {
        const state = withLog(phase);
        for (const actor of state.players.filter((p) => !p.isHuman)) {
          let prompt: { system: string; user: string } | null | undefined;
          try { prompt = new PhaseManager().getPrompt(phase, { state }, actor); } catch { continue; }
          if (!prompt) continue;
          const full = `${prompt.system}\n${prompt.user}`;
          assert.ok(!full.includes(MARKER), `${phase} ${actor.seat + 1}号 泄漏了心声理由`);
          assert.doesNotMatch(full, /suspicionLog|"score"\s*:\s*97/, `${phase} ${actor.seat + 1}号 泄漏了怀疑度`);
          checked++;
        }
      }
      assert.ok(checked > 0, "至少要检查到一个 prompt");
    } finally { setLocale("zh"); }
  });
}
