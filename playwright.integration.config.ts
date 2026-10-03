import { defineConfig, devices } from "@playwright/test";
const port = process.env.PORT || "3380";
const backendPort = process.env.ROOMIFY_INTEGRATION_BACKEND_PORT || "3408";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "backendWorkflow.spec.ts",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL, baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    env: { ROOMIFY_API_URL: `http://127.0.0.1:${backendPort}` },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
