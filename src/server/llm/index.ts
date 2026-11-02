import "server-only";

import { z } from "zod";
import { LlmResult } from "@/lib/ops/schemas";
import {
  chatCompletionsUrl,
  createThinkStripper,
  llmLogLine,
  redactSecrets,
  resolveLlmEnv,
  stripThink,
  type LlmEnvKey,
} from "@/lib/ops/llm-pure";

const TIMEOUT_MS = 25_000;

export const StatusData = z.object({
  configured: z.boolean(),
  model: z.string().nullable(),
  vision: z.boolean(),
  mode: z.enum(["live", "demo"]),
});
export const StatusResult = LlmResult(StatusData);
export type StatusResult = z.infer<typeof StatusResult>;

const TextData = z.object({ text: z.string() });
const TextResult = LlmResult(TextData);
export type TextResult = z.infer<typeof TextResult>;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;
};

type AttemptError = Error & { code?: TextResult extends { code: infer C } ? C : string; retryable?: boolean };

function fail(code: "timeout" | "http" | "parse" | "rate_limit" | "unknown", message: string, retryable: boolean): AttemptError {
  const error = new Error(redactSecrets(message)) as AttemptError;
  error.code = code;
  error.retryable = retryable;
  return error;
}

function notConfigured(): StatusResult {
  const { missing } = resolveLlmEnv(process.env);
  return { status: "not_configured", missing: missing.length ? missing : ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"] };
}

export function llmStatus(): StatusResult {
  const env = resolveLlmEnv(process.env);
  if (!env.configured) return { status: "not_configured", missing: env.missing };
  const parsed = StatusResult.parse({
    status: "ok",
    data: { configured: true, model: env.model, vision: Boolean(env.vision), mode: "live" },
    model: env.model,
    latencyMs: 0,
  });
  return parsed;
}

function logCall(model: string, status: string, started: number, tokens: number | null) {
  console.info(llmLogLine({ model, status, ms: Date.now() - started, tokens }));
}

async function once(env: { apiKey: string; baseUrl: string }, model: string, messages: ChatMessage[], stream: boolean) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(chatCompletionsUrl(env.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        stream,
        ...(stream ? { stream_options: { include_usage: true } } : {}),
      }),
      signal: controller.signal,
    });
    if (response.status === 429) throw fail("rate_limit", "upstream rate limit", true);
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const retryable = response.status >= 500 || response.status === 408;
      throw fail("http", `upstream ${response.status} ${detail}`, retryable);
    }
    return { response, started };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw fail("timeout", "timeout", true);
    if ((error as AttemptError).code) throw error;
    throw fail("unknown", error instanceof Error ? error.message : "network", true);
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response, model: string, started: number): Promise<TextResult> {
  const payload = await response.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  } | null;
  const raw = payload?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") {
    logCall(model, "parse", started, null);
    return { status: "error", code: "parse", message: "上游没有返回文本" };
  }
  const text = stripThink(raw);
  const tokens = typeof payload?.usage?.total_tokens === "number" ? payload.usage.total_tokens : null;
  logCall(model, "ok", started, tokens);
  return { status: "ok", data: { text }, model, latencyMs: Date.now() - started };
}

export async function completeChat(messages: ChatMessage[]): Promise<TextResult> {
  const env = resolveLlmEnv(process.env);
  if (!env.configured) {
    logCall(env.model || "-", "not_configured", Date.now(), null);
    return notConfigured() as TextResult;
  }
  const models = [env.model, env.fallback].filter((model, index, list) => model && list.indexOf(model) === index);
  let last: AttemptError | null = null;
  for (const model of models) {
    const attempts = model === env.model ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const started = Date.now();
      try {
        const { response } = await once(env, model, messages, false);
        return await readJson(response, model, started);
      } catch (error) {
        last = error as AttemptError;
        logCall(model, last.code || "unknown", started, null);
        if (!last.retryable) break;
      }
    }
  }
  return {
    status: "error",
    code: last?.code === "timeout" || last?.code === "http" || last?.code === "parse" || last?.code === "rate_limit" ? last.code : "unknown",
    message: last?.message || "upstream",
  };
}

export async function streamChat(
  messages: ChatMessage[],
  write: (event: { type: "delta"; text: string } | { type: "result"; result: TextResult }) => void,
): Promise<void> {
  const env = resolveLlmEnv(process.env);
  if (!env.configured) {
    write({ type: "result", result: notConfigured() as TextResult });
    return;
  }
  const model = env.model;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(chatCompletionsUrl(env.baseUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${env.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true, stream_options: { include_usage: true } }),
      signal: controller.signal,
    });
    if (response.status === 429) throw fail("rate_limit", "upstream rate limit", true);
    if (!response.ok) throw fail("http", `upstream ${response.status}`, response.status >= 500);
    if (!response.body) throw fail("parse", "empty stream", false);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const stripper = createThinkStripper();
    let buffer = "";
    let tokens: number | null = null;
    let assembled = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let json: { choices?: Array<{ delta?: { content?: string } }>; usage?: { total_tokens?: number } };
        try {
          json = JSON.parse(data) as typeof json;
        } catch {
          throw fail("parse", "stream chunk", false);
        }
        if (typeof json.usage?.total_tokens === "number") tokens = json.usage.total_tokens;
        const piece = json.choices?.[0]?.delta?.content;
        if (!piece) continue;
        const visible = stripper.push(piece);
        if (visible) {
          assembled += visible;
          write({ type: "delta", text: visible });
        }
      }
    }
    assembled = (assembled + stripper.flush()).trim();
    logCall(model, "ok", started, tokens);
    write({ type: "result", result: { status: "ok", data: { text: assembled }, model, latencyMs: Date.now() - started } });
  } catch (error) {
    const coded = error as AttemptError;
    const code = coded.name === "AbortError" ? "timeout" : coded.code;
    logCall(model, code || "unknown", started, null);
    if (env.fallback && env.fallback !== model && code !== "parse") {
      write({ type: "result", result: await completeChat(messages) });
      return;
    }
    write({
      type: "result",
      result: {
        status: "error",
        code: code === "timeout" || code === "http" || code === "parse" || code === "rate_limit" ? code : "unknown",
        message: coded.name === "AbortError" ? "timeout" : (coded.message || "upstream"),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export function missingKeys(): LlmEnvKey[] {
  return resolveLlmEnv(process.env).missing;
}
