export type QuotaSnapshot = {
  remaining: number;
  limit: number;
  unlimited: boolean;
};

export function isQuotaSpent(quota: QuotaSnapshot | null | undefined): boolean {
  if (!quota || quota.unlimited) return false;
  return quota.remaining <= 0;
}

/** Visible Chinese line when the daily cap is used up. The limit is the real cap, not a hardcoded 3. */
export function quotaSpentCopy(limit: number): string {
  return `今天的 ${limit} 局已用完，明天再来`;
}

export type NameFieldEnterAction = "hint-seal";

/**
 * Enter in the name field never starts a game.
 * On a desktop pointer it only flashes the wax seal so the player presses it.
 */
export function nameFieldEnterAction(isCoarsePointer: boolean): NameFieldEnterAction | null {
  if (isCoarsePointer) return null;
  return "hint-seal";
}
