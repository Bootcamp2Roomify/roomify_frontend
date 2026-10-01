import { test, expect, Page } from "@playwright/test";

/**
 * Generates actual 800x600 PNG image bytes using browser canvas.
 * Eliminates any external file/network dependency while testing real image decoding.
 */
async function generate800x600PngBuffer(page: Page): Promise<Buffer> {
  const base64Data = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(0, 0, 800, 600);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(100, 100, 200, 200);
    }
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64Data, "base64");
}

test.describe("ROOM-79/80/81 End-to-End Room Flow", () => {
  test("1. full upload -> analyze (503 retry) -> detection review with 800x600 blob surviving navigation, resize alignment, and reload recovery", async ({
    page,
  }) => {
    const TEST_PROJECT_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    let createCount = 0;
    let uploadCount = 0;
    let analysisCount = 0;

    // Intercept project creation
    await page.route("**/api/projects", async (route) => {
      if (route.request().method() === "POST") {
        createCount += 1;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: TEST_PROJECT_ID,
            status: "CREATED",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Intercept image upload: omit imageUrl to test in-memory blob survival
    await page.route(`**/api/projects/${TEST_PROJECT_ID}/image`, async (route) => {
      if (route.request().method() === "POST") {
        uploadCount += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            imageId: "101",
            projectId: TEST_PROJECT_ID,
            storageKey: "projects/test/images/room.png",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Intercept room analysis: 1st call fails 503, 2nd call succeeds with normalized detections
    await page.route(`**/api/projects/${TEST_PROJECT_ID}/analysis`, async (route) => {
      if (route.request().method() === "POST") {
        analysisCount += 1;
        if (analysisCount === 1) {
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              message:
                "Vision service unavailable (503). Analysis could not be completed; please retry.",
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              status: "completed",
              projectId: TEST_PROJECT_ID,
              imageId: "101",
              coordinateMode: "normalized",
              detections: [
                {
                  id: "det-chair-1",
                  label: "chair",
                  confidence: 0.83,
                  box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
                },
              ],
            }),
          });
        }
      } else {
        await route.continue();
      }
    });

    // 1. Navigate to upload page (no seeded context)
    await page.goto("/new-room");
    await expect(page.locator("h1")).toContainText("Upload Room Photo");

    // 2. Generate actual 800x600 PNG in browser canvas and select file
    const pngBuffer = await generate800x600PngBuffer(page);
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "living-room.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });

    // 3. Verify preview appears and measures naturalWidth 800
    const previewContainer = page.getByTestId("room-image-preview");
    await expect(previewContainer).toBeVisible();
    await expect(page.getByText("800 × 600 px")).toBeVisible();

    const previewImg = previewContainer.locator("img");
    const previewNaturalWidth = await previewImg.evaluate(
      (img: HTMLImageElement) => img.naturalWidth
    );
    expect(previewNaturalWidth).toBe(800);

    // 4. Submit upload -> navigates to analyze route
    const submitBtn = page.getByTestId("submit-upload-btn");
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    await expect(page).toHaveURL(
      new RegExp(`/projects/${TEST_PROJECT_ID}/analyze$`),
      { timeout: 10000 }
    );

    // 5. In-memory blob survived navigation: verify original image naturalWidth 800
    const analyzeImg = page.getByRole("img", { name: /uploaded room image/i });
    await expect(analyzeImg).toBeVisible();
    const analyzeNaturalWidth = await analyzeImg.evaluate(
      (img: HTMLImageElement) => img.naturalWidth
    );
    expect(analyzeNaturalWidth).toBe(800);

    // 6. Start analysis -> fails first time with curated safe error message
    const startBtn = page.getByRole("button", { name: /start analysis/i });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    const errorAlert = page.getByTestId("analysis-error-alert");
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText(
      "We could not analyze this image. Try again."
    );

    // Original image remains preserved during failure
    await expect(analyzeImg).toBeVisible();

    // 7. Retry analysis -> succeeds on second attempt
    const retryBtn = page.getByRole("button", { name: /retry analysis/i });
    await expect(retryBtn).toBeVisible();
    await retryBtn.click();

    // 8. DetectionReview mounts: verify status, list item and overlay box
    await expect(page.getByTestId("detection-review")).toBeVisible();
    await expect(page.getByText(/analysis complete! results ready/i)).toBeVisible();

    const chairItem = page.getByRole("button", { name: /chair · 83%/i });
    await expect(chairItem).toBeVisible();

    const chairBox = page.getByTestId("detection-box-det-chair-1");
    await expect(chairBox).toBeVisible();

    // Clicking list item selects matching box
    await chairItem.click();
    await expect(chairItem).toHaveAttribute("aria-pressed", "true");
    await expect(chairBox).toHaveAttribute("aria-pressed", "true");

    // Continuation absent shows truthful unavailable text
    await expect(
      page.getByText(
        /next step unavailable: furniture selection destination is not yet configured/i
      )
    ).toBeVisible();

    // 9. Verify box bounds alignment relative to actual img rect at 1440px viewport (within 2px)
    await page.setViewportSize({ width: 1440, height: 900 });
    const imgEl = page.locator('[data-testid="detection-image-container"] img');
    await expect(imgEl).toBeVisible();

    let imgRect = await imgEl.boundingBox();
    let boxRect = await chairBox.boundingBox();
    expect(imgRect).not.toBeNull();
    expect(boxRect).not.toBeNull();

    if (imgRect && boxRect) {
      const expectedLeft = imgRect.x + 0.1 * imgRect.width;
      const expectedTop = imgRect.y + 0.2 * imgRect.height;
      const expectedWidth = 0.3 * imgRect.width;
      const expectedHeight = 0.4 * imgRect.height;

      expect(Math.abs(boxRect.x - expectedLeft)).toBeLessThanOrEqual(2);
      expect(Math.abs(boxRect.y - expectedTop)).toBeLessThanOrEqual(2);
      expect(Math.abs(boxRect.width - expectedWidth)).toBeLessThanOrEqual(2);
      expect(Math.abs(boxRect.height - expectedHeight)).toBeLessThanOrEqual(2);
    }

    await page.screenshot({
      path: "tests/e2e/screenshots/room-flow-1440px.png",
      fullPage: true,
    });

    // 10. Verify box bounds alignment at mobile viewport (390px)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);

    imgRect = await imgEl.boundingBox();
    boxRect = await chairBox.boundingBox();
    expect(imgRect).not.toBeNull();
    expect(boxRect).not.toBeNull();

    if (imgRect && boxRect) {
      const expectedLeft = imgRect.x + 0.1 * imgRect.width;
      const expectedTop = imgRect.y + 0.2 * imgRect.height;
      const expectedWidth = 0.3 * imgRect.width;
      const expectedHeight = 0.4 * imgRect.height;

      expect(Math.abs(boxRect.x - expectedLeft)).toBeLessThanOrEqual(2);
      expect(Math.abs(boxRect.y - expectedTop)).toBeLessThanOrEqual(2);
      expect(Math.abs(boxRect.width - expectedWidth)).toBeLessThanOrEqual(2);
      expect(Math.abs(boxRect.height - expectedHeight)).toBeLessThanOrEqual(2);
    }

    await page.screenshot({
      path: "tests/e2e/screenshots/room-flow-390px.png",
      fullPage: true,
    });

    // 11. Assert total API call counts: exactly 1 create, 1 upload, 2 analysis
    expect(createCount).toBe(1);
    expect(uploadCount).toBe(1);
    expect(analysisCount).toBe(2);

    // 12. Reload page: temporary in-memory blob is cleared, resulting in honest recovery UI
    await page.reload();

    await expect(page.getByText(/no active room image found/i)).toBeVisible();
    const recoveryLink = page.getByRole("link", {
      name: /upload a room image to start over/i,
    });
    await expect(recoveryLink).toBeVisible();
    await expect(recoveryLink).toHaveAttribute("href", "/new-room");

    // No further API calls on recovery
    expect(createCount).toBe(1);
    expect(uploadCount).toBe(1);
    expect(analysisCount).toBe(2);
  });

  test("2. full upload -> completed empty detections -> useful retry -> successful result", async ({
    page,
  }) => {
    const EMPTY_PROJECT_ID = "4ba85f64-5717-4562-b3fc-2c963f66afa7";
    let createCount = 0;
    let uploadCount = 0;
    let analysisCount = 0;

    await page.route("**/api/projects", async (route) => {
      if (route.request().method() === "POST") {
        createCount += 1;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: EMPTY_PROJECT_ID,
            status: "CREATED",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`**/api/projects/${EMPTY_PROJECT_ID}/image`, async (route) => {
      if (route.request().method() === "POST") {
        uploadCount += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            imageId: "102",
            projectId: EMPTY_PROJECT_ID,
            storageKey: "projects/empty/images/room.png",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route(`**/api/projects/${EMPTY_PROJECT_ID}/analysis`, async (route) => {
      if (route.request().method() === "POST") {
        analysisCount += 1;
        if (analysisCount === 1) {
          // 1st analysis returns empty detections
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              status: "completed",
              projectId: EMPTY_PROJECT_ID,
              imageId: "102",
              coordinateMode: "normalized",
              detections: [],
            }),
          });
        } else {
          // 2nd analysis (retry) returns detected lamp
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              status: "completed",
              projectId: EMPTY_PROJECT_ID,
              imageId: "102",
              coordinateMode: "normalized",
              detections: [
                {
                  id: "det-lamp-1",
                  label: "lamp",
                  confidence: 0.88,
                  box: { x: 0.2, y: 0.3, width: 0.2, height: 0.4 },
                },
              ],
            }),
          });
        }
      } else {
        await route.continue();
      }
    });

    // 1. Upload room photo
    await page.goto("/new-room");
    const pngBuffer = await generate800x600PngBuffer(page);
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "empty-room.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });

    const submitBtn = page.getByTestId("submit-upload-btn");
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    await expect(page).toHaveURL(
      new RegExp(`/projects/${EMPTY_PROJECT_ID}/analyze$`),
      { timeout: 10000 }
    );

    // 2. Start analysis
    const startBtn = page.getByRole("button", { name: /start analysis/i });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // 3. Verify empty detections state
    await expect(page.getByText(/no objects detected/i)).toBeVisible();
    await expect(
      page.getByText(/0 objects detected in this room/i)
    ).toBeVisible();
    await expect(
      page.getByText(
        /next step unavailable: furniture selection destination is not yet configured/i
      )
    ).toBeVisible();

    const emptyRetryBtn = page.getByRole("button", { name: "Retry" });
    await expect(emptyRetryBtn).toBeVisible();

    // 4. Click Retry from empty detections view
    await emptyRetryBtn.click();

    // 5. Retry completes with detections
    await expect(page.getByTestId("detection-review")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /lamp · 88%/i })
    ).toBeVisible();
    await expect(page.getByTestId("detection-box-det-lamp-1")).toBeVisible();

    // Verify call counts: 1 create, 1 upload, 2 analysis
    expect(createCount).toBe(1);
    expect(uploadCount).toBe(1);
    expect(analysisCount).toBe(2);
  });
});
