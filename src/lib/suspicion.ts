/**
 * 村民心声：AI 投票时顺带记录的怀疑度（LAST HUMAN 新增，基于 Wolfcha 修改）。
 *
 * 隔离规则（硬要求）：
 * 1. suspicionLog 只写不读：游戏进行中任何 prompt 构建都不得读取它。
 * 2. 界面只在 GAME_END 之后的复盘页读取（buildSuspicionReview）。
 * 3. 解析失败绝不影响投票本身：拿不到怀疑度就记空数组。
 */

export const SUSPICION_MAX_TARGETS = 2;

export type SuspicionTarget = {
  /** 内部座位号（0 起），与 GameState.players[].seat 一致 */
  seat: number;
  /** 0–100 */
  score: number;
};

export type SuspicionEntry = {
  day: number;
  /** 投票轮次：首轮为 0，PK 轮依次 +1 */
  round: number;
  voterId: string;
  voterSeat: number;
  /** 本票投给谁（内部座位号），弃票为 -1 */
  voteSeat: number;
  /** 公开投票理由（已有字段） */
  reason: string;
  /** 最怀疑的最多 2 人，按 score 降序 */
  suspects: SuspicionTarget[];
};

/**
 * 追加到 day_vote JSON schema properties 里的字段。
 * 放在 seat 之后，避免影响“先 analysis 再落票”的顺序。
 * seat 用显示座位号（1 起），候选范围为全部存活的其他玩家（不限 PK 名单）。
 */
export function suspicionSchemaProperty(candidateSeats: number[]) {
  return {
    suspects: {
      type: "array",
      maxItems: SUSPICION_MAX_TARGETS,
      items: {
        type: "object",
        properties: {
          seat: { type: "integer", enum: candidateSeats.map((s) => s + 1) },
          score: { type: "integer", minimum: 0, maximum: 100 },
        },
        required: ["seat", "score"],
        additionalProperties: false,
      },
    },
  } as const;
}

/** 追加到 DAY_VOTE 提示词输出格式说明里的一句话。 */
export const SUSPICION_PROMPT_LINE_ZH =
  '"suspects": 你此刻最怀疑是狼人的至多 2 名玩家及怀疑程度，例如 [{"seat": 5, "score": 80}, {"seat": 2, "score": 45}]，score 为 0–100 的整数。';
export const SUSPICION_PROMPT_LINE_EN =
  '"suspects": up to 2 players you currently most suspect of being werewolves, with suspicion 0-100, e.g. [{"seat": 5, "score": 80}].';

const toInt = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Math.round(Number(v.trim()));
  return null;
};

/**
 * 宽松解析：任何异常都返回 []，绝不抛错。
 * - 显示座位号转内部座位号，丢弃不在候选内的、投票者自己、重复座位
 * - score 夹到 0–100，按降序取前 2
 */
export function parseSuspects(raw: unknown, candidateSeats: number[], voterSeat: number): SuspicionTarget[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(candidateSeats);
  const seen = new Set<number>();
  const out: SuspicionTarget[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const display = toInt(rec.seat);
    const score = toInt(rec.score);
    if (display === null || score === null) continue;
    const seat = display - 1;
    if (seat === voterSeat || !allowed.has(seat) || seen.has(seat)) continue;
    seen.add(seat);
    out.push({ seat, score: Math.min(100, Math.max(0, score)) });
  }
  return out.sort((a, b) => b.score - a.score || a.seat - b.seat).slice(0, SUSPICION_MAX_TARGETS);
}

/** 纯函数追加，返回新数组；同一 day/round/voter 重复写入时覆盖旧记录（断线重试场景）。 */
export function appendSuspicion(log: SuspicionEntry[] | undefined, entry: SuspicionEntry): SuspicionEntry[] {
  const prev = log ?? [];
  return [
    ...prev.filter((e) => !(e.day === entry.day && e.round === entry.round && e.voterId === entry.voterId)),
    entry,
  ];
}

export type SuspicionReviewPoint = { day: number; round: number; score: number };
export type SuspicionReviewVoter = {
  voterId: string;
  voterSeat: number;
  /** 每一轮投票：投给谁、理由、怀疑名单 */
  rounds: Array<Pick<SuspicionEntry, "day" | "round" | "voteSeat" | "reason" | "suspects">>;
  /** 对某个座位的怀疑度曲线；未进入前 2 名的轮次记 0 */
  curveBySeat: Record<number, SuspicionReviewPoint[]>;
};

/**
 * 复盘页数据。调用方必须保证 phase === "GAME_END"，否则返回 null。
 * focusSeat（通常是真人座位）给出“谁在什么时候怀疑你”的时间线。
 */
export function buildSuspicionReview(
  log: SuspicionEntry[] | undefined,
  phase: string,
  focusSeat?: number
): { voters: SuspicionReviewVoter[]; focus: Array<{ day: number; round: number; voterSeat: number; score: number }> } | null {
  if (phase !== "GAME_END") return null;
  const entries = [...(log ?? [])].sort((a, b) => a.day - b.day || a.round - b.round || a.voterSeat - b.voterSeat);
  const slots = Array.from(new Set(entries.map((e) => `${e.day}:${e.round}`))).map((k) => {
    const [day, round] = k.split(":").map(Number);
    return { day, round };
  });
  const byVoter = new Map<string, SuspicionEntry[]>();
  for (const e of entries) byVoter.set(e.voterId, [...(byVoter.get(e.voterId) ?? []), e]);

  const voters: SuspicionReviewVoter[] = [];
  for (const [voterId, list] of byVoter) {
    const seats = new Set(list.flatMap((e) => e.suspects.map((s) => s.seat)));
    const curveBySeat: Record<number, SuspicionReviewPoint[]> = {};
    for (const seat of seats) {
      curveBySeat[seat] = slots
        .filter((sl) => list.some((e) => e.day === sl.day && e.round === sl.round))
        .map((sl) => {
          const e = list.find((x) => x.day === sl.day && x.round === sl.round)!;
          return { ...sl, score: e.suspects.find((s) => s.seat === seat)?.score ?? 0 };
        });
    }
    voters.push({
      voterId,
      voterSeat: list[0].voterSeat,
      rounds: list.map(({ day, round, voteSeat, reason, suspects }) => ({ day, round, voteSeat, reason, suspects })),
      curveBySeat,
    });
  }
  voters.sort((a, b) => a.voterSeat - b.voterSeat);

  const focus =
    focusSeat === undefined
      ? []
      : entries.flatMap((e) => {
          const hit = e.suspects.find((s) => s.seat === focusSeat);
          return hit ? [{ day: e.day, round: e.round, voterSeat: e.voterSeat, score: hit.score }] : [];
        });

  return { voters, focus };
}
