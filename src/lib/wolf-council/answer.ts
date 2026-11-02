import type { AppLocale } from "@/i18n/config";
import { replyNotices, type Board, type Wolf } from "./data";
import { adviceLines } from "./logic";
import { buildAdvisorPrompt } from "./prompts";
import {
  codeChecks,
  skippedAiChecks,
  sortChecks,
  type ReviewCheck,
} from "./review";
import { isCrisis } from "./review";

export type TurnFallback = "missing_key" | "rate_limit" | "call_failed";

export type PublicTurn = {
  source: "model" | "mock";
  wolfId: string;
  model: string;
  reviewer: string;
  original: string;
  checks: ReviewCheck[];
  final: string;
  finalChecks: ReviewCheck[];
  attempts: number;
  passed: boolean;
  fallback: TurnFallback | null;
  demo: boolean;
};

export function mockAnswer(
  wolf: Wolf,
  board: Board,
  locale: AppLocale,
  previousLabel: string | null,
  question: string,
  stance = 0,
): string {
  const lines = adviceLines(wolf, locale, previousLabel, stance);
  const notices = replyNotices(wolf, board, locale);
  const bare = notices.disclaimer.replace(/[。.]$/, "");
  if (bare && !lines.join("\n").includes(bare)) {
    lines[2] = locale === "zh" ? `${lines[2]}（${notices.disclaimer}）` : `${lines[2]} (${notices.disclaimer})`;
  }
  let text = lines.join("\n");
  if (isCrisis(question) && !(/1767/.test(text) && /995/.test(text))) {
    text = `${text}\nSOS 1767 / 995`;
  }
  return text;
}

export function sloppyDraft(locale: AppLocale): string {
  if (locale === "zh") {
    return "别问了，这事闭眼冲就对了。我亲自算过历史年化收益百分之两百，明天一定涨到十万美元。全仓买入不要犹豫，错过就是一辈子的遗憾，现在不买以后肯定后悔。相信我这次绝对稳赚不赔，再拖一天就来不及了，赶紧把全部积蓄都放进去，别再问风险，也别再问期限吧啊。";
  }
  return "I personally calculated a historical annual return of exactly two hundred percent and a target of one hundred thousand dollars tomorrow, so go all in right now and do not hesitate. ".repeat(4);
}

export function localFallback(input: {
  wolf: Wolf;
  board: Board;
  locale: AppLocale;
  question: string;
  previousLabel: string | null;
  demo: boolean;
  fallback: TurnFallback;
  stance?: number;
}): PublicTurn {
  const advisor = buildAdvisorPrompt(input.wolf, input.board);
  const final = mockAnswer(
    input.wolf,
    input.board,
    input.locale,
    input.previousLabel,
    input.question,
    input.stance ?? 0,
  );
  const original = input.demo ? sloppyDraft(input.locale) : final;
  const checks = sortChecks([
    ...codeChecks({ advisor, question: input.question, answer: original, mode: "debate", locale: input.locale }),
    ...skippedAiChecks(input.locale),
  ]);
  const finalChecks = sortChecks([
    ...codeChecks({ advisor, question: input.question, answer: final, mode: "debate", locale: input.locale }),
    ...skippedAiChecks(input.locale),
  ]);
  const originalFailed = checks.some((check) => !check.pass);
  return {
    source: "mock",
    wolfId: input.wolf.id,
    model: advisor.model,
    reviewer: "",
    original,
    checks,
    final,
    finalChecks,
    attempts: input.demo && originalFailed ? 1 : 0,
    passed: finalChecks.every((check) => check.pass),
    fallback: input.fallback,
    demo: input.demo,
  };
}
