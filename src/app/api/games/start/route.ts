// Modified by LAST HUMAN demo (fork of oil-oil/wolfcha).
import { NextResponse } from "next/server";
import { applyRateLimitCookies, startDemoGame } from "@/lib/demo-rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const result = await startDemoGame(request);
  if (!result.ok) {
    return applyRateLimitCookies(
      NextResponse.json({ error: result.message, code: result.code }, { status: result.status }),
      [],
    );
  }
  return applyRateLimitCookies(
    NextResponse.json({ gameToken: result.gameToken, remaining: result.remaining }),
    result.cookies,
  );
}
