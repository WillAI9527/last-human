import path from "node:path";
import turn from "@/lib/wolf-council/review/turn.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

process.env.WOLVES_PATH = path.join(process.cwd(), "src/lib/wolf-council/review/wolves.json");
const { runTurn } = turn;

const BOARDS = new Set(["invest", "business", "legal", "learning", "social", "werewolf"]);

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const wolfId = typeof body?.wolfId === "string" ? body.wolfId.trim() : "";
  const boardId = typeof body?.boardId === "string" && BOARDS.has(body.boardId) ? body.boardId : "";
  if (!question || question.length > 4000 || !wolfId) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const url = new URL(request.url);
  const demo = body.demo === "fail" || body.demo === true || url.searchParams.get("demo") === "fail";
  try {
    const result = await runTurn({
      wolfId,
      question,
      previousWolfAnswer: typeof body.previousWolfAnswer === "string" ? body.previousWolfAnswer : "",
      mode: body.mode === "single" ? "single" : "debate",
      demo: demo ? "fail" : undefined,
      locale: body.locale === "en" ? "en" : "zh",
      boardId,
      history: body.history,
    });
    return Response.json(result);
  } catch {
    return Response.json({ error: "turn_failed" }, { status: 502 });
  }
}
