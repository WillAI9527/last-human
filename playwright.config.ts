import { defineConfig, devices } from "@playwright/test";

const port = 3010;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

const iphone = {
  ...devices["iPhone 12"],
  browserName: "chromium" as const,
  channel: "chrome" as const,
  defaultBrowserType: "chromium" as const,
};

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL,
    trace: "off",
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: `pnpm dev --port ${port}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      },
  projects: [
    {
      name: "iphone-12",
      use: { ...iphone, viewport: { width: 390, height: 844 } },
    },
    {
      name: "iphone-se",
      use: { ...iphone, viewport: { width: 375, height: 667 } },
    },
  ],
});
