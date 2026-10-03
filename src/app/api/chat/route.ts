// Modified by LAST HUMAN demo (fork of oil-oil/wolfcha).
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasAuthorizedActiveGameSession } from "@/lib/api-auth";
import {
  applyRateLimitCookies,
  consumeDemoLlmCall,
  isZenmuxConfigured,
  MSG_SERVER_NOT_CONFIGURED,
} from "@/lib/demo-rate-limit";
import {
  GAME_SESSION_EXPIRED_CODE,
  GAME_SESSION_EXPIRED_MESSAGE,
} from "@/lib/game-session-policy";
import { ALL_MODELS, PROJECT_MODELS } from "@/types/game";
import { randomUUID } from "node:crypto";
import { applyTokenDanceResponseFormat } from "@/lib/tokendance-response-format";
import {
  getConnectedTokenPayApiKey,
  getTokenPayAppUrl,
  getTokenPayGatewayUrl,
  markTokenPayConnectionForReauthorization,
  readTokenPayRecoveryAction,
  TOKENPAY_MODE_HEADER,
  TOKENPAY_RECOVERY_HEADER,
  type TokenPayRecoveryAction,
} from "@/lib/tokenpay";
import { Agent, setGlobalDispatcher } from "undici";
import {
  applyDeepSeekPromptScope,
  type PromptScope,
} from "@/lib/deepseek-prompt-scope";
import { recordGameSessionAiAttempt } from "@/lib/server-game-observability";
import { trackSseAttempt } from "@/lib/sse-attempt-tracker";
import {
  buildTokendanceThinking,
  DECISION_TIMEOUT_MS,
  normalizeReasoningProfile,
  resolveReasoning,
} from "@/lib/reasoning-profile";
import {
  createChatRequestLog,
  extractChatTokenUsage,
  logChatRequest,
  NORMAL_ATTEMPT_TIMEOUT_MS,
  normalizeChatCallType,
  openUpstreamAttempt,
  upstreamFailureStatus,
  type ChatCallType,
  type ChatRequestLog,
} from "@/lib/chat-request-log";

// 9 人完整角色画像的正常流式输出实测可超过 80 秒。未启用 Fluid
// Compute 的 Vercel 项目默认上限可能只有 60 秒，必须显式放宽；这只延长
// HTTP 流的承载时间，不改变模型提示、输出内容或游戏逻辑。
export const maxDuration = 300;

// 将 undici 底层 TCP 连接超时从默认 10s 调高到 60s
// 避免访问国内 API 网关（如 tokendance）时因建连慢而提前失败
setGlobalDispatcher(new Agent({ connectTimeout: 60_000 }));

const ZENMUX_API_URL = "https://zenmux.ai/api/v1/chat/completions";
const DASHSCOPE_API_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DASHSCOPE_CHAT_COMPLETIONS_URL = `${DASHSCOPE_API_BASE_URL}/chat/completions`;

const MAX_BATCH_REQUESTS = 12;

const REQUEST_ID_HEADER = "X-Request-ID";
const ATTEMPT_ID_HEADER = "X-Attempt-ID";
const ATTEMPT_HEADER = "X-Attempt";

type Provider = "zenmux" | "dashscope" | "tokendance";

type AttemptContext = {
  userId: string;
  sessionId: string | null;
  eventId: string;
  requestId: string;
  attempt: number;
  provider: Provider;
  model: string;
  promptScope: PromptScope;
  callType: ChatCallType;
  mode: "completion" | "batch" | "stream";
  startedAt: number;
  inputChars: number;
  log: ChatRequestLog;
};

type AttemptOutcome = "success" | "http_error" | "network_error" | "cancelled" | "interrupted" | "error";

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function stableId(value: unknown): string {
  return isUuid(value) ? value : randomUUID();
}

function positiveAttempt(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function countMessageChars(messages: unknown): number {
  if (!Array.isArray(messages)) return 0;
  return messages.reduce((sum, message) => {
    if (!message || typeof message !== "object") return sum;
    const content = (message as { content?: unknown }).content;
    if (typeof content === "string") return sum + content.length;
    if (!Array.isArray(content)) return sum;
    return sum + content.reduce((partSum, part) => {
      if (!part || typeof part !== "object") return partSum;
      const text = (part as { text?: unknown }).text;
      return partSum + (typeof text === "string" ? text.length : 0);
    }, 0);
  }, 0);
}

function responseUsage(data: unknown): { outputChars?: number; promptTokens?: number; completionTokens?: number } {
  if (!data || typeof data !== "object") return {};
  const response = data as { choices?: unknown; usage?: unknown };
  const usage = response.usage && typeof response.usage === "object"
    ? response.usage as { prompt_tokens?: unknown; completion_tokens?: unknown }
    : undefined;
  const choice = Array.isArray(response.choices) ? response.choices[0] : undefined;
  const message = choice && typeof choice === "object" ? (choice as { message?: unknown }).message : undefined;
  const content = message && typeof message === "object" ? (message as { content?: unknown }).content : undefined;
  return {
    outputChars: typeof content === "string" ? content.length : undefined,
    promptTokens: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
    completionTokens: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : undefined,
  };
}

async function recordAttempt(context: AttemptContext, outcome: AttemptOutcome, extra: {
  httpStatus?: number;
  outputChars?: number;
  promptTokens?: number;
  completionTokens?: number;
  errorCode?: string;
} = {}): Promise<void> {
  // 自定义 Key 可在没有项目会话时用于通用调用；这类调用不属于对局统计。
  if (!context.sessionId) return;
  try {
    await recordGameSessionAiAttempt({
      userId: context.userId,
      sessionId: context.sessionId,
      eventId: context.eventId,
      requestId: context.requestId,
      attempt: context.attempt,
      provider: context.provider,
      model: context.model,
      promptScope: context.promptScope,
      mode: context.mode,
      outcome,
      httpStatus: extra.httpStatus,
      durationMs: Math.max(0, Date.now() - context.startedAt),
      inputChars: context.inputChars,
      outputChars: extra.outputChars ?? 0,
      promptTokens: extra.promptTokens ?? 0,
      completionTokens: extra.completionTokens ?? 0,
      errorCode: extra.errorCode,
    });
  } catch (error) {
    console.error("[api/chat] Failed to record AI attempt", error);
  }
}

function requestSignal(init: RequestInit): AbortSignal | undefined {
  return init.signal instanceof AbortSignal ? init.signal : undefined;
}

async function fetchProvider(url: string, init: RequestInit, context: AttemptContext): Promise<Response> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      logChatRequest(context.log, response.status);
      await recordAttempt(context, "http_error", {
        httpStatus: response.status,
        errorCode: `http_${response.status}`,
      });
    }
    return response;
  } catch (error) {
    const signal = requestSignal(init);
    const status = upstreamFailureStatus(signal);
    logChatRequest(context.log, status);
    const aborted = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    await recordAttempt(context, "network_error", {
      errorCode: status === "timeout" ? "timeout" : aborted ? "aborted" : "network_error",
    });
    throw error;
  }
}

async function readProviderJson(
  response: Response,
  context: AttemptContext,
  signal: AbortSignal,
): Promise<unknown> {
  try {
    const result = await response.json();
    logChatRequest(context.log, response.status, extractChatTokenUsage(result));
    await recordAttempt(context, "success", responseUsage(result));
    return result;
  } catch (error) {
    logChatRequest(context.log, signal.aborted ? upstreamFailureStatus(signal) : response.status);
    await recordAttempt(context, "error", {
      errorCode: signal.aborted
        ? (signal.reason === "timeout" ? "timeout" : "aborted")
        : "invalid_response",
    });
    throw error;
  }
}

type UpstreamCall = {
  response: Response;
  signal: AbortSignal;
  release: () => void;
};

async function fetchUpstream(
  url: string,
  init: Omit<RequestInit, "signal">,
  context: AttemptContext,
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<UpstreamCall> {
  const upstream = openUpstreamAttempt(parentSignal, timeoutMs);
  try {
    const response = await fetchProvider(url, { ...init, signal: upstream.signal }, context);
    upstream.releaseTimer();
    return { response, signal: upstream.signal, release: () => upstream.dispose() };
  } catch (error) {
    upstream.dispose();
    throw error;
  }
}

function releaseAfterAbort(response: Response, signal: AbortSignal, release: () => void): () => void {
  const cancel = () => {
    response.body?.cancel().catch(() => undefined);
  };
  if (signal.aborted) cancel();
  else signal.addEventListener("abort", cancel, { once: true });
  return () => {
    signal.removeEventListener("abort", cancel);
    release();
  };
}

async function trackedStreamResponse(
  response: Response,
  context: AttemptContext,
  onSettled?: () => void,
): Promise<Response> {
  const settle = () => {
    onSettled?.();
  };
  if (!response.body) {
    logChatRequest(context.log, response.status);
    settle();
    await recordAttempt(context, "error", { errorCode: "missing_response_body" });
    return new Response(null, { status: response.status, headers: response.headers });
  }
  return trackSseAttempt(response, ({ outcome, outputChars, errorCode, usage }) => {
    const status = outcome === "cancelled" || errorCode === "aborted" ? "abort" : response.status;
    logChatRequest(context.log, status, extractChatTokenUsage({ usage }));
    settle();
    return recordAttempt(context, outcome, { outputChars, errorCode });
  });
}

function normalizePromptScope(value: unknown): PromptScope {
  return value === "gameplay" ? "gameplay" : "utility";
}

function getProviderForModel(model: string): Provider | null {
  const modelRef =
    ALL_MODELS.find((ref) => ref.model === model) ??
    PROJECT_MODELS.find((ref) => ref.model === model);
  return modelRef?.provider ?? null;
}

function getTokendanceUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return "";
  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  return `${withoutTrailingSlash}/chat/completions`;
}

/** Resolve ModelRef for a model id; used to apply per-model temperature/reasoning overrides. */
function getModelRef(model: string): (typeof PROJECT_MODELS)[number] | (typeof ALL_MODELS)[number] | undefined {
  return ALL_MODELS.find((ref) => ref.model === model) ?? PROJECT_MODELS.find((ref) => ref.model === model);
}

function normalizeDashscopeModelName(model: string): string {
  return model.replace(/^qwen\//i, "");
}

// Models that support explicit cache_control parameter
// Per ZenMux docs: only Anthropic Claude and Qwen series support explicit caching
function supportsExplicitCaching(model: string): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  return lower.startsWith("anthropic/") || lower.startsWith("qwen/");
}

// Models that support multipart message format (content as array)
function supportsMultipartContent(model: string): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  // Known models that support multipart content
  if (lower.startsWith("openai/")) return true;
  if (lower.startsWith("google/")) return true;
  if (lower.startsWith("anthropic/")) return true;
  if (lower.startsWith("deepseek/")) return true;
  if (lower.startsWith("deepseek-")) return true;
  if (lower.startsWith("qwen/")) return true;
  if (lower.startsWith("moonshotai/")) return true;
  // z-ai/glm, volcengine/doubao may NOT support multipart - flatten to string
  return false;
}

// Models that support response_format parameter
// Per ZenMux docs: check model card for response_format support
function supportsResponseFormat(model: string): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  // Known supported models
  if (lower.startsWith("openai/")) return true;
  if (lower.startsWith("google/")) return true;
  if (lower.startsWith("anthropic/")) return true;
  if (lower.startsWith("deepseek/")) return true;
  if (lower.startsWith("deepseek-")) return true;
  if (lower.startsWith("qwen/")) return true;
  if (lower.startsWith("moonshotai/")) return true;
  // Models that may NOT support response_format - be conservative
  // z-ai/glm, volcengine/doubao, etc. - skip response_format to avoid errors
  return false;
}

function supportsAutomaticPrefixCaching(model: string): boolean {
  if (!model) return false;
  const lower = model.toLowerCase();
  return lower.startsWith("deepseek/") || lower.startsWith("deepseek-");
}

// Flatten multipart content to plain string for models that don't support it
function flattenMultipartContent(messages: unknown[]): unknown[] {
  if (!Array.isArray(messages)) return messages;

  return messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    const m = msg as Record<string, unknown>;

    // If content is an array, flatten to string
    if (Array.isArray(m.content)) {
      const textParts = m.content
        .filter((part): part is { type: string; text: string } =>
          part && typeof part === "object" && (part as { type?: string }).type === "text"
        )
        .map((part) => part.text || "")
        .filter(Boolean);
      
      return { ...m, content: textParts.join("\n\n") };
    }

    return m;
  });
}

// DeepSeek context caching is prefix-based. Text-only multipart messages are
// normalized to one plain string so identical text starts at token 0 reliably.
function coalesceTextOnlyMultipartContent(messages: unknown[]): unknown[] {
  if (!Array.isArray(messages)) return messages;

  return messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    const m = msg as Record<string, unknown>;

    if (!Array.isArray(m.content)) return m;

    const parts = m.content;
    const allText = parts.every(
      (part): part is { type: string; text: string } =>
        part &&
        typeof part === "object" &&
        (part as { type?: string }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string"
    );

    if (!allText) return stripCacheControl([m])[0] as Record<string, unknown>;

    return {
      ...m,
      content: parts
        .map((part) => part.text.trim())
        .filter(Boolean)
        .join("\n\n"),
    };
  });
}

function hasJsonHintInMessages(messages: unknown[]): boolean {
  if (!Array.isArray(messages)) return false;

  const contains = (value: unknown): boolean => {
    if (typeof value === "string") return /json/i.test(value);
    if (Array.isArray(value)) return value.some(contains);
    if (!value || typeof value !== "object") return false;
    const obj = value as Record<string, unknown>;
    if ("text" in obj && typeof obj.text === "string") return /json/i.test(obj.text);
    if ("content" in obj) return contains(obj.content);
    return false;
  };

  return messages.some((m) => contains(m));
}

function withDashscopeJsonHint(messages: unknown[]): unknown[] {
  if (!Array.isArray(messages)) return messages;
  if (hasJsonHintInMessages(messages)) return messages;
  return [{ role: "system", content: "Respond in json." }, ...messages];
}

// Strip cache_control from message content parts for models that don't support it
function stripCacheControl(messages: unknown[]): unknown[] {
  if (!Array.isArray(messages)) return messages;

  return messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    const m = msg as Record<string, unknown>;

    // If content is an array (multipart), strip cache_control from each part
    if (Array.isArray(m.content)) {
      const strippedContent = m.content.map((part) => {
        if (part && typeof part === "object" && "cache_control" in part) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { cache_control, ...rest } = part as Record<string, unknown>;
          return rest;
        }
        return part;
      });
      return { ...m, content: strippedContent };
    }

    return m;
  });
}

// ZenMux reasoning: only enabled, effort, max_tokens (see docs.zenmux.ai/guide/advanced/reasoning.html)
type ReasoningPayload = {
  enabled: boolean;
  effort?: "minimal" | "low" | "medium" | "high";
  max_tokens?: number;
};

type ReasoningEffort = NonNullable<ReasoningPayload["effort"]>;
const ALLOWED_REASONING_EFFORT = new Set<ReasoningEffort>(["minimal", "low", "medium", "high"]);

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && ALLOWED_REASONING_EFFORT.has(value as ReasoningEffort);
}

/** Build ZenMux request reasoning object (no unsupported fields like exclude). */
function toZenMuxReasoning(
  r: { enabled?: boolean; effort?: string; max_tokens?: number } | undefined
): { enabled: boolean; effort?: string; max_tokens?: number } {
  if (r?.enabled === true) {
    return {
      enabled: true,
      ...(r.effort != null && { effort: r.effort }),
      ...(typeof r.max_tokens === "number" && Number.isFinite(r.max_tokens) && { max_tokens: r.max_tokens }),
    };
  }
  return { enabled: false };
}

type ChatRequestPayload = {
  model: string;
  messages: unknown[];
  request_id?: unknown;
  prompt_scope?: PromptScope;
  call_type?: unknown;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  reasoning?: ReasoningPayload;
  reasoning_effort?: "minimal" | "low" | "medium" | "high";
  reasoning_profile?: unknown;
  response_format?: unknown;
  provider?: Provider;
};

type RequestMeta = {
  userId: string;
  sessionId: string | null;
  attempt: number;
  requestId?: unknown;
};

async function runBatchItem(
  payload: ChatRequestPayload,
  headerApiKey: string | null,
  headerDashscopeKey: string | null,
  headerTokendanceKey: string | null,
  headerTokendanceBaseUrl: string | null,
  meta: RequestMeta,
  parentSignal?: AbortSignal,
): Promise<
  | { ok: true; data: unknown }
  | {
      ok: false;
      status: number;
      error: string;
      details?: unknown;
      recoveryAction?: TokenPayRecoveryAction;
    }
> {
  const {
    model,
    messages,
    prompt_scope,
    temperature,
    max_tokens,
    stream,
    reasoning,
    reasoning_effort,
    reasoning_profile,
    response_format,
    provider,
  } = payload;

  if (stream) {
    return { ok: false, status: 400, error: "Batch request does not support stream=true" };
  }

  const modelProvider: Provider | null =
    provider === "dashscope" || provider === "zenmux" || provider === "tokendance" ? provider : getProviderForModel(model);
  if (!modelProvider) {
    return { ok: false, status: 400, error: `Unknown model: ${String(model ?? "").trim() || "unknown"}` };
  }
  if (typeof model !== "string" || model.length === 0 || model.length > 256 || !Array.isArray(messages)) {
    return { ok: false, status: 400, error: "Invalid chat request" };
  }

  const startedAt = Date.now();
  const callType = normalizeChatCallType(payload.call_type);
  const context: AttemptContext = {
    userId: meta.userId,
    sessionId: meta.sessionId,
    eventId: randomUUID(),
    requestId: stableId(payload.request_id ?? meta.requestId),
    attempt: meta.attempt,
    provider: modelProvider,
    model,
    promptScope: normalizePromptScope(payload.prompt_scope),
    callType,
    mode: "batch",
    startedAt,
    inputChars: countMessageChars(messages),
    log: createChatRequestLog({ model, attempt: meta.attempt, callType, startedAt }),
  };

  const isDefaultModel = PROJECT_MODELS.some((ref) => ref.model === model);
  if (!isDefaultModel) {
    if (modelProvider === "zenmux" && !headerApiKey) {
      return { ok: false, status: 401, error: "此模型需要您提供 Zenmux API Key" };
    }
    if (modelProvider === "dashscope" && !headerDashscopeKey) {
      return { ok: false, status: 401, error: "此模型需要您提供百炼 API Key" };
    }
    if (modelProvider === "tokendance" && !headerTokendanceKey) {
      return { ok: false, status: 401, error: "此模型需要您提供 TokenDance Key" };
    }
  }

  const hasAnyCustomKeyHeader = Boolean((headerApiKey ?? "").trim() || (headerDashscopeKey ?? "").trim() || (headerTokendanceKey ?? "").trim());

  const modelRefOverride = getModelRef(model);
  const normalizedTemperature =
    modelRefOverride?.temperature !== undefined
      ? modelRefOverride.temperature
      : (typeof temperature === "number" && Number.isFinite(temperature) ? temperature : 0.7);
  const cappedTemperature = (() => {
    const lower = typeof model === "string" ? model.toLowerCase() : "";
    const needZeroOne =
      modelProvider === "zenmux" ||
      lower.startsWith("moonshotai/") ||
      lower.includes("kimi");
    if (needZeroOne) {
      return Math.min(Math.max(0, normalizedTemperature), 1);
    }
    return Math.max(0, normalizedTemperature);
  })();
  const reasoningProfile = normalizeReasoningProfile(reasoning_profile);
  const effectiveReasoning = resolveReasoning(modelRefOverride, reasoning, reasoningProfile);
  // 思考中的决策调用在返回响应头之前就可能超过普通上限
  const providerTimeoutMs = reasoningProfile === "decision" && effectiveReasoning?.enabled === true
    ? DECISION_TIMEOUT_MS
    : NORMAL_ATTEMPT_TIMEOUT_MS;

  let processedMessages: unknown[] = messages;
  if (!supportsMultipartContent(model)) {
    processedMessages = flattenMultipartContent(processedMessages);
  } else if (supportsAutomaticPrefixCaching(model)) {
    const normalizedMessages = coalesceTextOnlyMultipartContent(processedMessages);
    processedMessages = applyDeepSeekPromptScope(
      normalizedMessages,
      prompt_scope ?? "utility",
    );
  } else if (modelProvider === "dashscope") {
    processedMessages = stripCacheControl(processedMessages);
  } else if (!supportsExplicitCaching(model)) {
    processedMessages = stripCacheControl(processedMessages);
  }

  if (modelProvider === "dashscope") {
    if (hasAnyCustomKeyHeader && !headerDashscopeKey) {
      return { ok: false, status: 401, error: "已启用自定义 Key，但未提供百炼 API Key（已拒绝回退到系统 Key）" };
    }
    const dashscopeApiKey = headerDashscopeKey || process.env.DASHSCOPE_API_KEY;
    if (!dashscopeApiKey) {
      return { ok: false, status: 500, error: "DASHSCOPE_API_KEY not configured on server" };
    }

    const normalizedModel = normalizeDashscopeModelName(model);
    const normalizedResponseFormat = response_format as { type?: unknown } | undefined;
    const dashscopeMessages =
      normalizedResponseFormat?.type === "json_object"
        ? withDashscopeJsonHint(processedMessages)
        : processedMessages;

    const requestBody: Record<string, unknown> = {
      model: normalizedModel,
      messages: dashscopeMessages,
      temperature: cappedTemperature,
    };

    if (typeof max_tokens === "number" && Number.isFinite(max_tokens)) {
      requestBody.max_tokens = Math.max(16, Math.floor(max_tokens));
    }

    if (response_format) {
      requestBody.response_format = response_format;
    }

    const upstream = await fetchUpstream(DASHSCOPE_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dashscopeApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }, context, parentSignal, providerTimeoutMs);

    try {
      const response = upstream.response;
      if (!response.ok) {
        const errorText = await response.text();
        let parsed: unknown = undefined;
        try {
          parsed = JSON.parse(errorText);
        } catch {
          // ignore
        }
        return {
          ok: false,
          status: response.status,
          error: `DashScope API error: ${response.status}`,
          details: parsed ?? errorText,
        };
      }

      const result = await readProviderJson(response, context, upstream.signal);
      return { ok: true, data: result };
    } finally {
      upstream.release();
    }
  }

  if (modelProvider === "tokendance") {
    if (hasAnyCustomKeyHeader && !headerTokendanceKey) {
      return { ok: false, status: 401, error: "已启用自定义 Key，但未提供 TokenDance Key（已拒绝回退到系统 Key）" };
    }
    const tokendanceApiKey = headerTokendanceKey || process.env.TOKENDANCE_API_KEY;
    const tokendanceBaseUrl = headerTokendanceBaseUrl || getTokenPayGatewayUrl();
    if (!tokendanceApiKey || !tokendanceBaseUrl) {
      return { ok: false, status: 500, error: "TOKENDANCE_API_KEY or TOKENDANCE_BASE_URL not configured on server" };
    }

    const tokendanceUrl = getTokendanceUrl(tokendanceBaseUrl);
    if (!tokendanceUrl) {
      return { ok: false, status: 500, error: "Invalid TokenDance Base URL" };
    }

    const requestBody: Record<string, unknown> = {
      model,
      messages: processedMessages,
      temperature: cappedTemperature,
    };

    if (typeof max_tokens === "number" && Number.isFinite(max_tokens)) {
      requestBody.max_tokens = Math.max(16, Math.floor(max_tokens));
    }

    // GLM-4.7 / Kimi K2.5 默认开启思考，API 参数可关闭（已实测有效）
    const modelLower = model.toLowerCase();
    const thinking = buildTokendanceThinking(effectiveReasoning);
    if (thinking.thinking) {
      Object.assign(requestBody, thinking);
    } else if (modelLower.includes("glm") || modelLower.includes("kimi")) {
      requestBody.thinking = { type: "disabled" };
    }

    if (response_format && supportsResponseFormat(model)) {
      applyTokenDanceResponseFormat(requestBody, response_format);
    }

    const upstream = await fetchUpstream(tokendanceUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokendanceApiKey}`,
        "Content-Type": "application/json",
        "X-App-URL": getTokenPayAppUrl(),
      },
      body: JSON.stringify(requestBody),
    }, context, parentSignal, providerTimeoutMs);

    try {
      const response = upstream.response;
      if (!response.ok) {
        const errorText = await response.text();
        const recoveryAction = readTokenPayRecoveryAction(response);
        let parsed: unknown = undefined;
        try {
          parsed = JSON.parse(errorText);
        } catch {
          // ignore
        }
        return {
          ok: false,
          status: response.status,
          error: `TokenDance error: ${response.status}`,
          details: parsed ?? errorText,
          ...(recoveryAction ? { recoveryAction } : {}),
        };
      }

      const result = await readProviderJson(response, context, upstream.signal);
      return { ok: true, data: result };
    } finally {
      upstream.release();
    }
  }

  if (hasAnyCustomKeyHeader && !headerApiKey) {
    return { ok: false, status: 401, error: "已启用自定义 Key，但未提供 Zenmux API Key（已拒绝回退到系统 Key）" };
  }

  const apiKey = headerApiKey || process.env.ZENMUX_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: MSG_SERVER_NOT_CONFIGURED };
  }

  const requestBody: Record<string, unknown> = {
    model,
    messages: processedMessages,
    temperature: cappedTemperature,
  };

  if (typeof max_tokens === "number" && Number.isFinite(max_tokens)) {
    requestBody.max_tokens = Math.max(16, Math.floor(max_tokens));
  }

  const reasoningEffort = isReasoningEffort(reasoning_effort) ? reasoning_effort : undefined;
  const reasoningToUse = effectiveReasoning ?? reasoning;
  if (reasoningToUse !== undefined) {
    requestBody.reasoning = toZenMuxReasoning(reasoningToUse);
  } else if (reasoningEffort) {
    requestBody.reasoning_effort = reasoningEffort;
  } else {
    requestBody.reasoning = { enabled: false };
  }

  if (response_format && supportsResponseFormat(model)) {
    requestBody.response_format = response_format;
  }

  const upstream = await fetchUpstream(ZENMUX_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  }, context, parentSignal, providerTimeoutMs);

  try {
    const response = upstream.response;
    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        status: response.status,
        error: `ZenMux API error: ${response.status} - ${errorText}`,
      };
    }

    const result = await readProviderJson(response, context, upstream.signal);
    return { ok: true, data: result };
  } finally {
    upstream.release();
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request as unknown as Request);
  if ("error" in auth) return auth.error;

  const quota = await consumeDemoLlmCall(request, 1);
  if (!quota.ok) {
    return NextResponse.json({ error: quota.message, code: quota.code }, { status: quota.status });
  }
  const withQuotaCookies = (response: Response) => applyRateLimitCookies(response, quota.cookies);

  const tokenPayRequested = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && ["true", "1"].includes(
    request.headers.get(TOKENPAY_MODE_HEADER)?.trim().toLowerCase() ?? "",
  );
  let tokenPayApiKey: string | null = null;
  if (tokenPayRequested) {
    try {
      tokenPayApiKey = await getConnectedTokenPayApiKey(auth.user.id);
    } catch (error) {
      console.error("[TokenPay] Failed to resolve API key", error);
      return NextResponse.json(
        { error: "Failed to resolve TokenPay connection" },
        { status: 500 },
      );
    }
    if (!tokenPayApiKey) {
      return NextResponse.json(
        {
          error: "TokenPay connection is not available",
          code: "tokenpay_connection_unavailable",
          recoveryAction: "reauthorize_api_key",
        },
        { status: 409 },
      );
    }
  }

  const earlyZenmuxKey = request.headers.get("x-zenmux-api-key")?.trim();
  const earlyDashscopeKey = request.headers.get("x-dashscope-api-key")?.trim();
  const earlyTokendanceKey = tokenPayApiKey || request.headers.get("x-tokendance-api-key")?.trim();
  const hasCustomKeys = Boolean(
    (earlyZenmuxKey ?? "") ||
    (earlyDashscopeKey ?? "") ||
    (earlyTokendanceKey ?? "")
  );

  if (!hasCustomKeys) {
    const sessionId = request.headers.get("x-game-session-id")?.trim() || null;
    const hasAuthorizedSession = await hasAuthorizedActiveGameSession(auth.user.id, sessionId);
    if (!hasAuthorizedSession) {
      return NextResponse.json(
        {
          error: GAME_SESSION_EXPIRED_MESSAGE,
          code: GAME_SESSION_EXPIRED_CODE,
        },
        { status: 409 },
      );
    }
  }

  let activeLog: ChatRequestLog | null = null;
  try {
    const body = await request.json();
    const rawSessionId = request.headers.get("x-game-session-id")?.trim() || null;
    const sessionId = isUuid(rawSessionId) ? rawSessionId : null;
    const requestAttempt = positiveAttempt(request.headers.get(ATTEMPT_HEADER));
    if (Array.isArray(body?.requests)) {
      const headerApiKey = request.headers.get("x-zenmux-api-key")?.trim() || null;
      const headerDashscopeKey = request.headers.get("x-dashscope-api-key")?.trim() || null;
      const headerTokendanceKey = tokenPayApiKey || request.headers.get("x-tokendance-api-key")?.trim() || null;
      const headerTokendanceBaseUrl = tokenPayRequested
        ? getTokenPayGatewayUrl()
        : request.headers.get("x-tokendance-base-url")?.trim() || null;
      const requests = body.requests as ChatRequestPayload[];
      if (requests.length > MAX_BATCH_REQUESTS) {
        return withQuotaCookies(NextResponse.json(
          { error: `Too many batch requests. Maximum is ${MAX_BATCH_REQUESTS}.` },
          { status: 400 }
        ));
      }
      if (requests.length > 1) {
        const extra = await consumeDemoLlmCall(request, requests.length - 1);
        if (!extra.ok) {
          return withQuotaCookies(NextResponse.json(
            { error: extra.message, code: extra.code },
            { status: extra.status },
          ));
        }
        quota.cookies.push(...extra.cookies);
      }
      const results = await Promise.all(
        requests.map((req) => runBatchItem(
          req,
          headerApiKey,
          headerDashscopeKey,
          headerTokendanceKey,
          headerTokendanceBaseUrl,
          {
            userId: auth.user.id,
            sessionId,
            attempt: requestAttempt,
            requestId: request.headers.get(REQUEST_ID_HEADER),
          },
          request.signal,
        ).catch(() => ({
          ok: false as const,
          status: 502,
          error: "Upstream request failed",
          details: undefined,
          recoveryAction: undefined,
        })))
      );
      if (
        tokenPayRequested &&
        results.some(
          (result) => !result.ok && result.recoveryAction === "reauthorize_api_key",
        )
      ) {
        await markTokenPayConnectionForReauthorization(auth.user.id);
      }
      return NextResponse.json({ results });
    }
    const {
      model,
      messages,
      request_id,
      prompt_scope,
      call_type,
      temperature,
      max_tokens,
      stream,
      reasoning,
      reasoning_effort,
      reasoning_profile,
      response_format,
      provider,
    } = body;
    const modelProvider: Provider | null =
      provider === "dashscope" || provider === "zenmux" || provider === "tokendance" ? provider : getProviderForModel(model);
    if (!modelProvider) {
      // Reject unknown models early to avoid mis-routing.
      return NextResponse.json(
        { error: `Unknown model: ${String(model ?? "").trim() || "unknown"}` },
        { status: 400 }
      );
    }
    if (typeof model !== "string" || model.length === 0 || model.length > 256 || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid chat request" }, { status: 400 });
    }
    const headerApiKey = request.headers.get("x-zenmux-api-key")?.trim();
    const headerDashscopeKey = request.headers.get("x-dashscope-api-key")?.trim();
    const headerTokendanceKey = tokenPayApiKey || request.headers.get("x-tokendance-api-key")?.trim();
    const headerTokendanceBaseUrl = tokenPayRequested
      ? getTokenPayGatewayUrl()
      : request.headers.get("x-tokendance-base-url")?.trim();
    const hasAnyCustomKeyHeader = Boolean((headerApiKey ?? "").trim() || (headerDashscopeKey ?? "").trim() || (headerTokendanceKey ?? "").trim());
    const isDefaultModel = PROJECT_MODELS.some((ref) => ref.model === model);

    const modelRefOverride = getModelRef(model);
    const normalizedTemperature =
      modelRefOverride?.temperature !== undefined
        ? modelRefOverride.temperature
        : (typeof temperature === "number" && Number.isFinite(temperature) ? temperature : 0.7);
    // ZenMux requires temperature in 0..1; Moonshot/Kimi also
    const cappedTemperature = (() => {
      const lower = typeof model === "string" ? model.toLowerCase() : "";
      const needZeroOne =
        modelProvider === "zenmux" ||
        lower.startsWith("moonshotai/") ||
        lower.includes("kimi");
      if (needZeroOne) {
        return Math.min(Math.max(0, normalizedTemperature), 1);
      }
      return Math.max(0, normalizedTemperature);
    })();
    const reasoningProfile = normalizeReasoningProfile(reasoning_profile);
    const effectiveReasoning = resolveReasoning(modelRefOverride, reasoning, reasoningProfile);
    // 思考中的决策调用在返回响应头之前就可能超过普通上限
    const providerTimeoutMs = reasoningProfile === "decision" && effectiveReasoning?.enabled === true
      ? DECISION_TIMEOUT_MS
      : NORMAL_ATTEMPT_TIMEOUT_MS;
    const startedAt = Date.now();
    const callType = normalizeChatCallType(call_type);
    const attemptContext: AttemptContext = {
      userId: auth.user.id,
      sessionId,
      eventId: stableId(request.headers.get(ATTEMPT_ID_HEADER)),
      requestId: stableId(request_id ?? request.headers.get(REQUEST_ID_HEADER)),
      attempt: requestAttempt,
      provider: modelProvider,
      model,
      promptScope: normalizePromptScope(prompt_scope),
      callType,
      mode: stream ? "stream" : "completion",
      startedAt,
      inputChars: countMessageChars(messages),
      log: createChatRequestLog({ model, attempt: requestAttempt, callType, startedAt }),
    };
    activeLog = attemptContext.log;

    // Process messages based on model capabilities
    let processedMessages = messages;

    // For models that don't support multipart content, flatten to string
    if (!supportsMultipartContent(model)) {
      processedMessages = flattenMultipartContent(processedMessages);
    } else if (supportsAutomaticPrefixCaching(model)) {
      const normalizedMessages = coalesceTextOnlyMultipartContent(processedMessages);
      processedMessages = applyDeepSeekPromptScope(
        normalizedMessages,
        prompt_scope ?? "utility",
      );
    } else if (modelProvider === "dashscope") {
      // Dashscope is OpenAI compatible but does not support cache_control
      processedMessages = stripCacheControl(processedMessages);
    } else if (!supportsExplicitCaching(model)) {
      // For models that support multipart but not cache_control, strip cache_control
      processedMessages = stripCacheControl(processedMessages);
    }

    if (!isDefaultModel) {
      if (modelProvider === "zenmux" && !headerApiKey) {
        return NextResponse.json(
          { error: "此模型需要您提供 Zenmux API Key" },
          { status: 401 }
        );
      }
      if (modelProvider === "dashscope" && !headerDashscopeKey) {
        return NextResponse.json(
          { error: "此模型需要您提供百炼 API Key" },
          { status: 401 }
        );
      }
      if (modelProvider === "tokendance" && !headerTokendanceKey) {
        return NextResponse.json(
          { error: "此模型需要您提供 TokenDance Key" },
          { status: 401 }
        );
      }
    }

    if (modelProvider === "dashscope") {
      if (hasAnyCustomKeyHeader && !headerDashscopeKey) {
        return NextResponse.json(
          { error: "已启用自定义 Key，但未提供百炼 API Key（已拒绝回退到系统 Key）" },
          { status: 401 }
        );
      }

      const dashscopeApiKey = headerDashscopeKey || process.env.DASHSCOPE_API_KEY;
      if (!dashscopeApiKey) {
        return NextResponse.json(
          { error: "DASHSCOPE_API_KEY not configured on server" },
          { status: 500 }
        );
      }

      const dashscopeApiUrl = DASHSCOPE_CHAT_COMPLETIONS_URL;

      const normalizedModel = normalizeDashscopeModelName(model);
      const normalizedResponseFormat = response_format as { type?: unknown } | undefined;
      const dashscopeMessages =
        normalizedResponseFormat?.type === "json_object"
          ? withDashscopeJsonHint(processedMessages)
          : processedMessages;
      const requestBody: Record<string, unknown> = {
        model: normalizedModel,
        messages: dashscopeMessages,
        temperature: cappedTemperature,
      };

      if (typeof max_tokens === "number" && Number.isFinite(max_tokens)) {
        requestBody.max_tokens = Math.max(16, Math.floor(max_tokens));
      }

      if (stream) {
        requestBody.stream = true;
      }

      if (response_format) {
        requestBody.response_format = response_format;
      }

      const upstream = await fetchUpstream(dashscopeApiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dashscopeApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }, attemptContext, request.signal, providerTimeoutMs);
      const response = upstream.response;

      if (!response.ok) {
        const errorText = await response.text();
        upstream.release();
        let parsed: unknown = undefined;
        try {
          parsed = JSON.parse(errorText);
        } catch {
          // ignore
        }
        return NextResponse.json(
          {
            error: `DashScope API error: ${response.status}`,
            details: parsed ?? errorText,
          },
          { status: response.status }
        );
      }

      if (stream) {
        // For streaming responses, forward the stream
        const headers = new Headers();
        headers.set("Content-Type", "text/event-stream");
        headers.set("Cache-Control", "no-cache");
        headers.set("Connection", "keep-alive");

        return trackedStreamResponse(
          new Response(response.body, { headers }),
          attemptContext,
          releaseAfterAbort(response, upstream.signal, () => upstream.release()),
        );
      }

      try {
        const result = await readProviderJson(response, attemptContext, upstream.signal);
        return NextResponse.json(result);
      } finally {
        upstream.release();
      }
    }

    if (modelProvider === "tokendance") {
      if (hasAnyCustomKeyHeader && !headerTokendanceKey) {
        return NextResponse.json(
          { error: "已启用自定义 Key，但未提供 TokenDance Key（已拒绝回退到系统 Key）" },
          { status: 401 }
        );
      }

      const tokendanceApiKey = headerTokendanceKey || process.env.TOKENDANCE_API_KEY;
      const tokendanceBaseUrl = headerTokendanceBaseUrl || getTokenPayGatewayUrl();
      if (!tokendanceApiKey || !tokendanceBaseUrl) {
        return NextResponse.json(
          { error: "TOKENDANCE_API_KEY or TOKENDANCE_BASE_URL not configured on server" },
          { status: 500 }
        );
      }

      const tokendanceUrl = getTokendanceUrl(tokendanceBaseUrl);
      if (!tokendanceUrl) {
        return NextResponse.json(
          { error: "Invalid TokenDance Base URL" },
          { status: 500 }
        );
      }

      const requestBody: Record<string, unknown> = {
        model,
        messages: processedMessages,
        temperature: cappedTemperature,
      };

      if (typeof max_tokens === "number" && Number.isFinite(max_tokens)) {
        requestBody.max_tokens = Math.max(16, Math.floor(max_tokens));
      }

      if (stream) {
        requestBody.stream = true;
      }

      // GLM-4.7 / Kimi K2.5 默认开启思考，API 参数可关闭（已实测有效）
      const modelLower = model.toLowerCase();
      const thinking = buildTokendanceThinking(effectiveReasoning);
      if (thinking.thinking) {
        Object.assign(requestBody, thinking);
      } else if (modelLower.includes("glm") || modelLower.includes("kimi")) {
        requestBody.thinking = { type: "disabled" };
      }

      if (response_format && supportsResponseFormat(model)) {
        applyTokenDanceResponseFormat(requestBody, response_format);
      }

      const upstream = await fetchUpstream(tokendanceUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokendanceApiKey}`,
          "Content-Type": "application/json",
          "X-App-URL": getTokenPayAppUrl(),
        },
        body: JSON.stringify(requestBody),
      }, attemptContext, request.signal, providerTimeoutMs);
      const response = upstream.response;

      if (!response.ok) {
        const errorText = await response.text();
        const recoveryAction = readTokenPayRecoveryAction(response);
        upstream.release();
        if (tokenPayRequested && recoveryAction === "reauthorize_api_key") {
          await markTokenPayConnectionForReauthorization(auth.user.id);
        }
        let parsed: unknown = undefined;
        try {
          parsed = JSON.parse(errorText);
        } catch {
          // ignore
        }
        const errorResponse = NextResponse.json(
          {
            error: `TokenDance error: ${response.status}`,
            details: parsed ?? errorText,
            recoveryAction,
          },
          { status: response.status }
        );
        if (recoveryAction) {
          errorResponse.headers.set(TOKENPAY_RECOVERY_HEADER, recoveryAction);
        }
        return errorResponse;
      }

      if (stream) {
        const headers = new Headers();
        headers.set("Content-Type", "text/event-stream");
        headers.set("Cache-Control", "no-cache");
        headers.set("Connection", "keep-alive");

        return trackedStreamResponse(
          new Response(response.body, { headers }),
          attemptContext,
          releaseAfterAbort(response, upstream.signal, () => upstream.release()),
        );
      }

      try {
        const result = await readProviderJson(response, attemptContext, upstream.signal);
        return NextResponse.json(result);
      } finally {
        upstream.release();
      }
    }

    if (hasAnyCustomKeyHeader && !headerApiKey) {
      return NextResponse.json(
        { error: "已启用自定义 Key，但未提供 Zenmux API Key（已拒绝回退到系统 Key）" },
        { status: 401 }
      );
    }

    const apiKey = headerApiKey || process.env.ZENMUX_API_KEY;
    if (!apiKey) {
      return withQuotaCookies(NextResponse.json(
        { error: MSG_SERVER_NOT_CONFIGURED },
        { status: 503 }
      ));
    }

    const requestBody: Record<string, unknown> = {
      model,
      messages: processedMessages,
      temperature: cappedTemperature,
    };

    if (typeof max_tokens === "number" && Number.isFinite(max_tokens)) {
      requestBody.max_tokens = Math.max(16, Math.floor(max_tokens));
    }

    if (stream) {
      requestBody.stream = true;
    }

    const reasoningEffort = isReasoningEffort(reasoning_effort) ? reasoning_effort : undefined;
    const reasoningToUse = effectiveReasoning ?? reasoning;
    if (reasoningToUse !== undefined) {
      requestBody.reasoning = toZenMuxReasoning(reasoningToUse);
    } else if (reasoningEffort) {
      requestBody.reasoning_effort = reasoningEffort;
    } else {
      requestBody.reasoning = { enabled: false };
    }

    // Only include response_format for models that support it
    if (response_format && supportsResponseFormat(model)) {
      requestBody.response_format = response_format;
    }

    const upstream = await fetchUpstream(ZENMUX_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }, attemptContext, request.signal, providerTimeoutMs);
    const response = upstream.response;

    if (!response.ok) {
      const errorText = await response.text();
      upstream.release();
      return NextResponse.json(
        { error: `ZenMux API error: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    if (stream) {
      // For streaming responses, forward the stream
      const headers = new Headers();
      headers.set("Content-Type", "text/event-stream");
      headers.set("Cache-Control", "no-cache");
      headers.set("Connection", "keep-alive");

      return trackedStreamResponse(
        new Response(response.body, { headers }),
        attemptContext,
        releaseAfterAbort(response, upstream.signal, () => upstream.release()),
      );
    }

    try {
      const result = await readProviderJson(response, attemptContext, upstream.signal);
      return NextResponse.json(result);
    } finally {
      upstream.release();
    }
  } catch (error) {
    if (!activeLog?.logged) {
      logChatRequest(
        activeLog ?? createChatRequestLog({
          model: "unknown",
          attempt: positiveAttempt(request.headers.get(ATTEMPT_HEADER)),
          callType: "other",
        }),
        "abort",
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
