import type { AppLocale } from "@/i18n/config";
import lines from "./sample-lines.json";

const BOARD_DISCLAIMER: Record<AppLocale, Record<string, string>> = {
  zh: {
    invest: "仅供参考，不构成投资建议",
    legal: "仅供参考，不构成法律意见",
  },
  en: {
    invest: "For reference only. Not investment advice.",
    legal: "For reference only. Not legal advice.",
  },
};

export type ClientReview = {
  sample: boolean;
  demo: boolean;
  originalPassed: boolean;
  passed: boolean;
  fixedCount: number;
  original: string;
  final: string;
  checks: Array<{ id: string; name: string; pass: boolean; skipped?: boolean; reason: string }>;
};

export function clientSample(_wolfId: string, locale: AppLocale, demo: boolean, boardId = ""): { final: string; review: ClientReview } {
  const pack = lines[locale];
  const disc = BOARD_DISCLAIMER[locale][boardId] || "";
  const vote = disc ? `${pack.line3}${locale === "en" ? ` (${disc})` : `（${disc}）`}` : pack.line3;
  const final = [pack.line1, pack.line2, vote].join("\n");
  return {
    final,
    review: {
      sample: true,
      demo,
      originalPassed: !demo,
      passed: true,
      fixedCount: demo ? 1 : 0,
      original: demo ? pack.bad : final,
      final,
      checks: [],
    },
  };
}
