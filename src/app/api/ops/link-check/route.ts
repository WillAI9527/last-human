export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// P0 never fetches the URL and never invents page text.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return Response.json({ readable: false, reason: "empty" });
  }
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    return Response.json({ readable: false, reason: "invalid", message: "无法读取，请上传截图" });
  }
  return Response.json({
    readable: false,
    reason: "not_fetched",
    message: "无法读取，请上传截图",
  });
}
