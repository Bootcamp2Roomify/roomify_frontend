import { test } from "@playwright/test";
import { analyze, createProjectWithPhoto, register, uniqueEmail } from "./helpers";

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
    await page.goto("/dashboard"); await page.getByRole("heading", { name: `Screens ${label}` }).waitFor(); await shot("07-dashboard");
    await context.close();
  }
});
