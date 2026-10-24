import { test, expect, Page } from "@playwright/test";
import { fillProjectDetails } from "./projectDetails";

const projectId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const objectId = "00000000-0000-0000-0000-000000000081";
async function imageBytes(page: Page): Promise<Buffer> {
  return Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 600;
    canvas.getContext("2d")!.fillRect(0, 0, 800, 600);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
}

for (const initial of ["failure", "empty"] as const) {
  test(`upload → ${initial} → retry → UUID decisions → preferences; restore after reload`, async ({ page }) => {
    let creates = 0, uploads = 0, analyses = 0, decisions = 0;
    // Like the real backend (ROOM-101), GET /analysis returns each object's saved decision.
    let savedDecision: string | undefined;
    await page.route("**/api/projects", route => {
      creates++;
      return route.fulfill({ status: 201, json: { id: projectId, status: "CREATED" } });
    });
    let png: Buffer;
    await page.route(`**/api/projects/${projectId}/image`, route => {
      if (route.request().method() === "POST") {
        uploads++;
        return route.fulfill({ json: { imageId: 101, projectId, storageKey: "fixture/room.png", contentType: "image/png", fileSize: png.length } });
      }
      return route.fulfill({ json: { imageId: 101, projectId, contentType: "image/png", width: 800, height: 600,
        imageUrl: `/api/projects/${projectId}/image/content` } });
    });
    await page.route(`**/api/projects/${projectId}/image/content`, route => route.fulfill({ contentType: "image/png", body: png }));
    await page.route(`**/api/projects/${projectId}/analysis`, route => {
      if (route.request().method() === "POST") {
        analyses++;
        if (initial === "failure" && analyses === 1) return route.fulfill({ status: 503, json: { message: "private diagnostic" } });
        return route.fulfill({ json: { projectId, status: "ANALYZED", objects: [] } });
      }
      return route.fulfill({ json: { projectId, objects: initial === "empty" && analyses === 1 ? [] : [{
        objectId, imageId: 101, label: "Chair", confidence: .83, bbox: { x: .1, y: .2, w: .3, h: .4 }, modelVersion: "fixture-v1",
        ...(savedDecision ? { decision: savedDecision } : {}),
      }] } });
    });
    await page.route(`**/api/projects/${projectId}/objects/${objectId}`, async route => {
      decisions++;
      expect(route.request().method()).toBe("PATCH");
      expect(route.request().postDataJSON()).toEqual({ decision: "KEEP" });
      savedDecision = "KEEP";
      await route.fulfill({ json: { objectId, decision: "KEEP" } });
    });
    await page.goto("/new-room"); await fillProjectDetails(page);
    await expect(page.getByRole("heading", { name: "Upload Room Photo" })).toBeVisible();
    png = await imageBytes(page);
    await page.locator('input[type="file"]').setInputFiles({ name: "room.png", mimeType: "image/png", buffer: png });
    await expect(page.getByTestId("room-image-preview")).toBeVisible();
    await page.getByTestId("submit-upload-btn").click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/analyze$`));
    if (initial === "failure") {
      await expect(page.getByTestId("analysis-error-alert")).toContainText("We could not analyze this image. Try again.");
      await expect(page.getByRole("img", { name: /uploaded room image/i })).toBeVisible();
      await page.getByRole("button", { name: /retry analysis/i }).click();
    } else {
      await expect(page.getByText("No Objects Detected", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Retry", exact: true }).click();
    }
    const chair = page.getByRole("button", { name: /chair · 83%/i });
    const box = page.getByTestId(`detection-box-${objectId}`);
    await expect(chair).toBeVisible(); await expect(box).toBeVisible();
    await chair.click(); await expect(box).toHaveAttribute("aria-pressed", "true");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(async () => {
        const image = await page.getByRole("img", { name: /room preview/i }).boundingBox();
        const overlay = await box.boundingBox();
        if (!image || !overlay) return 100;
        return Math.max(Math.abs(overlay.x - image.x - .1 * image.width),
          Math.abs(overlay.y - image.y - .2 * image.height), Math.abs(overlay.width - .3 * image.width), Math.abs(overlay.height - .4 * image.height));
      }).toBeLessThanOrEqual(2);
    }
    const keep = page.getByRole("radio", { name: /keep/i }).first();
    await keep.focus(); await page.keyboard.press("Space");
    await expect(keep).toBeChecked();
    await expect.poll(() => decisions).toBe(1);
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
    expect([creates, uploads, analyses]).toEqual([1, 1, 2]);
    await page.reload();
    await expect(page.getByTestId("detection-review")).toBeVisible();
    await expect(page.getByRole("img", { name: /room preview/i })).toHaveAttribute("src", `/api/projects/${projectId}/image/content`);
    await expect(page.getByRole("radio", { name: /keep/i }).first()).toBeChecked();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/rooms/${projectId}$`));
    expect(creates).toBe(1); expect(uploads).toBe(1);
  });
}
