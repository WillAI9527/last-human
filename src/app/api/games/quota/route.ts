// Modified by LAST HUMAN demo (fork of oil-oil/wolfcha).
import { NextResponse } from "next/server";
import { readDailyQuota } from "@/lib/demo-rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const quota = await readDailyQuota(request);
  return NextResponse.json(quota);
}
