import type { ModelRef } from "@/types/game";
import { RequestTimeoutError } from "@/lib/request-timeout";

/** First speech attempt is cut here so the backup model still fits in the 45s budget. */
export const SPEECH_MODEL_ATTEMPT_MS = 20_000;

export const PREFERRED_BACKUP_MODEL = "deepseek/deepseek-v3.2";

const SHERIFF_TALK = /警徽流|警长|警徽|警上|警下|上警/;

export function samePlayableModel(a: ModelRef, b: ModelRef): boolean {
  return a.provider === b.provider && a.model === b.model;
}

/** Prefer deepseek-v3.2 when it is not already this seat's model. */
export function pickBackupModel(seat: ModelRef, pool: readonly ModelRef[]): ModelRef | null {
  const preferred = pool.find((model) => model.model === PREFERRED_BACKUP_MODEL && !samePlayableModel(model, seat));
  if (preferred) return preferred;
  return pool.find((model) => !samePlayableModel(model, seat)) ?? null;
}

/** 4xx other than 429 must not be retried on the same model. */
export function isNonRetryableClientStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

export function httpStatusFromError(error: unknown): number | null {
  const text = error instanceof Error ? error.message : String(error);
  const match = text.match(/API error:\s*(\d{3})/) ?? text.match(/\bstatus\s+(\d{3})\b/i);
  if (!match) return null;
  const status = Number(match[1]);
  return Number.isInteger(status) ? status : null;
}

export function speechMentionsSheriff(text: string): boolean {
  return SHERIFF_TALK.test(text);
}

/** Drop any sentence that names the sheriff election. Longer tokens are matched first. */
export function stripSheriffSentences(text: string): string {
  const pieces = text.split(/([。！？!?；;\n]+)/);
  let kept = "";
  for (let i = 0; i < pieces.length; i += 2) {
    const sentence = pieces[i] ?? "";
    const delimiter = pieces[i + 1] ?? "";
    if (!sentence.trim() || speechMentionsSheriff(sentence)) continue;
    kept += sentence + delimiter;
  }
  return kept.replace(/[ \t]+\n/g, "\n").trim();
}

export function stripSheriffFromSegments(segments: readonly string[]): string[] {
  return segments.map((segment) => stripSheriffSentences(segment)).filter((segment) => segment.length > 0);
}

/**
 * Child signal for one model attempt.
 * A timeout aborts only this attempt. The parent 45s signal still bounds the whole speech.
 */
export function linkSpeechAttempt(
  parent: AbortSignal | undefined,
  timeoutMs?: number,
): { signal: AbortSignal | undefined; release: () => void } {
  if (!parent && timeoutMs == null) return { signal: undefined, release: () => {} };
  const timeoutController = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs != null) {
    timer = setTimeout(() => timeoutController.abort(new RequestTimeoutError()), timeoutMs);
  }
  const signal = parent
    ? AbortSignal.any([parent, timeoutController.signal])
    : timeoutController.signal;
  return {
    signal,
    release: () => {
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
