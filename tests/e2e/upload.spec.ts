import { test, expect } from "@playwright/test";

test.describe("ROOM-79 Upload E2E Flow", () => {
  const mockProjectId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

  test.beforeEach(async ({ page }) => {
    // Intercept API routes to isolate from backend
    await page.route("**/api/projects", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: mockProjectId,
            status: "CREATED",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route("**/api/projects/*/image", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            imageId: "101",
            projectId: mockProjectId,
            storageKey: "projects/1/images/room.jpg",
          }),
        });
      } else {
        await route.continue();
      }
    });
  });

  test("renders new room upload page with accessible dropzone", async ({
    page,
  }) => {
    await page.goto("/new-room");
    await expect(page.locator("h1")).toContainText("Upload Room Photo");
    await expect(
      page.getByText("JPG or PNG up to 10MB")
    ).toBeVisible();

    const dropzone = page.getByRole("button", {
      name: /upload room image/i,
    });
    await expect(dropzone).toBeVisible();
  });

  test("shows validation error on invalid file type", async ({ page }) => {
    await page.goto("/new-room");

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "document.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 dummy content"),
    });

    const alert = page.getByTestId("upload-error");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Please upload JPG or PNG.");
    await expect(page.getByTestId("room-image-preview")).not.toBeVisible();
  });

  test("desktop (1440px): uploads valid image and navigates to analysis URL", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/new-room");

    // 1x1 transparent PNG buffer
    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "living-room.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });

    // Preview appears
    const preview = page.getByTestId("room-image-preview");
    await expect(preview).toBeVisible();
    await expect(page.getByText("living-room.png")).toBeVisible();

    // Click submit
    const submitBtn = page.getByTestId("submit-upload-btn");
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Verify navigation strictly by URL without dependency on ROOM-80 UI
    await expect(page).toHaveURL(
      new RegExp(`/projects/${mockProjectId}/analyze$`),
      { timeout: 10000 }
    );
  });

  test("mobile (390px): responsive layout, preview and submit", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/new-room");

    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "cozy-bedroom.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });

    await expect(page.getByTestId("room-image-preview")).toBeVisible();
    await expect(page.getByText("cozy-bedroom.png")).toBeVisible();

    const submitBtn = page.getByTestId("submit-upload-btn");
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    await expect(page).toHaveURL(
      new RegExp(`/projects/${mockProjectId}/analyze$`),
      { timeout: 10000 }
    );
  });

  test("Finding 4 Regression: rejects real GIF89a bytes renamed as png with zero API calls", async ({
    page,
  }) => {
    let createCallCount = 0;
    let uploadCallCount = 0;
    await page.route("**/api/projects", (route) => {
      if (route.request().method() === "POST") createCallCount++;
      return route.fulfill({
        status: 201,
        body: JSON.stringify({ id: mockProjectId, status: "CREATED" }),
      });
    });
    await page.route("**/api/projects/*/image", (route) => {
      if (route.request().method() === "POST") uploadCallCount++;
      return route.fulfill({
        status: 200,
        body: JSON.stringify({ imageId: "101", projectId: mockProjectId }),
      });
    });

    await page.goto("/new-room");

    // Real GIF89a 1x1 image buffer
    const gifBuffer = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "renamed.png",
      mimeType: "image/png",
      buffer: gifBuffer,
    });

    const alert = page.getByTestId("upload-error");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Please upload JPG or PNG.");
    await expect(page.getByTestId("room-image-preview")).not.toBeVisible();
    expect(createCallCount).toBe(0);
    expect(uploadCallCount).toBe(0);
  });

  test("Finding 2 Regression: prevents resubmission after successful upload when navigation is delayed", async ({
    page,
  }) => {
    let createCallCount = 0;
    let uploadCallCount = 0;
    await page.route("**/api/projects", async (route) => {
      if (route.request().method() === "POST") {
        createCallCount++;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: mockProjectId,
            status: "CREATED",
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route("**/api/projects/*/image", async (route) => {
      if (route.request().method() === "POST") {
        uploadCallCount++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            imageId: "101",
            projectId: mockProjectId,
            storageKey: "projects/1/images/room.jpg",
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Intercept navigation to delay route transition so upload page stays mounted
    await page.route(`**/projects/${mockProjectId}/analyze`, async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Delayed Route</body></html>",
      });
    });

    await page.goto("/new-room");

    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "living-room.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });

    const submitBtn = page.getByTestId("submit-upload-btn");
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Wait until upload API is called
    await page.waitForResponse("**/api/projects/*/image");
    expect(createCallCount).toBe(1);
    expect(uploadCallCount).toBe(1);

    // In terminal success state, submit button must be disabled
    await expect(submitBtn).toBeDisabled();

    // Attempt second click while still mounted on /new-room
    if (await submitBtn.isEnabled()) {
      await submitBtn.click();
    }

    // Ensure upload is never called a second time
    await page.waitForTimeout(500);
    expect(uploadCallCount).toBe(1);
    expect(createCallCount).toBe(1);
  });

  test("Finding 1 Regression: prevents submission while replacement image decode is deferred in browser", async ({
    page,
  }) => {
    let createCallCount = 0;
    let uploadCallCount = 0;
    await page.route("**/api/projects", (route) => {
      if (route.request().method() === "POST") createCallCount++;
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: mockProjectId, status: "CREATED" }),
      });
    });
    await page.route("**/api/projects/*/image", (route) => {
      if (route.request().method() === "POST") uploadCallCount++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imageId: "101", projectId: mockProjectId }),
      });
    });

    await page.goto("/new-room");

    const pngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    // 1. Upload initial file A
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "original.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });

    await expect(page.getByTestId("room-image-preview")).toBeVisible();
    await expect(page.getByText("original.png")).toBeVisible();

    const submitBtn = page.getByTestId("submit-upload-btn");
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();

    // 2. Intercept decode in page to introduce artificial delay for next image
    await page.evaluate(() => {
      const originalCreateImageBitmap = window.createImageBitmap;
      const win = window as unknown as {
        __delayNextBitmap?: boolean;
      };
      win.__delayNextBitmap = true;
      window.createImageBitmap = (async (
        image: ImageBitmapSource,
        ...args: [options?: ImageBitmapOptions]
      ): Promise<ImageBitmap> => {
        if (win.__delayNextBitmap) {
          win.__delayNextBitmap = false;
          // Delay resolution so we can inspect and test the pending decoding state
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        return Reflect.apply(originalCreateImageBitmap, window, [
          image,
          ...args,
        ]) as Promise<ImageBitmap>;
      }) as unknown as typeof window.createImageBitmap;
    });

    // 3. Select replacement file B
    await fileInput.setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    });

    // 4. Submit button must be disabled immediately while decode is pending
    await expect(submitBtn).toBeDisabled();

    // Click submit while disabled (or attempting to click)
    if (await submitBtn.isEnabled()) {
      await submitBtn.click();
    }

    // Ensure no upload or create was triggered during pending decode
    expect(createCallCount).toBe(0);
    expect(uploadCallCount).toBe(0);

    // 5. Wait for replacement decode delay to finish
    await expect(page.getByText("replacement.png")).toBeVisible();
    await expect(submitBtn).toBeEnabled();

    // 6. Now submitting uploads replacement.png
    await submitBtn.click();
    await page.waitForResponse("**/api/projects/*/image");
    expect(createCallCount).toBe(1);
    expect(uploadCallCount).toBe(1);
  });
});
