/** ZenMux OpenAI-compatible chat used by the Wolf Hall council. */

export const ZENMUX_URL = process.env.ZENMUX_URL || "https://zenmux.ai/api/v1/chat/completions";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatOptions = {
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
};

export type ChatFn = (model: string, messages: ChatMessage[], options?: ChatOptions) => Promise<string>;

export function stripThink(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^[\s\S]*<\/think>/, "")
    .trim();
}

/** Claude rejects temperature. Other models keep it. JSON mode stays off Claude. */
export function buildZenmuxBody(
  model: string,
  messages: ChatMessage[],
  options: ChatOptions = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options.maxTokens ?? 1500,
  };
  if (!model.startsWith("anthropic/")) {
    body.temperature = options.temperature ?? 0.7;
    if (options.json) body.response_format = { type: "json_object" };
  }
  return body;
}

function readContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" ? message.content : "";
}

export async function zenmuxChat(
  model: string,
  messages: ChatMessage[],
  options: ChatOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const key = process.env.ZENMUX_API_KEY?.trim();
  if (!key) throw new Error("ZENMUX_API_KEY not set");
  const body = buildZenmuxBody(model, messages, options);
  let lastErr = "empty completion";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetchImpl(ZENMUX_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      const text = await response.text();
      if (response.ok) {
        const content = stripThink(readContent(JSON.parse(text) as unknown));
        if (content) return content;
        lastErr = "empty completion";
      } else {
        lastErr = `HTTP ${response.status}: ${text.slice(0, 200)}`;
      }
    } catch (error) {
      lastErr = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  throw new Error(`ZenMux ${model} failed: ${lastErr}`);
}
