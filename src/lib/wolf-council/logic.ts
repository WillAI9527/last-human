import type { AppLocale } from "@/i18n/config";
import { replyNotices, type Board, type Wolf } from "./data";

export const MIN_WOLVES = 2;
export const MAX_WOLVES = 5;

export const STANCES: Record<AppLocale, [string, string, string]> = {
  zh: ["支持", "反对", "有条件支持"],
  en: ["Support", "Oppose", "Conditional support"],
};

export function seatedIndexes(selected: boolean[]): number[] {
  return selected.flatMap((on, index) => (on ? [index] : []));
}

export function toggleWolf(selected: boolean[], index: number): { selected: boolean[]; rejected: boolean } {
  const count = selected.filter(Boolean).length;
  if (selected[index] && count <= MIN_WOLVES) return { selected, rejected: true };
  const next = selected.slice();
  next[index] = !next[index];
  return { selected: next, rejected: false };
}

export function adviceLines(
  wolf: Wolf,
  locale: AppLocale,
  previousLabel: string | null,
  stance: number,
): [string, string, string] {
  const opening = previousLabel
    ? wolf.mock.reply[locale].replaceAll("{prev}", previousLabel)
    : wolf.mock.open[locale];
  const reason = wolf.mock.reason[locale][stance] ?? wolf.mock.reason[locale][0] ?? "";
  const stanceWord = STANCES[locale][stance] ?? STANCES[locale][0];
  const voteLine = locale === "zh"
    ? `投票：${stanceWord} —— ${reason}`
    : `Vote: ${stanceWord} — ${reason}`;
  return [opening, wolf.mock.point[locale], voteLine];
}

export function voteSentence(locale: AppLocale, suggestionNumber: number, label: string): string {
  return locale === "zh"
    ? `我把票投给建议 #${suggestionNumber}（${label}）。`
    : `I vote for suggestion #${suggestionNumber} (${label}).`;
}

export function tally(seated: number[], votes: Array<number | null>): { counts: number[]; top: number } {
  const counts = seated.map((seat) => votes.filter((vote) => vote === seat).length);
  let best = 0;
  counts.forEach((count, index) => {
    if (count > counts[best]) best = index;
  });
  return { counts, top: best };
}

export function stanceRoll(random: () => number): number {
  return [0, 0, 2, 2, 1][Math.floor(random() * 5)] ?? 0;
}

export function parseStance(text: string, locale: AppLocale): number | null {
  const last = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop() ?? "";
  const order = [2, 1, 0];
  for (const index of order) {
    const word = STANCES[locale][index];
    if (word && last.includes(word)) return index;
  }
  return null;
}

export function suggestionLine(text: string, fallback: string): string {
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  return lines[1] || lines[0] || fallback;
}

export function reviewBadge(attempts: number, passed: boolean, checkCount: number): "pass" | "fixed" | "fail" | "none" {
  if (checkCount <= 0) return "none";
  if (passed && attempts > 0) return "fixed";
  if (passed) return "pass";
  return "fail";
}

export function visibleDisclaimer(wolf: Wolf, board: Board, locale: AppLocale): { disclaimer: string; crisis: string } {
  return replyNotices(wolf, board, locale);
}
