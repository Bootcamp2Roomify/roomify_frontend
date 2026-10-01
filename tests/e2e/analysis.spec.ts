import { test, expect } from "@playwright/test";

const TEST_PROJECT_ID = "00000000-0000-0000-0000-000000000080";
const SAMPLE_IMAGE_DATA_URL =
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22800%22%20height%3D%22600%22%20viewBox%3D%220%200%20800%20600%22%3E%3Crect%20fill%3D%22%23cbd5e1%22%20width%3D%22800%22%20height%3D%22600%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%20fill%3D%22%23475569%22%20font-size%3D%2224%22%3ERoom%20800x600%3C%2Ftext%3E%3C%2Fsvg%3E";

const seededContext = {
  projectId: TEST_PROJECT_ID,
  image: {
    projectId: TEST_PROJECT_ID,
    imageId: "img-00000000-0080",
    imageUrl: SAMPLE_IMAGE_DATA_URL,
    width: 800,
    height: 600,
  },
};

test.describe("ROOM-80: Analysis States E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Seed sessionStorage before page scripts execute
    await page.addInitScript(
      ({ projectId, context }) => {
        try {
          window.sessionStorage.setItem(
            `roomify_project_context_${projectId}`,
            JSON.stringify(context)
          );
        } catch {
          // ignore
        }
      },
      { projectId: TEST_PROJECT_ID, context: seededContext }
    );
  });

  test("1. shows visible spinner, aria-live status during analysis, and captures loading screenshot", async ({
    page,
  }) => {
    let requestHandled = false;

    // Intercept analysis API with delayed response
    await page.route(`**/api/projects/${TEST_PROJECT_ID}/analysis`, async (route) => {
      // Delay response to inspect loading spinner
      await new Promise((resolve) => setTimeout(resolve, 600));
      requestHandled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "completed",
          projectId: TEST_PROJECT_ID,
          imageId: "img-00000000-0080",
          coordinateMode: "normalized",
          detections: [],
        }),
      });
    });

    await page.goto(`/projects/${TEST_PROJECT_ID}/analyze`);

    // Verify initial ready state and uploaded image presence
    const startButton = page.getByRole("button", { name: /start analysis/i });
    await expect(startButton).toBeVisible();

    const roomImage = page.getByRole("img", { name: /uploaded room image/i });
    await expect(roomImage).toBeVisible();

    // Trigger analysis
    await startButton.click();

    // Assert spinner and polite aria-live status during loading
    const spinner = page.getByTestId("analysis-spinner");
    await expect(spinner).toBeVisible();

    const statusRegion = page.locator("div[role='status'][aria-live='polite']");
    await expect(statusRegion).toBeVisible();
    await expect(statusRegion).toContainText(/analyzing room interior/i);

    // Capture loading screenshot
    await page.screenshot({
      path: "tests/e2e/screenshots/analysis-loading.png",
      fullPage: true,
    });

    // Wait for analysis to succeed
    await expect(page.getByText(/analysis complete/i)).toBeVisible();
    expect(requestHandled).toBe(true);
  });

  test("2. failure preserves original image, shows safe error, and retry succeeds with keyboard", async ({
    page,
  }) => {
    let callCount = 0;

    await page.route(`**/api/projects/${TEST_PROJECT_ID}/analysis`, async (route) => {
      callCount += 1;
      if (callCount === 1) {
        // First call fails with simulated vision service error
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Vision service unavailable (503). Analysis could not be completed; please retry.",
          }),
        });
      } else {
        // Second call (retry) succeeds
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "completed",
            projectId: TEST_PROJECT_ID,
            imageId: "img-00000000-0080",
            coordinateMode: "normalized",
            detections: [
              {
                id: "det-chair-1",
                label: "Modern Chair",
                confidence: 0.92,
                box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
              },
            ],
          }),
        });
      }
    });

    await page.goto(`/projects/${TEST_PROJECT_ID}/analyze`);

    const startButton = page.getByRole("button", { name: /start analysis/i });
    await startButton.click();

    // Assert failure alert scoped to avoid matching Next route announcer
    const alert = page.getByTestId("analysis-error-alert");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveAttribute("role", "alert");
    await expect(alert).toHaveAttribute("aria-live", "assertive");
    await expect(alert).toContainText("We could not analyze this image. Try again.");

    // Assert original image is PRESERVED after failure
    const roomImage = page.getByRole("img", { name: /uploaded room image/i });
    await expect(roomImage).toBeVisible();

    // Capture failure screenshot
    await page.screenshot({
      path: "tests/e2e/screenshots/analysis-failure.png",
      fullPage: true,
    });

    // Retry using keyboard navigation
    const retryButton = page.getByRole("button", { name: /retry analysis/i });
    await expect(retryButton).toBeVisible();

    await retryButton.focus();
    await page.keyboard.press("Enter");

    // Verify retry succeeds
    await expect(page.getByText(/analysis complete/i)).toBeVisible();
    expect(callCount).toBe(2);
  });

  test("3. rapid double-clicks trigger only one analysis request", async ({ page }) => {
    let callCount = 0;

    await page.route(`**/api/projects/${TEST_PROJECT_ID}/analysis`, async (route) => {
      callCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "completed",
          projectId: TEST_PROJECT_ID,
          imageId: "img-00000000-0080",
          coordinateMode: "normalized",
          detections: [],
        }),
      });
    });

    await page.goto(`/projects/${TEST_PROJECT_ID}/analyze`);

    const startButton = page.getByRole("button", { name: /start analysis/i });
    // Double click rapidly
    await startButton.click({ clickCount: 2 });

    await expect(page.getByText(/analysis complete/i)).toBeVisible();
    expect(callCount).toBe(1);
  });

  test("4. recovers to /new-room when project context is missing", async ({ page }) => {
    // Navigate without seeded context
    await page.goto("/projects/00000000-0000-0000-0000-000000000999/analyze");

    await expect(page.getByText(/no active room image found/i)).toBeVisible();
    const recoveryLink = page.getByRole("link", { name: /upload a room image to start over/i });
    await expect(recoveryLink).toBeVisible();
    await expect(recoveryLink).toHaveAttribute("href", "/new-room");
  });
});
