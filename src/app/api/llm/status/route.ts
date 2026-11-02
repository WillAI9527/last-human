import { llmStatus } from "@/server/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(llmStatus());
}
