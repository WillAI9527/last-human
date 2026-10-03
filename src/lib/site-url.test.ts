import assert from "node:assert/strict";
import test from "node:test";
import { absoluteUrl, getSiteUrl } from "./site-url";

const KEYS = ["NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"] as const;

function withEnv(
  values: Partial<Record<(typeof KEYS)[number], string | undefined>>,
  run: () => void,
) {
  const previous = new Map<string, string | undefined>();
  for (const key of KEYS) {
    previous.set(key, process.env[key]);
    const next = values[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    run();
  } finally {
    for (const key of KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("NEXT_PUBLIC_SITE_URL wins over Vercel hosts", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: "https://share.example.com/",
      VERCEL_PROJECT_PRODUCTION_URL: "last-human-snowy.vercel.app",
      VERCEL_URL: "preview.vercel.app",
    },
    () => {
      assert.equal(getSiteUrl(), "https://share.example.com");
      assert.equal(absoluteUrl("/og-image.png"), "https://share.example.com/og-image.png");
    },
  );
});

test("production host is used when the public site URL is unset", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: "  ",
      VERCEL_PROJECT_PRODUCTION_URL: "last-human-snowy.vercel.app",
      VERCEL_URL: "wolfcha-git-preview.vercel.app",
    },
    () => {
      assert.equal(getSiteUrl(), "https://last-human-snowy.vercel.app");
      assert.equal(absoluteUrl("/"), "https://last-human-snowy.vercel.app/");
    },
  );
});

test("VERCEL_URL is the next fallback and localhost is last", () => {
  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
      VERCEL_URL: "https://wolfcha-git-preview.vercel.app/",
    },
    () => {
      assert.equal(getSiteUrl(), "https://wolfcha-git-preview.vercel.app");
    },
  );

  withEnv(
    {
      NEXT_PUBLIC_SITE_URL: undefined,
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
      VERCEL_URL: undefined,
    },
    () => {
      assert.equal(getSiteUrl(), "http://localhost:3000");
    },
  );
});
