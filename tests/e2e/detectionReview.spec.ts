import { test, expect } from "@playwright/test";
import { startHarnessServer, stopHarnessServer } from "../harness/server";

const HARNESS_PORT = 3181;
const BASE_URL = `http://127.0.0.1:${HARNESS_PORT}`;

test.describe("ROOM-81 DetectionReview Browser E2E Suite (Vite Client Harness)", () => {
  let serverStartedLocally = false;

  test.beforeAll(async () => {
    // Check if test harness server is already running on 3181 (e.g. started by coordinator)
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) {
        return;
      }
    } catch {
      // Server not yet running, start Vite test harness programmatically
      await startHarnessServer(HARNESS_PORT);
      serverStartedLocally = true;
    }
  });

  test.afterAll(async () => {
    if (serverStartedLocally) {
      await stopHarnessServer();
    }
  });

  test("desktop viewport (1440px): aligns box with actual img rectangle within 2px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/?scenario=standard`);

    const img = page.locator('[data-testid="detection-image-container"] img');
    await expect(img).toBeVisible();

    const box = page.locator('[data-testid="detection-box-chair-1"]');
    await expect(box).toBeVisible();

    const imgRect = await img.boundingBox();
    const boxRect = await box.boundingBox();

    expect(imgRect).not.toBeNull();
    expect(boxRect).not.toBeNull();

    if (imgRect && boxRect) {
      // chair-1: x=0.1, y=0.2, width=0.3, height=0.4
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
      path: "tests/screenshots/detection-review-1440px.png",
      fullPage: true,
    });
  });

  test("mobile viewport (390px): stacks list below image and matches img rectangle within 2px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/?scenario=standard`);

    const img = page.locator('[data-testid="detection-image-container"] img');
    await expect(img).toBeVisible();

    const box = page.locator('[data-testid="detection-box-chair-1"]');
    await expect(box).toBeVisible();

    const list = page.locator('[role="region"][aria-label="Detected room objects"]');
    await expect(list).toBeVisible();

    const imgRect = await img.boundingBox();
    const boxRect = await box.boundingBox();
    const listRect = await list.boundingBox();

    expect(imgRect).not.toBeNull();
    expect(boxRect).not.toBeNull();
    expect(listRect).not.toBeNull();

    if (imgRect && boxRect && listRect) {
      // List must stack below the image on mobile
      expect(listRect.y).toBeGreaterThanOrEqual(imgRect.y + imgRect.height - 10);

      // Coordinates must match actual img rectangle within 2px
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
      path: "tests/screenshots/detection-review-390px.png",
      fullPage: true,
    });
  });

  test("browser interactions: verifies real hover, clicks, keyboard navigation, and callback tracking", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(`${BASE_URL}/?scenario=standard`);

    const box = page.locator('[data-testid="detection-box-chair-1"]');
    const listItem = page.locator('[data-testid="detection-item-chair-1"]');
    const badge = page.locator('[data-testid="box-badge-chair-1"]');

    // 1. Hover exposes label and confidence badge
    await expect(badge).toBeHidden();
    await box.hover();
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("chair · 83%");

    // Move away: badge hides when unselected
    await page.mouse.move(10, 10);
    await expect(badge).toBeHidden();

    // 2. Click list item selects both list item and box
    await expect(listItem).toHaveAttribute("aria-pressed", "false");
    await expect(box).toHaveAttribute("aria-pressed", "false");

    await listItem.click();
    await expect(listItem).toHaveAttribute("aria-pressed", "true");
    await expect(box).toHaveAttribute("aria-pressed", "true");
    // Badge stays visible when selected
    await expect(badge).toBeVisible();

    // 3. Click box toggles selection off
    await box.click();
    await expect(listItem).toHaveAttribute("aria-pressed", "false");
    await expect(box).toHaveAttribute("aria-pressed", "false");

    // 4. Keyboard Enter on list item selects
    await listItem.focus();
    await page.keyboard.press("Enter");
    await expect(listItem).toHaveAttribute("aria-pressed", "true");
    await expect(box).toHaveAttribute("aria-pressed", "true");

    // Keyboard Space on box toggles selection off
    await box.focus();
    await page.keyboard.press("Space");
    await expect(listItem).toHaveAttribute("aria-pressed", "false");
    await expect(box).toHaveAttribute("aria-pressed", "false");

    // 5. Button callbacks update harness tracker
    await page.locator('button:has-text("Continue")').click();
    await expect(page.locator('[data-testid="continue-count"]')).toHaveText("1");

    await page.locator('button:has-text("Retry")').click();
    await expect(page.locator('[data-testid="retry-count"]')).toHaveText("1");
  });

  test("resize coordinates: maintains box alignment relative to actual img rectangle across dynamic resize", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/?scenario=standard`);
    const img = page.locator('[data-testid="detection-image-container"] img');
    const box = page.locator('[data-testid="detection-box-chair-1"]');

    const viewports = [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(100);

      const imgRect = await img.boundingBox();
      const boxRect = await box.boundingBox();

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
    }
  });

  test("tall image (800x1600): catches letterboxing errors and matches actual img rectangle within 2px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/?scenario=tall`);

    const img = page.locator('[data-testid="detection-image-container"] img');
    await expect(img).toBeVisible();

    const box = page.locator('[data-testid="detection-box-lamp-1"]');
    await expect(box).toBeVisible();

    const imgRect = await img.boundingBox();
    const boxRect = await box.boundingBox();

    expect(imgRect).not.toBeNull();
    expect(boxRect).not.toBeNull();

    if (imgRect && boxRect) {
      // Tall aspect ratio 800/1600 = 0.5
      const aspect = imgRect.width / imgRect.height;
      expect(Math.abs(aspect - 0.5)).toBeLessThan(0.02);

      // lamp-1: x=0.25, y=0.15, width=0.5, height=0.7
      const expectedLeft = imgRect.x + 0.25 * imgRect.width;
      const expectedTop = imgRect.y + 0.15 * imgRect.height;
      const expectedWidth = 0.5 * imgRect.width;
      const expectedHeight = 0.7 * imgRect.height;

      expect(Math.abs(boxRect.x - expectedLeft)).toBeLessThanOrEqual(2);
      expect(Math.abs(boxRect.y - expectedTop)).toBeLessThanOrEqual(2);
      expect(Math.abs(boxRect.width - expectedWidth)).toBeLessThanOrEqual(2);
      expect(Math.abs(boxRect.height - expectedHeight)).toBeLessThanOrEqual(2);
    }

    await page.screenshot({
      path: "tests/screenshots/detection-review-tall-image.png",
      fullPage: true,
    });
  });

  test("zero detections: displays truthful success empty state and captures screenshot", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/?scenario=empty`);

    await expect(page.getByText("No Objects Detected")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(
      page.getByText(
        "Next step unavailable: furniture selection destination is not yet configured."
      )
    ).toBeVisible();

    // Verify no dead links exist
    const deadLinks = page.locator('a[href="#"], a:not([href])');
    await expect(deadLinks).toHaveCount(0);

    await page.screenshot({
      path: "tests/screenshots/detection-review-empty.png",
      fullPage: true,
    });
  });

  test("finding 5 regression: delayed image shows loading indicator, suppresses boxes while pending, and displays aligned boxes upon load", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/?scenario=delayed`);

    // While image is loading:
    // 1. Loading placeholder is visible
    const loadingIndicator = page.locator('[data-testid="image-loading"]');
    await expect(loadingIndicator).toBeVisible();

    // 2. Bounding boxes are suppressed
    const box = page.locator('[data-testid="detection-box-chair-1"]');
    await expect(box).toBeHidden();

    // 3. Wait for image to finish loading
    await expect(loadingIndicator).toBeHidden({ timeout: 5000 });

    // 4. Once loaded, box becomes visible and accurately aligned
    await expect(box).toBeVisible();

    const img = page.locator('[data-testid="detection-image-container"] img');
    const imgRect = await img.boundingBox();
    const boxRect = await box.boundingBox();
    expect(imgRect).not.toBeNull();
    expect(boxRect).not.toBeNull();
    if (imgRect && boxRect) {
      const expectedLeft = imgRect.x + 0.1 * imgRect.width;
      const expectedTop = imgRect.y + 0.2 * imgRect.height;
      expect(Math.abs(boxRect.x - expectedLeft)).toBeLessThanOrEqual(2);
      expect(Math.abs(boxRect.y - expectedTop)).toBeLessThanOrEqual(2);
    }

    await page.screenshot({
      path: "tests/screenshots/detection-review-delayed-loaded.png",
      fullPage: true,
    });
  });

  test("finding 5 regression: failed image URL (404) suppresses boxes and shows readable image recovery action", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/?scenario=image-404`);

    // Box must be suppressed / hidden over broken image
    await expect(page.locator('[data-testid="detection-box-chair-1"]')).toBeHidden();

    // Readable recovery UI must be shown
    const errorOverlay = page.locator('[data-testid="image-error-overlay"]');
    await expect(errorOverlay).toBeVisible();
    await expect(errorOverlay).toHaveAttribute("role", "alert");
    await expect(
      page.getByRole("alert").getByText("Unable to load room image", { exact: true })
    ).toBeVisible();

    // Recovery action buttons
    const retryBtn = page.getByRole("button", { name: /retry image|reload image|try again/i });
    await expect(retryBtn).toBeVisible();

    const newRoomLink = page.getByRole("link", { name: /upload a new image|new room/i });
    await expect(newRoomLink).toBeVisible();
    await expect(newRoomLink).toHaveAttribute("href", "/new-room");

    await page.screenshot({
      path: "tests/screenshots/detection-review-404-recovery.png",
      fullPage: true,
    });
  });

  test("finding 5 regression: natural aspect ratio mismatch suppresses boxes and shows recovery action", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/?scenario=aspect-mismatch`);

    // Box must be suppressed / hidden to avoid misaligned boxes over cropped image
    await expect(page.locator('[data-testid="detection-box-chair-1"]')).toBeHidden();

    // Aspect mismatch recovery text must be visible
    const errorOverlay = page.locator('[data-testid="image-error-overlay"]');
    await expect(errorOverlay).toBeVisible();
    await expect(
      page.getByRole("alert").getByText("Image dimensions mismatch: aspect ratio mismatch", { exact: true })
    ).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/detection-review-aspect-mismatch.png",
      fullPage: true,
    });
  });

  test("finding 5 regression: dynamic URL changes reset loading state, ignore stale callbacks, and recover cleanly", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/?scenario=standard`);

    const box = page.locator('[data-testid="detection-box-chair-1"]');
    const loading = page.locator('[data-testid="image-loading"]');
    const errorOverlay = page.locator('[data-testid="image-error-overlay"]');

    // 1. Initial standard image is loaded and box is visible
    await expect(box).toBeVisible();
    await expect(loading).toBeHidden();
    await expect(errorOverlay).toBeHidden();

    // 2. Switch dynamically to delayed image URL
    await page.locator('[data-testid="switch-delayed-url-btn"]').click();

    // Box must immediately be suppressed while new URL is loading
    await expect(box).toBeHidden();
    await expect(loading).toBeVisible();

    // Wait for delayed image to load
    await expect(loading).toBeHidden({ timeout: 5000 });
    await expect(box).toBeVisible();

    // 3. Switch dynamically to 404 URL
    await page.locator('[data-testid="switch-404-url-btn"]').click();

    // Error overlay appears, box is suppressed
    await expect(box).toBeHidden();
    await expect(errorOverlay).toBeVisible();
    await expect(
      page.getByRole("alert").getByText("Unable to load room image", { exact: true })
    ).toBeVisible();

    // 4. Switch dynamically back to valid URL
    await page.locator('[data-testid="switch-valid-url-btn"]').click();

    // Error overlay is cleared, box reappears once loaded
    await expect(errorOverlay).toBeHidden();
    await expect(box).toBeVisible();

    await page.screenshot({
      path: "tests/screenshots/detection-review-url-change-recovered.png",
      fullPage: true,
    });
  });
});
