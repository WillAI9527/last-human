/**
 * One structured /api/chat line per provider attempt.
 * Fields are model, provider status (or abort/timeout), elapsed ms, attempt, and call type.
 * Prompt text and credentials never belong in this line.
 */

/** Client speech gives up around 20s and a gameplay call at 45s. Stay inside that. */
export const NORMAL_ATTEMPT_TIMEOUT_MS = 25_000;

export type ChatCallType = "speech" | "vote" | "summary" | "night" | "other";

export type ChatLogStatus = number | "abort" | "timeout";

export type ChatRequestLog = {
  model: string;
  attempt: number;
  callType: ChatCallType;
  startedAt: number;
  logged: boolean;
};

export function normalizeChatCallType(value: unknown): ChatCallType {
  return value === "speech" || value === "vote" || value === "summary" || value === "night"
    ? value
    : "other";
}

export function createChatRequestLog(input: {
  model: string;
  attempt: number;
  callType: ChatCallType;
  startedAt?: number;
}): ChatRequestLog {
  return {
    model: input.model,
    attempt: input.attempt,
    callType: input.callType,
    startedAt: input.startedAt ?? Date.now(),
    logged: false,
  };
}

export function logChatRequest(log: ChatRequestLog, status: ChatLogStatus): void {
  if (log.logged) return;
  log.logged = true;
  console.log(JSON.stringify({
    source: "api/chat",
    model: log.model,
    status,
    elapsedMs: Math.max(0, Date.now() - log.startedAt),
    attempt: log.attempt,
    callType: log.callType,
  }));
}

export type UpstreamAttempt = {
  signal: AbortSignal;
  /** Headers arrived. The attempt timer must not cut a long SSE body. */
  releaseTimer: () => void;
  /** The upstream body is finished, or the attempt failed before that. */
  dispose: () => void;
};

/**
 * Abort the provider fetch when our attempt timer fires, or as soon as the
 * incoming request aborts. The timer reason is "timeout"; the client reason is "abort".
 */
export function openUpstreamAttempt(parent: AbortSignal | undefined, timeoutMs: number): UpstreamAttempt {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort("timeout");
  }, timeoutMs);
  const onParentAbort = () => {
    if (!controller.signal.aborted) controller.abort("abort");
  };
  if (parent) {
    if (parent.aborted) onParentAbort();
    else parent.addEventListener("abort", onParentAbort);
  }
  return {
    signal: controller.signal,
    releaseTimer() {
      clearTimeout(timer);
    },
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    },
  };
}

/** Provider never answered. Our timer is "timeout"; a client disconnect is "abort". */
export function upstreamFailureStatus(signal: AbortSignal | undefined): "timeout" | "abort" {
  return signal?.reason === "timeout" ? "timeout" : "abort";
}
