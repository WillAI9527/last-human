import { applyRateLimitCookies, consumeCouncilTurn, isZenmuxConfigured } from "@/lib/demo-rate-limit";
import type { AppLocale } from "@/i18n/config";
import { localFallback, type PublicTurn } from "@/lib/wolf-council/answer";
import { boardWolves, getBoard } from "@/lib/wolf-council/data";
import { buildAdvisorPrompt } from "@/lib/wolf-council/prompts";
import { councilTurn, normHistory, type ReviewMode } from "@/lib/wolf-council/review";
import { zenmuxChat } from "@/lib/wolf-council/zenmux";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RequestBody = {
  wolfId?: unknown;
  boardId?: unknown;
  question?: unknown;
  previousWolfAnswer?: unknown;
  previousLabel?: unknown;
  locale?: unknown;
  mode?: unknown;
  demo?: unknown;
  history?: unknown;
  stance?: unknown;
};

function asText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isLocale(value: string): value is AppLocale {
  return value === "zh" || value === "en";
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const wolfId = asText(body.wolfId, 40);
  const boardId = asText(body.boardId, 40);
  const question = asText(body.question, 4000);
  const localeText = asText(body.locale, 8) || "en";
  if (!wolfId || !boardId || !question || !isLocale(localeText)) {
    return Response.json({ error: "wolfId, boardId, question, and locale are required" }, { status: 400 });
  }
  const board = getBoard(boardId);
  const wolf = board && board.type === "advisor" ? boardWolves(board).find((item) => item.id === wolfId) : undefined;
  if (!board || board.type !== "advisor" || !wolf) {
    return Response.json({ error: "unknown board or wolf" }, { status: 400 });
  }

  const demo = body.demo === true || body.demo === "fail";
  const mode: ReviewMode = body.mode === "single" ? "single" : "debate";
  const previousWolfAnswer = asText(body.previousWolfAnswer, 4000);
  const previousLabel = asText(body.previousLabel, 40) || null;
  const stance = typeof body.stance === "number" && body.stance >= 0 && body.stance <= 2 ? body.stance : 0;
  const history = normHistory(body.history);
  const fallbackInput = {
    wolf,
    board,
    locale: localeText,
    question,
    previousLabel,
    demo,
    stance,
  };

  if (!isZenmuxConfigured()) {
    return Response.json(localFallback({ ...fallbackInput, fallback: "missing_key" }) satisfies PublicTurn);
  }

  const quota = await consumeCouncilTurn(request);
  if (!quota.ok) {
    return Response.json(localFallback({ ...fallbackInput, fallback: "rate_limit" }) satisfies PublicTurn);
  }

  try {
    const advisor = buildAdvisorPrompt(wolf, board);
    const turn = await councilTurn({
      advisor,
      question,
      previousWolfAnswer,
      mode,
      demo,
      history,
      locale: localeText,
      chat: zenmuxChat,
    });
    const payload: PublicTurn = { ...turn, fallback: null };
    return applyRateLimitCookies(Response.json(payload), quota.cookies);
  } catch (error) {
    console.error("[council-turn]", error instanceof Error ? error.message : "call failed");
    return applyRateLimitCookies(
      Response.json(localFallback({ ...fallbackInput, fallback: "call_failed" }) satisfies PublicTurn),
      quota.cookies,
    );
  }
}
