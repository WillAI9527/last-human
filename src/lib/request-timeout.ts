export class RequestTimeoutError extends Error {
  constructor(message = "request_timeout") {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

/** Whole daily-summary call, including the one allowed retry. */
export const DAILY_SUMMARY_DEADLINE_MS = 20_000;

/** Speech, vote, and night actions. The budget covers every retry. */
export const GAMEPLAY_CALL_DEADLINE_MS = 45_000;

/** Voice synthesis must finish or be skipped inside the speech wait. */
export const TTS_FETCH_BUDGET_MS = 12_000;

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new RequestTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);

  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

  const timeoutError = new RequestTimeoutError();
  const timeoutId = setTimeout(() => controller.abort(timeoutError), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.reason === timeoutError) throw timeoutError;
    throw error;
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}
