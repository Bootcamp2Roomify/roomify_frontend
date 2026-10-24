import type { Page } from "@playwright/test";

/** /new-room starts with the Create Project details form (MVP Feature 2). */
export async function fillProjectDetails(page: Page, name = "E2E room"): Promise<void> {
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: /Continue to photo upload/ }).click();
}
