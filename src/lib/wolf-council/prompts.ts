import type { AppLocale } from "@/i18n/config";
import type { Board, Wolf } from "./data";
import personas from "./advisor-personas.json";
import xOps from "./x-ops.json";

export const DEFAULT_GPT_MODEL = "openai/gpt-5.2-chat";
export const CLAUDE_MODEL = "anthropic/claude-haiku-5.5";
export const GEMINI_MODEL = "google/gemini-3.1-flash-lite";
export const DEEPSEEK_MODEL = "deepseek/deepseek-v3.2";
export const MINIMAX_MODEL = "minimax/minimax-m2.1";
export const DEFAULT_REVIEWER_MODEL = CLAUDE_MODEL;
export const DEFAULT_REVIEWER_FALLBACK = GEMINI_MODEL;

export type PersonaRecord = {
  id: string;
  name: string;
  nameEn: string;
  model: string;
  domain: string;
  disclaimer: string;
  catchphrase: string;
  systemPrompt: string;
};

export type AdvisorPrompt = {
  id: string;
  name: string;
  nameEn: string;
  model: string;
  domain: string;
  disclaimerZh: string;
  disclaimerEn: string;
  systemPrompt: string;
};

const personaById = Object.fromEntries(
  (personas as PersonaRecord[]).map((persona) => [persona.id, persona]),
) as Record<string, PersonaRecord>;

const xRoleByCard = Object.fromEntries(
  xOps.roles.map((role) => [role.cardId, role]),
) as Record<string, { cardId: string; role: string; systemPrompt: string }>;

const GROUP_RULES = `## Group chat rules
- HARD LIMIT: each turn is at most 120 Chinese characters (or 120 English words), INCLUDING the vote line.
- Use EXACTLY this 3-line format and nothing else (no name prefix, no headings, no bold, no tables, no lists):
  Line 1: one sentence that names the previous advisor and responds to their point.
  Line 2: one sentence with your own key point.
  Line 3: 投票：<支持/反对/有条件支持> —— <one-sentence reason>
  In English conversations, line 3 is "Vote: <Support/Oppose/Conditional support> — <one-sentence reason>".
- If you speak first, line 1 responds to the user's topic.
- If a disclaimer is required, append it in parentheses at the end of line 3. The disclaimer does not count toward the 120 limit.
- Never say you were built from a training process. No real-person names.
- Reply in the user's language.`;

export function cardModel(cardId: string, env: NodeJS.ProcessEnv = process.env): string {
  if (cardId === "gpt") return env.ZENMUX_GPT_MODEL?.trim() || DEFAULT_GPT_MODEL;
  if (cardId === "health") return CLAUDE_MODEL;
  if (cardId === "consult") return GEMINI_MODEL;
  if (cardId === "invest") return DEEPSEEK_MODEL;
  if (cardId === "law") return MINIMAX_MODEL;
  throw new Error(`unknown wolfId: ${cardId}`);
}

export function reviewerModelFor(wolfModel: string, env: NodeJS.ProcessEnv = process.env): string {
  const reviewer = env.REVIEWER_MODEL?.trim() || DEFAULT_REVIEWER_MODEL;
  const fallback = env.REVIEWER_FALLBACK?.trim() || DEFAULT_REVIEWER_FALLBACK;
  return wolfModel === reviewer ? fallback : reviewer;
}

function disclaimerFor(wolf: Wolf): { zh: string; en: string } {
  return { zh: wolf.disclaimer.zh, en: wolf.disclaimer.en };
}

function gptPrompt(wolf: Wolf): string {
  return [
    `## Identity`,
    `You are GPT, an AI advisor in the Wolf Hall council. ${wolf.tagline.en} ${wolf.tagline.zh}`,
    `Catchphrase, at most once: "${wolf.catchphrase.zh}" / "${wolf.catchphrase.en}".`,
    `Personality: ${wolf.personality.en.join(", ")}. Decision style: ${wolf.decisionStyle.en}`,
    `You are an AI advisor. Do not claim to be a human or a licensed professional.`,
    GROUP_RULES,
  ].join("\n");
}

/** Drop the "You are Qwen/DeepSeek/..." identity so board guidance does not rename the speaker. */
export function asDomainGuidance(prompt: string): string {
  return prompt.replace(
    /^## Identity\n[\s\S]*?(?=\n## )/u,
    "## Domain guidance\nUse this domain's standards. Do not change your own name or persona.\n",
  );
}

function boardGuidance(board: Board, cardId: string): string {
  if (board.id === "social") {
    const role = xRoleByCard[cardId];
    const rolePrompt = role?.systemPrompt ?? "";
    return [
      `## Account Operations board`,
      `You are drafting for the X account @LucaAiAi, in the seat "${role?.role ?? "advisor"}".`,
      `These rules win over any urge to sound finished:`,
      `- Drafts only. Never claim a post was published, an account was followed, or a message was sent.`,
      `- Any fact the user did not give you, and that you cannot verify, is marked 【待核实】.`,
      `- An X post is at most 280 weighted characters. Each CJK character counts as 2. Latin letters count as 1.`,
      `- Do not name a real person. Call the decision-maker 账号主人.`,
      rolePrompt,
      `## Debate turn override`,
      `Ignore any request for a 600-character essay. This is a round table. Obey the 3-line group-chat limit of 120 Chinese characters or 120 English words. If you include a post draft, it must fit inside that turn and still respect the 280 weighted cap.`,
    ].join("\n");
  }
  const leadId = board.lead;
  if (!leadId || leadId === cardId) {
    return `## Board\nYou are seated on the ${board.name.en} (${board.name.zh}) council. Answer for this board and keep your own persona.`;
  }
  const lead = personaById[leadId];
  if (!lead) {
    return `## Board\nYou are seated on the ${board.name.en} (${board.name.zh}) council. Keep your own persona.`;
  }
  return [
    `## Board`,
    `You are seated on the ${board.name.en} (${board.name.zh}) council.`,
    `Keep your own persona. Also apply this board's domain guidance:`,
    asDomainGuidance(lead.systemPrompt),
  ].join("\n\n");
}

export function buildAdvisorPrompt(wolf: Wolf, board: Board): AdvisorPrompt {
  const persona = personaById[wolf.id];
  const base = persona?.systemPrompt ?? gptPrompt(wolf);
  const disc = disclaimerFor(wolf);
  const systemPrompt = `${base}\n\n${boardGuidance(board, wolf.id)}`;
  return {
    id: wolf.id,
    name: persona?.name ?? wolf.modelLabel,
    nameEn: persona?.nameEn ?? wolf.modelLabel,
    model: cardModel(wolf.id),
    domain: persona?.domain ?? board.name.en,
    disclaimerZh: disc.zh || persona?.disclaimer || "",
    disclaimerEn: disc.en,
    systemPrompt,
  };
}

export function activeDisclaimer(advisor: AdvisorPrompt, locale: AppLocale): string {
  const text = locale === "zh" ? advisor.disclaimerZh : advisor.disclaimerEn;
  return text.replace(/[。.]$/, "");
}
