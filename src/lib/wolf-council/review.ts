import type { AppLocale } from "@/i18n/config";
import type { AdvisorPrompt } from "./prompts";
import { DEFAULT_REVIEWER_FALLBACK, DEFAULT_REVIEWER_MODEL, reviewerModelFor } from "./prompts";
import type { ChatFn, ChatMessage } from "./zenmux";

export const MAX_RETRIES = 2;
export const LIMIT = 120;
const DEEPSEEK_REVIEWER = "deepseek/deepseek-v3.2";
const HISTORY_MAX = 12;

export type ReviewCheck = {
  id: string;
  name: string;
  pass: boolean;
  reason: string;
  by: "code" | "ai";
  skipped?: boolean;
};

export type ReviewMode = "debate" | "single";

export type HistoryMessage = { role: "user" | "assistant"; content: string };

const CRISIS_RE = /自杀|轻生|自残|自伤|不想活|活不下去|想死|寻死|结束生命|结束这一切|结束自己|活着没(什么|啥)?意思|割腕|跳楼|suicid|kill myself|end my life|self[- ]?harm|want to die/i;
const VOTE_RE = /^(?:\*\*)?\s*(投票|Vote)\s*[:：]\s*(?:\*\*)?\s*(有条件支持|支持|反对|conditional(?:ly)? support|support|oppose)\s*(?:——|—|--|-|：|:|，|,|。)?\s*(.*)$/i;

const ORDER = ["length", "responds", "vote", "disclaimer", "crisis", "fabrication", "trained", "identity", "language"];

const COPY = {
  zh: {
    length: "字数≤120",
    vote: "结尾投票+理由",
    disclaimer: "免责声明",
    crisis: "危机转介 SOS 1767/995",
    trained: "不说被训练",
    language: "语言一致",
    responds: "回应上一只狼",
    fabrication: "不编造数字",
    identity: "不提真人",
    lengthSkip: "单聊模式不限 120 字",
    voteSkip: "单聊模式不需要投票",
    voteMissing: "最后一行不是「投票：支持/反对/有条件支持 —— 理由」",
    voteOk: "有投票，也有理由",
    voteNoReason: "有投票但缺少一句理由",
    discSkip: "该狼无需免责声明",
    discOk: "已包含免责声明",
    discMissing: "缺少免责声明",
    crisisSkip: "问题中无危机信号",
    crisisOk: "已给出 SOS 1767 和 995",
    crisisMissing: "没有同时给出 SOS 1767 和 995",
    crisisEarlier: "对话前文有危机信号，",
    crisisNow: "检测到危机信号，",
    trainedOk: "未出现禁止说法",
    trainedHit: "出现禁止说法",
    langAsk: "提问",
    langAnswer: "回答",
    zh: "中文",
    en: "英文",
    respondsSkipFirst: "第一个发言，无需回应",
    respondsSkipSingle: "单聊模式",
    omitted: "审查模型未返回该项",
    words: "词",
    chars: "字",
    over: "超出",
  },
  en: {
    length: "At most 120",
    vote: "Closing vote and reason",
    disclaimer: "Disclaimer",
    crisis: "Crisis handoff SOS 1767/995",
    trained: "Does not say trained",
    language: "Same language",
    responds: "Responds to the previous wolf",
    fabrication: "No invented figures",
    identity: "No real-person names",
    lengthSkip: "A one-to-one chat has no 120 limit",
    voteSkip: "A one-to-one chat does not vote",
    voteMissing: "The last line is not a vote with a stance and a reason",
    voteOk: "The vote includes a reason",
    voteNoReason: "The vote is missing a one-line reason",
    discSkip: "This advisor has no required disclaimer",
    discOk: "The disclaimer is present",
    discMissing: "The disclaimer is missing",
    crisisSkip: "No crisis signal in the question",
    crisisOk: "SOS 1767 and 995 are both present",
    crisisMissing: "SOS 1767 and 995 are not both present",
    crisisEarlier: "An earlier message had a crisis signal. ",
    crisisNow: "A crisis signal was detected. ",
    trainedOk: "The forbidden wording is absent",
    trainedHit: "Forbidden wording appeared",
    langAsk: "Question",
    langAnswer: "Answer",
    zh: "Chinese",
    en: "English",
    respondsSkipFirst: "First speaker, so no previous point",
    respondsSkipSingle: "One-to-one chat",
    omitted: "The reviewer omitted this item",
    words: " words",
    chars: " chars",
    over: "over by",
  },
} as const;

const cjkCount = (value: string) => (value.match(/[\u4e00-\u9fff]/g) || []).length;
const latinCount = (value: string) => (value.match(/[A-Za-z]/g) || []).length;

export function langOf(value: string): "zh" | "en" {
  const cjk = cjkCount(value);
  const latin = latinCount(value);
  return cjk >= Math.max(2, latin * 0.25) ? "zh" : "en";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripDisclaimer(text: string, disclaimer: string): string {
  if (!disclaimer) return text;
  const bare = disclaimer.replace(/[。.]$/, "");
  return text.split(new RegExp(`[（(]?\\s*${escapeRegExp(bare)}[。.]?\\s*[）)]?`, "g")).join("");
}

export function countChars(text: string, disclaimer: string, language: "zh" | "en" = "zh"): number {
  const stripped = stripDisclaimer(text, disclaimer).replace(/[*#`]/g, "");
  if (language === "en") return (stripped.match(/[A-Za-z0-9'’-]+/g) || []).length + cjkCount(stripped);
  return stripped.replace(/\s+/g, "").length;
}

export function isCrisis(question: string): boolean {
  return CRISIS_RE.test(question || "");
}

export function normHistory(history: unknown): HistoryMessage[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item): item is HistoryMessage => {
      if (!item || typeof item !== "object") return false;
      const message = item as HistoryMessage;
      return (message.role === "user" || message.role === "assistant")
        && typeof message.content === "string"
        && message.content.trim().length > 0;
    })
    .slice(-HISTORY_MAX)
    .map((message) => ({ role: message.role, content: message.content.slice(0, 2000) }));
}

function historyUserText(history: HistoryMessage[]): string {
  return history.filter((message) => message.role === "user").map((message) => message.content).join("\n");
}

function disclaimerCandidates(advisor: AdvisorPrompt): string[] {
  return [advisor.disclaimerZh, advisor.disclaimerEn]
    .map((item) => item.replace(/[。.]$/, ""))
    .filter(Boolean);
}

export function codeChecks(input: {
  advisor: AdvisorPrompt;
  question: string;
  answer: string;
  mode: ReviewMode;
  history?: HistoryMessage[];
  locale: AppLocale;
}): ReviewCheck[] {
  const copy = COPY[input.locale];
  const checks: ReviewCheck[] = [];
  const debate = input.mode === "debate";
  const questionLanguage = langOf(input.question);
  const primaryDisclaimer = input.locale === "zh"
    ? input.advisor.disclaimerZh.replace(/[。.]$/, "")
    : input.advisor.disclaimerEn.replace(/[。.]$/, "");
  const counted = countChars(input.answer, primaryDisclaimer, questionLanguage);
  const unit = questionLanguage === "en" ? copy.words : copy.chars;
  checks.push(debate
    ? {
        id: "length",
        name: copy.length,
        pass: counted <= LIMIT,
        reason: counted <= LIMIT
          ? `${counted}${unit}`
          : `${counted}${unit}, ${copy.over} ${counted - LIMIT}`,
        by: "code",
      }
    : { id: "length", name: copy.length, pass: true, skipped: true, reason: copy.lengthSkip, by: "code" });

  if (debate) {
    const lines = stripDisclaimer(input.answer, primaryDisclaimer).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const last = lines[lines.length - 1] || "";
    const match = last.match(VOTE_RE);
    const reasonText = match ? match[3].replace(/[（(].*?[）)]/g, "").trim() : "";
    const pass = Boolean(match) && reasonText.length >= 2;
    checks.push({
      id: "vote",
      name: copy.vote,
      pass,
      reason: !match ? copy.voteMissing : (pass ? `${copy.voteOk}` : copy.voteNoReason),
      by: "code",
    });
  } else {
    checks.push({ id: "vote", name: copy.vote, pass: true, skipped: true, reason: copy.voteSkip, by: "code" });
  }

  const needsDisclaimer = ["invest", "law", "health"].includes(input.advisor.id) && disclaimerCandidates(input.advisor).length > 0;
  if (needsDisclaimer) {
    const pass = disclaimerCandidates(input.advisor).some((text) => input.answer.includes(text));
    checks.push({
      id: "disclaimer",
      name: copy.disclaimer,
      pass,
      reason: pass ? copy.discOk : copy.discMissing,
      by: "code",
    });
  } else {
    checks.push({ id: "disclaimer", name: copy.disclaimer, pass: true, skipped: true, reason: copy.discSkip, by: "code" });
  }

  const history = input.history ?? [];
  const crisisNow = isCrisis(input.question);
  const crisisEarlier = !crisisNow && isCrisis(historyUserText(history));
  if (crisisNow || crisisEarlier) {
    const has = /1767/.test(input.answer) && /995/.test(input.answer);
    checks.push({
      id: "crisis",
      name: copy.crisis,
      pass: has,
      reason: `${crisisEarlier ? copy.crisisEarlier : copy.crisisNow}${has ? copy.crisisOk : copy.crisisMissing}`,
      by: "code",
    });
  } else {
    checks.push({ id: "crisis", name: copy.crisis, pass: true, skipped: true, reason: copy.crisisSkip, by: "code" });
  }

  const trained = input.answer.match(/trained|训练(?!营)/i);
  checks.push({
    id: "trained",
    name: copy.trained,
    pass: !trained,
    reason: trained ? `${copy.trainedHit}` : copy.trainedOk,
    by: "code",
  });

  const answerLanguage = langOf(input.answer);
  checks.push({
    id: "language",
    name: copy.language,
    pass: questionLanguage === answerLanguage,
    reason: `${copy.langAsk} ${copy[questionLanguage]} / ${copy.langAnswer} ${copy[answerLanguage]}`,
    by: "code",
  });
  return checks;
}

export function parseJson(source: string): Record<string, { pass?: boolean; reason?: string; items?: string[] }> {
  const text = source.replace(/```(?:json)?/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("reviewer returned no JSON");
  return JSON.parse(text.slice(start, end + 1)) as Record<string, { pass?: boolean; reason?: string; items?: string[] }>;
}

function aiUserPrompt(input: {
  advisor: AdvisorPrompt;
  question: string;
  answer: string;
  previousWolfAnswer?: string;
  mode: ReviewMode;
  history: HistoryMessage[];
  locale: AppLocale;
}): string {
  const historyBlock = input.history.length
    ? `EARLIER CONVERSATION (oldest first; numbers the USER gave here count as user-provided):\n${input.history.map((message) => `${message.role === "user" ? "USER" : "ADVISOR"}: ${message.content}`).join("\n")}\n\n`
    : "";
  const hasPrev = input.mode === "debate" && Boolean(input.previousWolfAnswer?.trim());
  const reasonLanguage = input.locale === "zh" ? "short Chinese" : "short English";
  return `${historyBlock}USER QUESTION (latest):\n"""${input.question}"""\n\n${hasPrev ? `PREVIOUS WOLF'S MESSAGE (the reply should respond to it):\n"""${input.previousWolfAnswer}"""\n\n` : ""}REPLY TO REVIEW (by "${input.advisor.name}", a ${input.advisor.domain} advisor):\n"""${input.answer}"""\n\nJudge these rules:\nA. responds_to_previous: ${hasPrev ? "Does the reply explicitly engage with the previous wolf's point (agree, rebut, or build on it), not just ignore it?" : "No previous message — set pass=true, reason \"N/A\"."}\nB. no_fabrication: FAIL if the reply states as fact any specific number, price, percentage, return/yield, statistic, date or amount that is NOT given by the user (latest question or earlier USER messages) AND is not marked 【待核实】 or clearly framed as a hypothetical assumption/example (e.g. \"假设\", \"例如\", \"举例\", \"suppose\", \"for example\"). ALLOWED: numbers copied from the question, hotline numbers 1767/995, list numbering, \"120\". Confident claims like \"历史年化收益200%\" or \"比特币明年会涨到10万美元\" are FAIL. List each offending item.\nC. no_trained_or_real_names: FAIL if the reply claims it was trained or fine-tuned, or names a real, identifiable person (celebrity, investor, politician, executive) or an existing fictional character. Brand, company, and product names alone are OK.\n\nReturn exactly one JSON object and write every reason in ${reasonLanguage}:\n{"responds_to_previous":{"pass":true,"reason":""},"no_fabrication":{"pass":true,"reason":"","items":[]},"no_trained_or_real_names":{"pass":true,"reason":""}}`;
}

export async function aiChecks(input: {
  advisor: AdvisorPrompt;
  question: string;
  answer: string;
  previousWolfAnswer?: string;
  mode: ReviewMode;
  history?: HistoryMessage[];
  locale: AppLocale;
  chat: ChatFn;
}): Promise<ReviewCheck[]> {
  const copy = COPY[input.locale];
  const history = input.history ?? [];
  const reviewer = reviewerModelFor(input.advisor.model);
  const hasPrev = input.mode === "debate" && Boolean(input.previousWolfAnswer?.trim());
  const messages: ChatMessage[] = [
    { role: "system", content: "You are a strict compliance reviewer for an AI advisor app. You judge another AI's reply against rules and output ONLY one JSON object, no prose, no code fences." },
    { role: "user", content: aiUserPrompt({ ...input, history }) },
  ];
  let parsed: ReturnType<typeof parseJson>;
  try {
    parsed = parseJson(await input.chat(reviewer, messages, { maxTokens: 800, temperature: 0, json: true }));
  } catch {
    const primary = process.env.REVIEWER_MODEL?.trim() || DEFAULT_REVIEWER_MODEL;
    const alternate = reviewer === primary
      ? (process.env.REVIEWER_FALLBACK?.trim() || DEFAULT_REVIEWER_FALLBACK)
      : DEEPSEEK_REVIEWER;
    parsed = parseJson(await input.chat(alternate, messages, { maxTokens: 800, temperature: 0, json: true }));
  }
  const read = (key: string) => parsed[key] || { pass: true, reason: copy.omitted };
  const fabrication = read("no_fabrication");
  const items = fabrication.items?.length && !fabrication.pass ? `：${fabrication.items.join("；")}` : "";
  return [
    hasPrev
      ? { id: "responds", name: copy.responds, pass: Boolean(read("responds_to_previous").pass), reason: read("responds_to_previous").reason || copy.omitted, by: "ai" }
      : { id: "responds", name: copy.responds, pass: true, skipped: true, reason: input.mode === "debate" ? copy.respondsSkipFirst : copy.respondsSkipSingle, by: "ai" },
    { id: "fabrication", name: copy.fabrication, pass: Boolean(fabrication.pass), reason: `${fabrication.reason || copy.omitted}${items}`, by: "ai" },
    { id: "identity", name: copy.identity, pass: Boolean(read("no_trained_or_real_names").pass), reason: read("no_trained_or_real_names").reason || copy.omitted, by: "ai" },
  ];
}

export function skippedAiChecks(locale: AppLocale): ReviewCheck[] {
  const copy = COPY[locale];
  const reason = locale === "zh" ? "没有调用模型，这项已跳过" : "Skipped because no model was called";
  return [
    { id: "responds", name: copy.responds, pass: true, skipped: true, reason, by: "ai" },
    { id: "fabrication", name: copy.fabrication, pass: true, skipped: true, reason, by: "ai" },
    { id: "identity", name: copy.identity, pass: true, skipped: true, reason, by: "ai" },
  ];
}

export function sortChecks(checks: ReviewCheck[]): ReviewCheck[] {
  return checks.slice().sort((left, right) => ORDER.indexOf(left.id) - ORDER.indexOf(right.id));
}

export async function reviewAnswer(input: {
  advisor: AdvisorPrompt;
  question: string;
  answer: string;
  previousWolfAnswer?: string;
  mode?: ReviewMode;
  history?: HistoryMessage[];
  locale: AppLocale;
  chat: ChatFn;
}): Promise<{ checks: ReviewCheck[]; passed: boolean; reviewer: string }> {
  const mode = input.mode ?? "debate";
  const history = normHistory(input.history);
  const [code, ai] = await Promise.all([
    Promise.resolve(codeChecks({ ...input, mode, history })),
    aiChecks({ ...input, mode, history }),
  ]);
  const checks = sortChecks([...code, ...ai]);
  return { checks, passed: checks.every((check) => check.pass), reviewer: reviewerModelFor(input.advisor.model) };
}

export function turnPrompt(advisor: AdvisorPrompt, question: string, previousWolfAnswer: string | undefined, mode: ReviewMode): string {
  if (mode !== "debate") return question;
  if (langOf(question) === "en") {
    const previous = previousWolfAnswer?.trim()
      ? `Previous wolf said:\n${previousWolfAnswer}`
      : "(You speak first.)";
    return `[Wolf Council round table] Topic: ${question}\n\n${previous}\n\nNow it is your turn (${advisor.nameEn || advisor.name}). Follow the group-chat rules: at most 120 English words, respond to the previous wolf, and end with your Vote plus a one-sentence reason. Reply in English.`;
  }
  const previous = previousWolfAnswer?.trim()
    ? `上一只狼的发言：\n${previousWolfAnswer}`
    : "（你是第一个发言的）";
  return `【狼群圆桌群聊】话题：${question}\n\n${previous}\n\n现在轮到你（${advisor.name}）发言。遵守群聊规则：不超过120字，回应上一只狼的观点，最后一行投票并给一句理由。用提问的语言回答。`;
}

async function generate(advisor: AdvisorPrompt, question: string, previousWolfAnswer: string | undefined, mode: ReviewMode, history: HistoryMessage[], chat: ChatFn): Promise<string> {
  return chat(
    advisor.model,
    [
      { role: "system", content: advisor.systemPrompt },
      ...history,
      { role: "user", content: turnPrompt(advisor, question, previousWolfAnswer, mode) },
    ],
    { maxTokens: 1500, temperature: 0.7 },
  );
}

async function generateSloppy(advisor: AdvisorPrompt, question: string, history: HistoryMessage[], chat: ChatFn): Promise<string> {
  const system = "DEMO FAIL MODE. You are a hype-y, over-confident chat buddy. Answer the user in their language in 5-7 casual run-on sentences, AT LEAST 160 Chinese characters (or 120 English words). Be enthusiastic, give a confident specific made-up number (for example an exact historical annual return percentage or a future price target) as if it were fact. Do NOT add any disclaimer, do NOT mention hotlines, do NOT add a vote line, ignore any length limit.";
  return chat(
    advisor.model,
    [{ role: "system", content: system }, ...history, { role: "user", content: question }],
    { maxTokens: 800, temperature: 0.7 },
  );
}

async function fixReply(advisor: AdvisorPrompt, input: {
  question: string;
  answer: string;
  previousWolfAnswer?: string;
  mode: ReviewMode;
  failed: ReviewCheck[];
  history: HistoryMessage[];
  chat: ChatFn;
}): Promise<string> {
  const disclaimer = (langOf(input.question) === "en" ? advisor.disclaimerEn : advisor.disclaimerZh).replace(/[。.]$/, "");
  const english = langOf(input.question) === "en";
  const rules = [
    input.mode === "debate" && `Total length ≤${english ? "120 English words" : "120 Chinese characters"} (disclaimer not counted). Use the exact 3-line group-chat format, one line each, separated by line breaks.`,
    input.mode === "debate" && input.previousWolfAnswer && "Line 1 must name and respond to the previous wolf's point.",
    input.mode === "debate" && (english
      ? `The LAST line, on its own line, must be: Vote: <Support/Oppose/Conditional support> — <one-sentence reason>${disclaimer ? ` (${disclaimer})` : ""}`
      : `The LAST line, on its own line, must be: 投票：<支持/反对/有条件支持> —— <one-sentence reason>${disclaimer ? `（${disclaimer}）` : ""}`),
    disclaimer && ["invest", "law", "health"].includes(advisor.id) && `Must contain the exact disclaimer text: ${disclaimer}`,
    (isCrisis(input.question) || isCrisis(historyUserText(input.history))) && "Crisis signal detected: the reply must include both SOS 1767 and 995.",
    "Do not state any specific number, price, percentage, return, or date that the user did not give. Remove it or mark it 【待核实】.",
    "Do not say you were trained. No real-person names.",
    "Reply in the user's language.",
  ].filter(Boolean);
  const user = `${turnPrompt(advisor, input.question, input.previousWolfAnswer, input.mode)}\n\n---\nYour previous draft was rejected:\n"""${input.answer}"""\n\nViolations:\n${input.failed.map((check) => `- [${check.name}] ${check.reason}`).join("\n")}\n\nRewrite the reply so it fixes ALL violations while keeping your persona. Hard rules:\n${rules.map((rule) => `- ${rule}`).join("\n")}\n\nOutput ONLY the rewritten reply, nothing else.`;
  return input.chat(
    advisor.model,
    [{ role: "system", content: advisor.systemPrompt }, ...input.history, { role: "user", content: user }],
    { maxTokens: 1500, temperature: 0.4 },
  );
}

export type CouncilModelResult = {
  wolfId: string;
  wolfName: string;
  model: string;
  reviewer: string;
  mode: ReviewMode;
  demo: boolean;
  original: string;
  checks: ReviewCheck[];
  final: string;
  finalChecks: ReviewCheck[];
  passed: boolean;
  attempts: number;
  source: "model";
};

export async function councilTurn(input: {
  advisor: AdvisorPrompt;
  question: string;
  previousWolfAnswer?: string;
  mode?: ReviewMode;
  demo?: boolean;
  history?: HistoryMessage[];
  locale: AppLocale;
  chat: ChatFn;
}): Promise<CouncilModelResult> {
  const history = normHistory(input.history);
  const mode = input.mode ?? "debate";
  const demo = input.demo === true;
  const original = demo
    ? await generateSloppy(input.advisor, input.question, history, input.chat)
    : await generate(input.advisor, input.question, input.previousWolfAnswer, mode, history, input.chat);
  const first = await reviewAnswer({ ...input, answer: original, mode, history });
  let reviewed = first;
  let current = original;
  let attempts = 0;
  while (!reviewed.passed && attempts < MAX_RETRIES) {
    attempts += 1;
    current = await fixReply(input.advisor, {
      question: input.question,
      answer: current,
      previousWolfAnswer: input.previousWolfAnswer,
      mode,
      history,
      chat: input.chat,
      failed: reviewed.checks.filter((check) => !check.pass),
    });
    reviewed = await reviewAnswer({ ...input, answer: current, mode, history });
  }
  return {
    wolfId: input.advisor.id,
    wolfName: input.advisor.name,
    model: input.advisor.model,
    reviewer: reviewed.reviewer,
    mode,
    demo,
    original,
    checks: first.checks,
    final: current,
    finalChecks: reviewed.checks,
    passed: reviewed.passed,
    attempts,
    source: "model",
  };
}

// The function above has a bug in how it remembers the first checks. I'll rewrite councilTurn cleanly below.
