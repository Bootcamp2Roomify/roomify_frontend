import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { analyze, ROOM_PHOTO, uniqueEmail } from "./helpers";

/**
 * Records the demo walkthrough at 1920x1080, one clip per scene (LIVE_RECORD=1, running stack; LIVE_AI=1 adds the AI scenes).
 * Slow AI steps run in an unrecorded context; the recorded clip then opens the saved result.
 */
const SIZE = { width: 1920, height: 1080 };
const OUT = process.env.LIVE_RECORD_DIR || "test-results/walkthrough";
let state: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;

async function scene<T>(browser: Browser, name: string, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport: SIZE, storageState: state, recordVideo: { dir: `${OUT}/${name}`, size: SIZE } });
  const page = await context.newPage();
  const result = await run(page);
  await page.waitForTimeout(2500);
  state = await context.storageState();
  await context.close();
  return result;
}

async function quiet<T>(browser: Browser, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ viewport: SIZE, storageState: state });
  const result = await run(await context.newPage());
  await context.close();
  return result;
}

test("record walkthrough", async ({ browser }) => {
  // Without LIVE_AI=1 only the scenes that need no OpenAI key are recorded.
  test.skip(process.env.LIVE_RECORD !== "1", "Needs LIVE_RECORD=1 and a running stack.");
  const withAi = process.env.LIVE_AI === "1";
  test.setTimeout(Number(process.env.LIVE_RECORD_TIMEOUT || 900_000));
  const type = (page: Page, label: string | RegExp, text: string) => page.getByLabel(label).pressSequentially(text, { delay: 70 });

  await scene(browser, "01-signup", async page => {
    await page.goto("/register");
    await type(page, /^Name/, "Mai");
    await type(page, "Email", uniqueEmail("demo"));
    await type(page, "Password", "demo-password-1");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("No rooms yet")).toBeVisible();
    await page.waitForTimeout(3000);
  });

  const projectId = await scene(browser, "02-create-upload", async page => {
    await page.goto("/new-room");
    await page.locator("#room-workspace").scrollIntoViewIfNeeded();
    await type(page, "Project name", "My dorm room");
    await page.getByLabel("Room type").selectOption("DORM_ROOM");
    await page.getByLabel("Dormitory").check();
    await page.getByRole("button", { name: /Continue to photo upload/ }).click();
    await page.locator('input[type="file"]').setInputFiles(ROOM_PHOTO);
    await expect(page.getByTestId("room-image-preview")).toBeVisible();
    await page.waitForTimeout(3500);
    await page.getByTestId("submit-upload-btn").click();
    await expect(page).toHaveURL(/\/analyze$/);
    await page.waitForTimeout(3000);
    return page.url().match(/projects\/([0-9a-f-]{36})/)![1];
  });

  await scene(browser, "03-review", async page => {
    await page.goto(`/projects/${projectId}/analyze`);
    await analyze(page);
    await page.getByTestId("detection-review").scrollIntoViewIfNeeded();
    await page.waitForTimeout(5000);
    const groups = page.getByRole("group", { name: /^Decision for / });
    await groups.nth(0).getByText("Keep", { exact: true }).click();
    await page.waitForTimeout(2500);
    if (await groups.count() > 1) await groups.nth(1).getByText("Replace", { exact: true }).click();
    await page.waitForTimeout(2500);
    await page.getByLabel("Item name").scrollIntoViewIfNeeded();
    await type(page, "Item name", "desk");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByRole("button", { name: "Inspect desk · Added by you" })).toBeVisible();
    await page.waitForTimeout(4000);
    // The add form defaults new items to Keep.
    await expect(page.getByRole("group", { name: "Decision for desk" }).getByRole("radio", { name: /keep/i })).toBeChecked();
  });

  await scene(browser, "04-preferences", async page => {
    await page.goto(`/rooms/${projectId}`);
    await page.getByLabel("Style (required)").selectOption("SCANDINAVIAN");
    await type(page, "Budget (required)", "300");
    await page.getByLabel("Currency").selectOption("USD");
    await type(page, "Preferred colors", "sage green, warm white");
    await type(page, "Special requirements", "A cosy reading corner and more storage");
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByText("Preferences saved.")).toBeVisible();
    await page.waitForTimeout(5000);
  });

  await scene(browser, "05-dashboard", async page => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "My dorm room" })).toBeVisible();
    await page.waitForTimeout(4000);
    await page.getByRole("link", { name: /Generate redesign/ }).hover();
    await page.waitForTimeout(3000);
  });

  if (!withAi) return;

  await quiet(browser, async page => {
    await page.goto(`/projects/${projectId}/design`);
    await page.getByRole("button", { name: "Generate redesign" }).click();
    await expect(page.getByRole("region", { name: "Estimated budget" })).toBeVisible({ timeout: 240_000 });
    await page.getByRole("button", { name: "See it in my room" }).click();
    await expect(page.getByAltText(/AI-generated redesign concept of your room|Example concept from the demo library/)).toBeVisible({ timeout: 240_000 });
    await page.getByRole("button", { name: "Get suggestions within my budget" }).click();
    await expect(page.getByRole("region", { name: "Budget summary" })).toBeVisible({ timeout: 240_000 });
    const diy = page.getByRole("button", { name: "DIY instead" }).first();
    if (await diy.count()) { await diy.click(); await expect(page.getByLabel("DIY guide").first()).toBeVisible({ timeout: 240_000 }); }
  });

  for (const [name, target] of [["06-plan", "plan-title"], ["07-concept", "prototype-title"], ["08-suggestions", "recommendations-title"]] as const) {
    await scene(browser, name, async page => {
      await page.goto(`/projects/${projectId}/design`);
      const heading = page.locator(`#${target}`);
      await heading.waitFor();
      await heading.scrollIntoViewIfNeeded();
      for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 260); await page.waitForTimeout(700); }
    });
  }
});
