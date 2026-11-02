import type { AppLocale } from "@/i18n/config";
import lines from "./sample-lines.json";

const DISCLAIMER: Record<AppLocale, Record<string, string>> = {
  zh: {
    invest: "仅供参考，不构成投资建议",
    law: "仅供参考，不构成法律意见",
    health: "仅供参考，不构成医疗或心理专业建议",
  },
  en: {
    invest: "For reference only. Not investment advice.",
    law: "For reference only. Not legal advice.",
    health: "For reference only. Not medical or psychological advice.",
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

export function clientSample(wolfId: string, locale: AppLocale, demo: boolean): { final: string; review: ClientReview } {
  const pack = lines[locale];
  const disc = DISCLAIMER[locale][wolfId] || "";
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
