import type { Alignment, GameState, Role } from "@/types/game";

/** The only public board: 2 wolves, seer, witch, 2 villagers. */
export const SIX_PLAYER_COUNT = 6;

const GOD_ROLES = new Set<Role>(["Seer", "Witch"]);

export function isSixPlayerGame(state: { players: readonly unknown[] }): boolean {
  return state.players.length === SIX_PLAYER_COUNT;
}

/** Day 1 still has a sheriff election on larger boards. Six-player games skip it. */
export function shouldRunSheriffElection(state: {
  day: number;
  players: readonly unknown[];
  badge: { holderSeat: number | null };
}): boolean {
  return state.day === 1 && state.badge.holderSeat === null && !isSixPlayerGame(state);
}

/**
 * 屠边. Good wins when every wolf is out. Wolves win when every villager
 * is out, or when both gods (seer and witch) are out.
 */
export function checkSideKillWin(state: GameState): Alignment | null {
  const alive = state.players.filter((player) => player.alive);
  const aliveWolves = alive.filter((player) => player.alignment === "wolf");
  if (state.players.some((player) => player.alignment === "wolf") && aliveWolves.length === 0) {
    return "village";
  }

  const hadVillagers = state.players.some((player) => player.role === "Villager");
  const aliveVillagers = alive.filter((player) => player.role === "Villager");
  if (hadVillagers && aliveVillagers.length === 0) return "wolf";

  const hadGods = state.players.some((player) => GOD_ROLES.has(player.role));
  const aliveGods = alive.filter((player) => GOD_ROLES.has(player.role));
  if (hadGods && aliveGods.length === 0) return "wolf";

  return null;
}

type WitchSaveState = {
  day: number;
  roleAbilities: { witchHealUsed: boolean };
  nightActions: { witchPoison?: number };
};

/** Antidote is legal only when a wolf target exists, the potion is unused, and self-save is night 1. */
export function canWitchSave(state: WitchSaveState, witchSeat: number, wolfTarget: number | undefined): boolean {
  if (state.roleAbilities.witchHealUsed) return false;
  if (wolfTarget === undefined) return false;
  if (state.nightActions.witchPoison !== undefined) return false;
  if (wolfTarget === witchSeat && state.day > 1) return false;
  return true;
}

/** Poison cannot be used on a night the antidote was already used. */
export function canWitchPoison(state: {
  roleAbilities: { witchPoisonUsed: boolean };
  nightActions: { witchSave?: boolean };
}): boolean {
  if (state.roleAbilities.witchPoisonUsed) return false;
  if (state.nightActions.witchSave === true) return false;
  return true;
}

export function isWolfNightResolved(night: { wolfTarget?: number; wolfSkipped?: boolean }): boolean {
  return night.wolfSkipped === true || night.wolfTarget !== undefined;
}

/** First-night deaths and daytime exiles get last words. Later night deaths do not. */
export function nightDeathHasLastWords(day: number): boolean {
  return day === 1;
}

export type TieResolution = "pk" | "no-elimination";

/** A fresh tie goes to one PK speech each. A tie after that PK eliminates nobody. */
export function resolveTiedVote(topSeatCount: number, alreadyInVotePk: boolean): TieResolution {
  if (topSeatCount > 1 && !alreadyInVotePk) return "pk";
  return "no-elimination";
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Peaceful mornings start at a stable random alive seat, not always seat 1. */
export function pickPeacefulSpeechStart(aliveSeats: number[], gameId: string, day: number): number | null {
  if (aliveSeats.length === 0) return null;
  const sorted = [...aliveSeats].sort((a, b) => a - b);
  return sorted[hashString(`${gameId}:${day}:speech`) % sorted.length];
}
