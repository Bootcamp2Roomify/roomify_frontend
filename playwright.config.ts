import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT || "3000";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: "backendWorkflow.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    // Page middleware only checks that a session exists; these specs stub the API themselves.
    storageState: { cookies: [{ name: "roomify_session", value: "e2e", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }], origins: [] },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL === "chrome" ? { channel: "chrome" as const } : {}) },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"], ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL === "chrome" ? { channel: "chrome" as const } : {}) },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
