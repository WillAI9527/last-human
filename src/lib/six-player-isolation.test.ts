/**
 * 6 人局信息隔离回归（LAST HUMAN 新增）。
 * 板子：2 狼、预言家、女巫、2 平民；不竞选警长。规则见 /workspace/product/Rules-6P-V0.1.md
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createSinglePlayerContextAuditState } from "../../scripts/single-player-context-audit";
import { setLocale } from "@/i18n/locale-store";
import type { GameState, Phase, Role } from "@/types/game";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||= "six-player-test-key";

// 座位：1号狼 2号预言家 3号狼 4号平民 5号女巫 6号平民（内部 0..5）
export const SIX_ROLES: Role[] = ["Werewolf", "Seer", "Werewolf", "Villager", "Witch", "Villager"];
const WOLVES = [0, 2];
const SEER = 1;
const WITCH = 4;

export function createSixPlayerState(phase: Phase, humanSeat = 3): GameState {
  const base = createSinglePlayerContextAuditState();
  const players = base.players.slice(0, 6).map((p, seat) => ({
    ...p,
    role: SIX_ROLES[seat],
    alignment: (SIX_ROLES[seat] === "Werewolf" ? "wolf" : "village") as "wolf" | "village",
    alive: seat !== 5, // 6号第一夜被刀
    isHuman: seat === humanSeat,
  }));
  return {
    ...base,
    phase,
    day: 2,
    players,
    messages: base.messages.filter((m) => m.isSystem || Number(m.playerId.split("-").pop()) <= 6),
    badge: { ...base.badge, holderSeat: null, candidates: [], history: {}, signup: {}, votes: {}, allVotes: {} },
    voteHistory: { 1: { "audit-player-1": 3, "audit-player-2": 0 } },
    nightHistory: {
      1: { wolfTarget: 5, seerTarget: 0, seerResult: { targetSeat: 0, isWolf: true }, deaths: [{ seat: 5, reason: "wolf" }] },
      2: { wolfTarget: 1, seerTarget: 3, seerResult: { targetSeat: 3, isWolf: false }, deaths: [] },
    },
    dayHistory: {},
    dailySummaries: {},
    dailySummaryFacts: {},
    nightActions: {
      wolfTarget: 1,
      seerTarget: 3,
      seerResult: { targetSeat: 3, isWolf: false },
      seerHistory: [
        { targetSeat: 0, isWolf: true, day: 1 },
        { targetSeat: 3, isWolf: false, day: 2 },
      ],
      pendingWolfVictim: 1,
    },
    roleAbilities: { ...base.roleAbilities, witchHealUsed: false, witchPoisonUsed: false },
  } as GameState;
}

const PHASES: Phase[] = [
  "NIGHT_WOLF_ACTION", "NIGHT_WITCH_ACTION", "NIGHT_SEER_ACTION",
  "DAY_SPEECH", "DAY_LAST_WORDS", "DAY_VOTE",
];

async function promptsFor(phase: Phase, humanSeat = 3) {
  await import("@/lib/game-master");
  const { PhaseManager } = await import("@/game/core/PhaseManager");
  const state = createSixPlayerState(phase, humanSeat);
  const out: Array<{ seat: number; role: Role; full: string }> = [];
  for (const actor of state.players.filter((p) => p.alive && !p.isHuman)) {
    // 夜间阶段只给对应身份出 prompt
    if (phase === "NIGHT_WOLF_ACTION" && actor.role !== "Werewolf") continue;
    if (phase === "NIGHT_WITCH_ACTION" && actor.role !== "Witch") continue;
    if (phase === "NIGHT_SEER_ACTION" && actor.role !== "Seer") continue;
    const extras = phase === "NIGHT_WITCH_ACTION" ? { wolfTarget: 1 } : undefined;
    const p = new PhaseManager().getPrompt(phase, { state, extras } as never, actor);
    if (p) out.push({ seat: actor.seat, role: actor.role, full: `${p.system}\n${p.user}` });
  }
  return out;
}

for (const locale of ["zh", "en"] as const) {
  test(`6人局隔离 ${locale}：狼队友信息只给狼`, async () => {
    setLocale(locale);
    try {
      let wolfSeen = 0;
      for (const phase of PHASES) {
        for (const { seat, full } of await promptsFor(phase)) {
          if (WOLVES.includes(seat)) { if (full.includes("<your_wolf_team>")) wolfSeen++; }
          else assert.ok(!full.includes("<your_wolf_team>"), `${phase} ${seat + 1}号 看到了狼队友`);
        }
      }
      assert.ok(wolfSeen > 0, "狼人自己应能看到队友（夹具有效性）");
    } finally { setLocale("zh"); }
  });

  test(`6人局隔离 ${locale}：查验结果只给预言家`, async () => {
    setLocale(locale);
    try {
      let seerSeen = 0;
      for (const phase of PHASES) {
        for (const { seat, full } of await promptsFor(phase)) {
          if (seat === SEER) { if (full.includes("<your_seer_checks>")) seerSeen++; }
          else assert.ok(!full.includes("<your_seer_checks>"), `${phase} ${seat + 1}号 看到了查验`);
        }
      }
      assert.ok(seerSeen > 0, "预言家应能看到自己的查验（夹具有效性）");
    } finally { setLocale("zh"); }
  });

  test(`6人局隔离 ${locale}：AI 不知道谁是真人（换真人座位，其他 AI 的 prompt 逐字不变）`, async () => {
    setLocale(locale);
    try {
      for (const phase of ["DAY_SPEECH", "DAY_VOTE"] as Phase[]) {
        const a = await promptsFor(phase, 3);
        const b = await promptsFor(phase, 5); // 6号已死，等于“没有活着的真人”
        for (const pa of a) {
          const pb = b.find((x) => x.seat === pa.seat);
          if (pb) assert.equal(pa.full, pb.full, `${phase} ${pa.seat + 1}号 prompt 随真人位置变化`);
        }
      }
    } finally { setLocale("zh"); }
  });

  test(`6人局 ${locale}：没有警长时，白天 prompt 不出现警长持有者`, async () => {
    setLocale(locale);
    try {
      for (const phase of ["DAY_SPEECH", "DAY_VOTE"] as Phase[]) {
        for (const { seat, full } of await promptsFor(phase)) {
          assert.doesNotMatch(full, /警长[是为：:]\s*\d+号|current sheriff is Seat \d+/i, `${phase} ${seat + 1}号 出现了警长`);
        }
      }
    } finally { setLocale("zh"); }
  });
}
