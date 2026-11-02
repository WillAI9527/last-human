export const LLM_ENV_KEYS = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"] as const;
export type LlmEnvKey = (typeof LLM_ENV_KEYS)[number];

export type LlmEnv = {
  apiKey: string;
  baseUrl: string;
  model: string;
  fallback: string;
  vision: string;
  missing: LlmEnvKey[];
  configured: boolean;
};

export function resolveLlmEnv(env: Record<string, string | undefined>): LlmEnv {
  const zenmuxKey = env.ZENMUX_API_KEY?.trim() || "";
  const zenmuxUrl = env.ZENMUX_URL?.trim() || "";
  const apiKey = env.LLM_API_KEY?.trim() || zenmuxKey;
  const explicitBase = env.LLM_BASE_URL?.trim() || "";
  const baseUrl = (explicitBase || zenmuxUrl || (zenmuxKey ? "https://zenmux.ai/api/v1" : "")).replace(/\/$/, "");
  const model = env.LLM_MODEL?.trim() || "";
  const fallback = env.LLM_FALLBACK_MODEL?.trim() || "";
  const vision = env.LLM_VISION_MODEL?.trim() || "";
  const missing: LlmEnvKey[] = [];
  if (!baseUrl) missing.push("LLM_BASE_URL");
  if (!apiKey) missing.push("LLM_API_KEY");
  if (!model) missing.push("LLM_MODEL");
  return { apiKey, baseUrl, model, fallback, vision, missing, configured: missing.length === 0 };
}

export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

export function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export function createThinkStripper() {
  let buf = "";
  let inside = false;
  const open = "<think>";
  const close = "</think>";
  const push = (chunk: string) => {
    buf += chunk;
    let out = "";
    while (buf) {
      if (!inside) {
        const index = buf.toLowerCase().indexOf(open);
        if (index === -1) {
          const keep = partialTail(buf, open);
          out += buf.slice(0, buf.length - keep);
          buf = buf.slice(buf.length - keep);
          break;
        }
        out += buf.slice(0, index);
        buf = buf.slice(index + open.length);
        inside = true;
      } else {
        const index = buf.toLowerCase().indexOf(close);
        if (index === -1) {
          buf = buf.slice(-close.length);
          break;
        }
        buf = buf.slice(index + close.length);
        inside = false;
      }
    }
    return out;
  };
  return {
    push,
    flush() {
      if (inside) {
        buf = "";
        return "";
      }
      const rest = buf;
      buf = "";
      return rest;
    },
  };
}

function partialTail(value: string, tag: string): number {
  const max = Math.min(value.length, tag.length - 1);
  for (let size = max; size > 0; size -= 1) {
    if (tag.startsWith(value.slice(-size).toLowerCase())) return size;
  }
  return 0;
}

export function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[redacted]")
    .slice(0, 180);
}

export function llmLogLine(entry: { model: string; status: string; ms: number; tokens: number | null }): string {
  return `[llm] model=${entry.model} status=${entry.status} ms=${entry.ms} tokens=${entry.tokens ?? "-"}`;
}
