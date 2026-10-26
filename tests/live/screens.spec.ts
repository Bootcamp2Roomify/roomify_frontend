import { test } from "@playwright/test";
import { AI_ENABLED, analyze, createProjectWithPhoto, register, uniqueEmail } from "./helpers";

/** Not an assertion suite: captures every main page at desktop and phone width for review. */
test("capture key screens", async ({ browser }) => {
  test.skip(process.env.LIVE_SCREENS !== "1", "Set LIVE_SCREENS=1 to capture screenshots.");
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const shot = (name: string) => page.screenshot({ path: `test-results/screens/${label}-${name}.png`, fullPage: true });
    await page.goto("/login"); await shot("01-login");
    await register(page, uniqueEmail(`screens-${label}`)); await shot("02-dashboard-empty");
    await page.goto("/new-room"); await shot("03-new-room");
    const id = await createProjectWithPhoto(page, `Screens ${label}`);
    await analyze(page); await shot("04-review");
    await page.goto(`/rooms/${id}`); await page.getByLabel("Budget (required)").waitFor(); await shot("05-preferences");
    await page.goto(`/projects/${id}/design`); await page.getByRole("heading", { level: 1 }).waitFor(); await shot("06-design");
    if (AI_ENABLED) {
      // LIVE_AI=1 (live model or AI_DEMO_MODE): save preferences, then capture each AI result.
      await page.goto(`/rooms/${id}`);
      await page.getByLabel("Style (required)").selectOption("SCANDINAVIAN");
      await page.getByLabel("Budget (required)").fill("300");
      await page.getByLabel("Preferred colors").fill("sage green, warm white");
      await page.getByRole("button", { name: "Save and continue" }).click();
      await page.getByRole("link", { name: /Continue to my redesign/ }).click();
      await page.getByRole("button", { name: "Generate redesign" }).click();
      await page.getByRole("region", { name: "Estimated budget" }).waitFor({ timeout: 240_000 }); await shot("08-plan");
      await page.getByRole("button", { name: "See it in my room" }).click();
      await page.locator("#prototype-title").scrollIntoViewIfNeeded();
      await page.getByText(/^(Example concept \(demo\)|Concept)$/).waitFor({ timeout: 240_000 }); await shot("09-concept");
      await page.getByRole("button", { name: "Get suggestions within my budget" }).click();
      await page.getByRole("region", { name: "Budget summary" }).waitFor({ timeout: 240_000 });
      const diy = page.getByRole("button", { name: "DIY instead" }).first();
      if (await diy.count()) { await diy.click(); await page.getByLabel("DIY guide").first().waitFor({ timeout: 240_000 }); }
      await shot("10-suggestions-diy");
    }
    await page.goto("/dashboard"); await page.getByRole("heading", { name: `Screens ${label}` }).waitFor(); await shot("07-dashboard");
    await context.close();
  }
});
