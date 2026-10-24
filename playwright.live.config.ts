import { defineConfig, devices } from "@playwright/test";

/**
 * Real-stack regression: Postgres, CV service, Spring backend and `next start` must already be
 * running (see docs). Nothing is stubbed. LIVE_BASE_URL defaults to http://localhost:3000.
 */
export default defineConfig({
  testDir: "./tests/live",
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-live" }]],
  use: {
    baseURL: process.env.LIVE_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    // LIVE_SLOWMO (ms per action) slows recordings down to a pace viewers can follow.
    launchOptions: { slowMo: Number(process.env.LIVE_SLOWMO || 0) },
  },
});
