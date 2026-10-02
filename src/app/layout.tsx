import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next"
import { I18nProvider } from "@/i18n/I18nProvider";
import { STORAGE_KEY, defaultLocale, isSupportedLocale, localeToHtmlLang, type AppLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { JsonLd, getGameJsonLd, getWebsiteJsonLd, getOrganizationJsonLd } from "@/components/seo/JsonLd";

const defaultMessages = getMessages(defaultLocale);

export const metadata: Metadata = {
  title: {
    default: defaultMessages.app.title,
    template: `%s | ${defaultMessages.app.title}`,
  },
  description: defaultMessages.app.description,
  applicationName: defaultMessages.app.title,
  keywords: [
    "AI werewolf",
    "ai werewolf game",
    "play werewolf with AI",
    "werewolf game online",
    "play werewolf online",
    "play werewolf alone",
    "single player werewolf",
    "solo werewolf",
    "AI mafia game",
    "werewolf with AI",
    "AI opponents",
    "AI social deduction",
    "werewolf game AI opponents",
    "solo werewolf game",
    "browser werewolf game",
    "free werewolf game online",
    "狼人杀",
    "在线狼人杀",
    "单人狼人杀",
    "AI 狼人杀",
    "AI狼人杀",
    "一个人玩狼人杀",
    "全 AI 对手",
    "社交推理游戏",
    "沉浸式狼人杀",
    "推理游戏",
    "语音旁白",
  ],
  openGraph: {
    title: defaultMessages.app.title,
    description: defaultMessages.app.description,
    type: "website",
    siteName: defaultMessages.app.title,
    locale: localeToHtmlLang[defaultLocale],
    url: "/",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "LAST HUMAN · 最后的真人",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultMessages.app.title,
    description: defaultMessages.app.description,
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/mark.svg", type: "image/svg+xml" },
    ],
    apple: "/icon-180.png",
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  alternates: {
    canonical: "/",
    languages: {
      "en": "/en",
      "zh-CN": "/zh",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

function resolveInitialLocale(pathname: string | null, cookieLocale: string | undefined): AppLocale {
  if (pathname && /^\/zh(\/|$)/.test(pathname)) return "zh";
  if (isSupportedLocale(cookieLocale)) return cookieLocale;
  return defaultLocale;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const initialLocale = resolveInitialLocale(
    requestHeaders.get("x-wolfcha-pathname"),
    cookieStore.get(STORAGE_KEY)?.value
  );

  return (
    <html lang={localeToHtmlLang[initialLocale]} suppressHydrationWarning>
      <Analytics />
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;600&family=Noto+Serif+SC:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <JsonLd data={getWebsiteJsonLd()} />
        <JsonLd data={getGameJsonLd()} />
        <JsonLd data={getOrganizationJsonLd()} />
        <I18nProvider initialLocale={initialLocale}>
          <Toaster position="top-center" closeButton />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
