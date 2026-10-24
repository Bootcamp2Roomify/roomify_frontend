import { expect, test, type Page } from "@playwright/test";
import { AI_ENABLED, analyze, createProjectWithPhoto, register, uniqueEmail } from "./helpers";

/** Full MVP journey against the real stack. AI steps assert the happy path when LIVE_AI=1. */
test("journey: account → project → detection → review → preferences → redesign → saved project", async ({ page }) => {
  let projectId = "";

  await test.step("F1 protected pages redirect to login; registration signs in", async () => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
    await register(page, uniqueEmail("journey"));
    await expect(page.getByText("No rooms yet")).toBeVisible();
  });

  await test.step("F2 create project; reject a non-image; upload a real photo", async () => {
    await page.goto("/new-room");
    await page.getByRole("button", { name: /Continue to photo upload/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Give your room a name." })).toBeVisible();
    await page.getByLabel("Project name").fill("Live bedroom");
    await page.getByRole("button", { name: /Continue to photo upload/ }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "notes.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await expect(page.getByRole("alert").filter({ hasText: /JPG or PNG/i })).toBeVisible();
    const oversized = Buffer.alloc(11 * 1024 * 1024, 0);
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(oversized);
    await page.locator('input[type="file"]').setInputFiles({ name: "huge.jpg", mimeType: "image/jpeg", buffer: oversized });
    await expect(page.getByRole("alert").filter({ hasText: /10 ?MB|too large|size/i })).toBeVisible();
    projectId = await createProjectWithPhoto(page, "Live bedroom");
  });

  await test.step("F3 real CV analysis lists furniture for review", async () => {
    await analyze(page);
    await expect(page.getByTestId("detection-review")).toBeVisible();
    await expect(page.locator('[data-testid^="detection-item-"]').first()).toBeVisible();
  });

  const items = page.locator('[data-testid^="detection-item-"]');
  let firstLabel = "";
  await test.step("F4 decide, rename, remove and add items", async () => {
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    firstLabel = (await items.first().getAttribute("aria-label"))!.replace(/^Inspect /, "").split(" · ")[0];
    await decide(page, firstLabel, "Keep");

    await page.getByRole("button", { name: `Rename ${firstLabel}` }).click();
    await page.getByLabel(`New name for ${firstLabel}`).fill(`my ${firstLabel}`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: `Inspect my ${firstLabel} · Added by you` })).toBeVisible();
    firstLabel = `my ${firstLabel}`;

    if (count > 1) {
      const second = (await items.nth(1).getAttribute("aria-label"))!.replace(/^Inspect /, "").split(" · ")[0];
      await page.getByRole("button", { name: `Remove ${second} from the list` }).first().click();
      await expect(items).toHaveCount(count - 1);
    }
    await page.getByLabel("Item name").fill("floor lamp");
    await page.getByLabel("Decision for the new item").selectOption("REPLACE");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByRole("button", { name: "Inspect floor lamp · Added by you" })).toBeVisible();
  });

  await test.step("F11 refresh restores decisions, edits and the photo", async () => {
    await page.reload();
    await analyze(page);
    await expect(page.getByRole("button", { name: `Inspect ${firstLabel} · Added by you` })).toBeVisible();
    await expect(page.getByRole("group", { name: `Decision for ${firstLabel}` }).getByRole("radio", { name: /keep/i })).toBeChecked();
    await expect(page.getByRole("group", { name: "Decision for floor lamp" }).getByRole("radio", { name: /replace/i })).toBeChecked();
  });

  await test.step("F5/F8 preferences start rental-friendly and save", async () => {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/rooms/${projectId}$`));
    await expect(page.getByLabel("Rental-friendly changes only")).toBeChecked();
    await page.getByLabel("Style (required)").selectOption("SCANDINAVIAN");
    await page.getByLabel("Budget (required)").fill("300");
    await page.getByLabel("Currency").selectOption("USD");
    await page.getByLabel("Preferred colors").fill("sage green, cream");
    await page.getByLabel("Special requirements").fill("Needs a reading corner");
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByText("Preferences saved.")).toBeVisible();
    await page.getByRole("link", { name: /Continue to my redesign/ }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/design$`));
  });

  await test.step("F6 generate the redesign plan", async () => {
    await page.getByRole("button", { name: "Generate redesign" }).click();
    if (!AI_ENABLED) {
      await expect(page.getByRole("alert").filter({ hasText: "AI generation is not configured on this server yet." })).toBeVisible({ timeout: 60_000 });
      return;
    }
    await expect(page.getByRole("region", { name: "Estimated budget" })).toBeVisible({ timeout: 180_000 });
    await expect(page.getByRole("region", { name: /Keeping/ })).toContainText(new RegExp(firstLabel.replace("my ", ""), "i"));
    await expect(page.getByRole("region", { name: "Rental-friendly notes" })).toBeVisible();
    await expect(page.getByText(/not a professional architectural or construction plan/)).toBeVisible();
  });

  if (AI_ENABLED) {
    await test.step("F6 visual concept before/after", async () => {
      await page.getByRole("button", { name: "See it in my room" }).click();
      const after = page.getByAltText("AI-generated redesign concept of your room");
      await expect(after).toBeVisible({ timeout: 180_000 });
      await expect.poll(() => after.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    });

    await test.step("F7/F10 suggestions within budget; F9 DIY guide", async () => {
      await page.getByRole("button", { name: "Get suggestions within my budget" }).click();
      const summary = page.getByRole("region", { name: "Budget summary" });
      await expect(summary).toBeVisible({ timeout: 180_000 });
      await expect(summary).toContainText("estimates, not live store prices");
      await expect(summary.getByRole("alert")).toHaveCount(0);
      const cards = page.getByRole("list", { name: "Suggested items" }).getByRole("listitem");
      expect(await cards.count()).toBeGreaterThan(0);
      const diy = page.getByRole("button", { name: "DIY instead" }).first();
      if (await diy.count()) {
        await diy.click();
        await expect(page.getByLabel("DIY guide").first()).toContainText("Safety", { timeout: 180_000 });
      }
    });

    await test.step("F10 lowering the budget triggers the over-budget warning", async () => {
      await page.goto(`/rooms/${projectId}`);
      await page.getByRole("button", { name: "Edit preferences" }).click().catch(() => undefined);
      await page.getByLabel("Budget (required)").fill("5");
      await page.getByRole("button", { name: "Save and continue" }).click();
      await page.getByRole("link", { name: /Continue to my redesign/ }).click();
      await expect(page.getByRole("region", { name: "Budget summary" }).getByRole("alert")).toContainText("exceed your budget");
    });
  }

  await test.step("F11 dashboard lists the saved project and resumes it", async () => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Live bedroom" })).toBeVisible();
    await expect(page.getByAltText("Photo of Live bedroom")).toBeVisible();
    await page.getByRole("link", { name: AI_ENABLED ? /Open redesign/ : /Generate redesign/ }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/design$`));
    if (AI_ENABLED) await expect(page.getByRole("region", { name: "Estimated budget" })).toBeVisible();
  });
});

test("F1 privacy: another account cannot see or open someone else's room", async ({ browser }) => {
  const owner = await browser.newContext();
  const ownerPage = await owner.newPage();
  await register(ownerPage, uniqueEmail("owner"));
  const projectId = await createProjectWithPhoto(ownerPage, "Owner's room");

  const stranger = await browser.newContext();
  const strangerPage = await stranger.newPage();
  await register(strangerPage, uniqueEmail("stranger"));
  await expect(strangerPage.getByText("No rooms yet")).toBeVisible();
  const api = await strangerPage.request.get(`/api/projects/${projectId}`);
  expect(api.status()).toBe(404);
  const image = await strangerPage.request.get(`/api/projects/${projectId}/image/content`);
  expect(image.status()).toBe(404);
  await strangerPage.goto(`/projects/${projectId}/design`);
  await expect(strangerPage.getByRole("alert").filter({ hasText: "This room could not be found." })).toBeVisible();
  await owner.close(); await stranger.close();
});

test("F1 logout clears the session and protects pages again", async ({ page }) => {
  await register(page, uniqueEmail("logout"));
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/new-room");
  await expect(page).toHaveURL(/\/login\?next=%2Fnew-room$/);
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
});

test("F3 analysis failure offers manual entry (CV service stopped)", async ({ page }) => {
  test.skip(process.env.LIVE_CV_DOWN !== "1", "Run with the CV service stopped and LIVE_CV_DOWN=1.");
  await register(page, uniqueEmail("cvdown"));
  await createProjectWithPhoto(page, "No CV");
  await expect(page.getByTestId("analysis-error-alert")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Add items manually" }).click();
  await page.getByLabel("Item name").fill("bed");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByRole("button", { name: "Inspect bed · Added by you" })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/\/rooms\//);
});

async function decide(page: Page, label: string, decision: string) {
  await page.getByRole("group", { name: `Decision for ${label}` }).getByText(decision, { exact: true }).click();
  await expect(page.getByRole("group", { name: `Decision for ${label}` }).getByRole("radio", { name: new RegExp(decision, "i") })).toBeChecked();
}
