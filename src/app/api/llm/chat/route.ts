import { applyRateLimitCookies, consumeOpsLlmCall } from "@/lib/demo-rate-limit";
import { completeChat, streamChat, type ChatMessage, type TextResult } from "@/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function errorResult(code: "timeout" | "http" | "parse" | "rate_limit" | "unknown", message: string, status: number) {
  const body: TextResult = { status: "error", code, message };
  return Response.json(body, { status });
}

function asMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return null;
  const messages: ChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const role = (item as { role?: string }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "system" && role !== "user" && role !== "assistant") return null;
    if (typeof content === "string") {
      if (!content.trim() || content.length > 12_000) return null;
      messages.push({ role, content });
      continue;
    }
    if (!Array.isArray(content) || content.length === 0 || content.length > 4) return null;
    const parts: ChatMessage["content"] = [];
    for (const part of content) {
      if (!part || typeof part !== "object") return null;
      if ((part as { type?: string }).type === "text" && typeof (part as { text?: string }).text === "string") {
        parts.push({ type: "text", text: (part as { text: string }).text.slice(0, 12_000) });
        continue;
      }
      const url = (part as { image_url?: { url?: string } }).image_url?.url;
      if ((part as { type?: string }).type === "image_url" && typeof url === "string" && url.length < 6_000_000) {
        parts.push({ type: "image_url", image_url: { url } });
        continue;
      }
      return null;
    }
    messages.push({ role, content: parts });
  }
  return messages;
}

export async function POST(request: Request) {
  const limited = await consumeOpsLlmCall(request);
  if (!limited.ok) {
    return errorResult("rate_limit", limited.message, 429);
  }
  const payload = await request.json().catch(() => null) as { stream?: boolean; messages?: unknown } | null;
  const messages = asMessages(payload?.messages);
  if (!messages) {
    return applyRateLimitCookies(errorResult("parse", "请求格式不正确", 400), limited.cookies);
  }
  if (payload?.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        await streamChat(messages, (event) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        });
        controller.close();
      },
    });
    return applyRateLimitCookies(new Response(stream, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
    }), limited.cookies);
  }
  const result = await completeChat(messages);
  const status = result.status === "error" ? (result.code === "rate_limit" ? 429 : 502) : 200;
  return applyRateLimitCookies(Response.json(result, { status }), limited.cookies);
}
