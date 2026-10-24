import { test, expect } from "@playwright/test";

test("smoke test loads root page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
});
