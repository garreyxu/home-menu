import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

// Auth tests will read E2E_USERNAME and E2E_PASSWORD once login exists.
const vercelProtectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

// preview-e2e sets this. "off" stays off on retry; "on-first-retry" would record headers.
const suppressCapture = process.env.PLAYWRIGHT_TRACE === "off";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: suppressCapture ? "off" : "on-first-retry",
    ...(suppressCapture
      ? { screenshot: "off" as const, video: "off" as const }
      : {}),
    ...(vercelProtectionBypass
      ? {
          extraHTTPHeaders: {
            "x-vercel-protection-bypass": vercelProtectionBypass,
            "x-vercel-set-bypass-cookie": "true",
          },
        }
      : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm dev --hostname 127.0.0.1 --port 3000",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
