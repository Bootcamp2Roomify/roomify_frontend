import { expect, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOM_PHOTO = process.env.LIVE_ROOM_PHOTO || path.resolve(here, "../../../roomify_cv/samples/room.jpeg");
export const AI_ENABLED = process.env.LIVE_AI === "1";

export function uniqueEmail(tag: string): string {
  return `live-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@roomify.test`;
}

export async function register(page: Page, email: string, password = "password123"): Promise<void> {
  await page.goto("/register");
  await page.getByLabel(/^Name/).fill("Live Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

export async function createProjectWithPhoto(page: Page, name: string, photo = ROOM_PHOTO): Promise<string> {
  await page.goto("/new-room");
  await page.getByLabel("Project name").fill(name);
  await page.getByLabel("Room type").selectOption("BEDROOM");
  await page.getByLabel("Rented apartment or house").check();
  await page.getByRole("button", { name: /Continue to photo upload/ }).click();
  await page.locator('input[type="file"]').setInputFiles(photo);
  await expect(page.getByTestId("room-image-preview")).toBeVisible();
  await page.getByTestId("submit-upload-btn").click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/analyze$/);
  return page.url().match(/projects\/([0-9a-f-]{36})/)![1];
}

/** Runs the real CV analysis and waits for review (or the empty state). */
export async function analyze(page: Page): Promise<void> {
  const done = page.getByTestId("detection-review").or(page.getByText("No Objects Detected"));
  const start = page.getByRole("button", { name: "Start analysis" });
  // Analysis usually starts by itself; the button only needs a click when it is idle.
  await expect(done.or(start)).toBeVisible({ timeout: 60_000 });
  if (!(await done.isVisible()) && (await start.isEnabled().catch(() => false))) await start.click();
  await expect(done).toBeVisible({ timeout: 60_000 });
}
