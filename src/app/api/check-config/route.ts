// Modified by LAST HUMAN demo (fork of oil-oil/wolfcha).
import { isZenmuxConfigured, MSG_SERVER_NOT_CONFIGURED } from "@/lib/demo-rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const zenmuxConfigured = isZenmuxConfigured();
  return Response.json({
    ok: zenmuxConfigured,
    zenmuxConfigured,
    message: zenmuxConfigured ? null : MSG_SERVER_NOT_CONFIGURED,
  });
}
