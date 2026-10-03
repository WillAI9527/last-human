"use client";

import { createContext, useContext, type ReactNode } from "react";
import { getSiteUrl } from "@/lib/site-url";

const SiteUrlContext = createContext<string | null>(null);

export function SiteUrlProvider({ url, children }: { url: string; children: ReactNode }) {
  return <SiteUrlContext.Provider value={url}>{children}</SiteUrlContext.Provider>;
}

export function useSiteUrl(): string {
  return useContext(SiteUrlContext) ?? getSiteUrl();
}
