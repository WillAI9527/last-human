import type { AppLocale } from "@/i18n/config";

export function withLocale(locale: AppLocale, path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (locale === "zh") return normalized === "/" ? "/zh" : `/zh${normalized}`;
  return normalized;
}

export function werewolfStartPath(locale: AppLocale): string {
  return withLocale(locale, "/?start=werewolf");
}
