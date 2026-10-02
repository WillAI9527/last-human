import type { Phase } from "@/types/game";

const OPEN_VOTE_PHASES = new Set<Phase>(["DAY_VOTE", "DAY_BADGE_ELECTION"]);

/**
 * The seat the human has voted for, while that vote is still unrevealed.
 * Reads only the human's own ballot. Other players' votes are ignored.
 */
export function humanUnrevealedVoteSeat(
  phase: Phase,
  humanPlayerId: string | undefined,
  dayVotes: Record<string, number> | undefined,
  badgeVotes: Record<string, number> | undefined,
): number | null {
  if (!humanPlayerId || !OPEN_VOTE_PHASES.has(phase)) return null;
  const ballots = phase === "DAY_BADGE_ELECTION" ? badgeVotes : dayVotes;
  const seat = ballots?.[humanPlayerId];
  if (typeof seat !== "number" || seat < 0) return null;
  return seat;
}
