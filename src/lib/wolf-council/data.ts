import type { AppLocale } from "@/i18n/config";
import content from "./content.json";

export type WolfId = "invest" | "consult" | "law" | "health" | "study";
export type BoardId = "invest" | "business" | "legal" | "learning" | "social" | "werewolf";
export type OutputStyle = "table" | "story" | "checklist" | "questions";

export type LocaleMap<T> = Record<AppLocale, T>;

export type Wolf = {
  id: string;
  modelLabel: "GPT" | "Claude" | "Gemini" | "DeepSeek" | "MiniMax" | "Qwen";
  avatar: string;
  tagline: LocaleMap<string>;
  catchphrase: LocaleMap<string>;
  personality: LocaleMap<string[]>;
  decisionStyle: LocaleMap<string>;
  hobbies: LocaleMap<string>;
  outputStyle: OutputStyle;
  disclaimer: LocaleMap<string>;
  crisis: LocaleMap<string>;
  sampleQuestions: LocaleMap<string[]>;
  mock: {
    open: LocaleMap<string>;
    reply: LocaleMap<string>;
    point: LocaleMap<string>;
    reason: LocaleMap<string[]>;
  };
};

export type Board = {
  id: BoardId;
  type: "advisor" | "game";
  icon: string;
  tint: string;
  name: LocaleMap<string>;
  tagline: LocaleMap<string>;
  disclaimer: boolean;
  lead: WolfId | null;
  wolfIds: WolfId[];
  sampleQuestions: LocaleMap<string[]> | null;
  art: string[];
};

export const WOLVES = content.wolves as unknown as Record<WolfId, Wolf>;
export const BOARDS = content.boards as unknown as Board[];

export const MODEL_LABELS = ["DeepSeek", "Gemini", "MiniMax", "Claude", "Qwen"] as const;

export function getBoard(id: string): Board | null {
  return BOARDS.find((board) => board.id === id) ?? null;
}

const PORTRAIT: Record<string, string> = {
  GPT: "/wolf-council/advisors/gpt.jpg",
  Claude: "/wolf-council/advisors/claude.jpg",
  Gemini: "/wolf-council/advisors/gemini.jpg",
  DeepSeek: "/wolf-council/advisors/deepseek.jpg",
  MiniMax: "/wolf-council/advisors/minimax.jpg",
};

const gptWolf: Wolf = {
  id: "gpt",
  modelLabel: "GPT",
  avatar: PORTRAIT.GPT,
  tagline: {
    zh: "先把问题说清楚，再给一个稳妥的下一步。",
    en: "States the question plainly, then offers one steady next step.",
  },
  catchphrase: {
    zh: "先把事实摆齐。",
    en: "Line the facts up first.",
  },
  personality: {
    zh: ["清楚", "稳妥", "中立"],
    en: ["Clear", "Steady", "Neutral"],
  },
  decisionStyle: {
    zh: "先列出目标、限制和未知，再决定下一步。",
    en: "Lists the goal, the limits, and the unknowns before choosing a next step.",
  },
  hobbies: {
    zh: "把很长的问题收成一张短清单。",
    en: "Turns a long question into a short list.",
  },
  outputStyle: "checklist",
  disclaimer: { zh: "", en: "" },
  crisis: { zh: "", en: "" },
  sampleQuestions: {
    zh: ["这件事里，你最想先解决哪一件？"],
    en: ["Which part of this do you want to settle first?"],
  },
  mock: {
    open: {
      zh: "我先收成一句：你最想先解决哪一件事？",
      en: "Let me put it in one line: which part do you want to settle first?",
    },
    reply: {
      zh: "{prev}提到的那一点，我先核对事实再表态。",
      en: "On the point {prev} raised, I want the facts straight before I take a side.",
    },
    point: {
      zh: "先定目标，再选最小的下一步。",
      en: "Set the goal, then pick the smallest next step.",
    },
    reason: {
      zh: ["目标清楚", "信息还不够", "先做一小步"],
      en: ["the goal is clear", "the facts are still thin", "start with a small step"],
    },
  },
};

function withPortrait(wolf: Wolf): Wolf {
  return { ...wolf, avatar: PORTRAIT[wolf.modelLabel] ?? wolf.avatar };
}

/** Fixed row from the board design: GPT, Claude, Gemini, DeepSeek, MiniMax. */
export function boardWolves(board: Board): Wolf[] {
  if (board.type !== "advisor") return [];
  return [gptWolf, WOLVES.health, WOLVES.consult, WOLVES.invest, WOLVES.law].map(withPortrait);
}

export const ADVISOR_LABELS = ["GPT", "Claude", "Gemini", "DeepSeek", "MiniMax"] as const;

export function text(locale: AppLocale, value: LocaleMap<string>): string {
  return value[locale];
}

/** Board-level line shown on every reply in the investment and legal councils. */
export function boardReference(board: Board, locale: AppLocale): string {
  if (board.id === "invest") {
    return locale === "zh" ? "仅供参考，不构成投资建议" : "For reference only. Not investment advice.";
  }
  if (board.id === "legal") {
    return locale === "zh" ? "仅供参考，不构成法律意见" : "For reference only. Not legal advice.";
  }
  return "";
}

export function replyNotices(wolf: Wolf, board: Board, locale: AppLocale): { disclaimer: string; crisis: string } {
  return {
    disclaimer: wolf.disclaimer[locale] || boardReference(board, locale),
    crisis: wolf.crisis[locale],
  };
}
