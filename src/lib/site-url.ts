const LOCAL_SITE_URL = "http://localhost:3000";

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSiteUrl(raw: string, assumeHttpsHost: boolean): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidate =
    assumeHttpsHost && !/^https?:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * Absolute site origin for metadata, JSON-LD, and share links.
 * NEXT_PUBLIC_SITE_URL → https://VERCEL_PROJECT_PRODUCTION_URL →
 * https://VERCEL_URL → http://localhost:3000.
 */
export function getSiteUrl(): string {
  const configured = normalizeSiteUrl(readEnv("NEXT_PUBLIC_SITE_URL"), false);
  if (configured) return configured;

  const production = normalizeSiteUrl(readEnv("VERCEL_PROJECT_PRODUCTION_URL"), true);
  if (production) return production;

  const deployment = normalizeSiteUrl(readEnv("VERCEL_URL"), true);
  if (deployment) return deployment;

  return LOCAL_SITE_URL;
}

export function absoluteUrl(pathname = "/"): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(path, `${getSiteUrl()}/`).href;
}
