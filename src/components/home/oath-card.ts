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
 * Enter in the signature field never starts a game.
 * It only flashes the wax seal so the player presses it.
 */
export function nameFieldEnterAction(_isCoarsePointer = false): NameFieldEnterAction {
  return "hint-seal";
}

/** The seal stays solid and unpressable until there is a name and a game left. */
export function isSealDisabled(options: {
  name: string;
  quota: QuotaSnapshot | null | undefined;
  busy?: boolean;
}): boolean {
  if (options.busy) return true;
  if (!options.name.trim()) return true;
  return isQuotaSpent(options.quota);
}

/** How far the cover group must rise so the keyboard does not cover it. */
export function keyboardInset(innerHeight: number, viewportHeight: number, offsetTop: number): number {
  if (!Number.isFinite(innerHeight) || !Number.isFinite(viewportHeight)) return 0;
  const top = Number.isFinite(offsetTop) ? offsetTop : 0;
  return Math.max(0, innerHeight - viewportHeight - top);
}
