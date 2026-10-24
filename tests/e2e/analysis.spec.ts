import { test, expect } from "@playwright/test";

const projectId = "00000000-0000-0000-0000-000000000080";
const objectId = "00000000-0000-0000-0000-000000000081";
const imageUrl = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#cbd5e1"/></svg>');

test.describe("ROOM-80 analysis states", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ projectId, imageUrl }) => {
      sessionStorage.setItem(`roomify_project_context_${projectId}`, JSON.stringify({
        projectId, image: { projectId, imageId: "101", imageUrl, width: 800, height: 600 },
      }));
    }, { projectId, imageUrl });
  });

  test("automatically starts once and disables the action while analysis is pending", async ({ page }) => {
    let posts = 0;
    await page.route(`**/api/projects/${projectId}/analysis`, async route => {
      if (route.request().method() === "POST") {
        posts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
        await route.fulfill({ json: { projectId, status: "ANALYZED", objects: [] } });
      } else await route.fulfill({ json: { projectId, objects: [] } });
    });
    await page.goto(`/projects/${projectId}/analyze`);
    await expect(page.getByTestId("analysis-spinner")).toBeVisible();
    await expect(page.getByRole("button", { name: /start analysis/i })).toBeDisabled();
    await expect(page.getByText("Analyzing room interior...")).toBeVisible();
    await expect(page.getByText(/analysis complete/i)).toBeVisible();
    expect(posts).toBe(1);
  });

  test("failure preserves image and keyboard retry loads saved UUID detections", async ({ page }) => {
    let posts = 0;
    await page.route(`**/api/projects/${projectId}/analysis`, async route => {
      if (route.request().method() === "POST") {
        posts++;
        await route.fulfill(posts === 1
          ? { status: 503, json: { message: "private downstream diagnostic" } }
          : { json: { projectId, status: "ANALYZED", objects: [] } });
      } else await route.fulfill({ json: { projectId, objects: [{ objectId, imageId: 101,
        label: "Modern Chair", confidence: 0.92, bbox: { x: .1, y: .2, w: .3, h: .4 }, modelVersion: "fixture-v1" }] } });
    });
    await page.goto(`/projects/${projectId}/analyze`);
    await expect(page.getByTestId("analysis-error-alert")).toHaveText(/We could not analyze this image. Try again./);
    await expect(page.getByText("private downstream diagnostic")).not.toBeVisible();
    await expect(page.getByRole("img", { name: /uploaded room image/i })).toHaveAttribute("src", imageUrl);
    await page.getByRole("button", { name: /retry analysis/i }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /modern chair · 92%/i })).toBeVisible();
    await expect(page.getByTestId(`detection-box-${objectId}`)).toBeVisible();
    expect(posts).toBe(2);
  });

  test("missing image metadata offers the upload recovery link without analysis writes", async ({ page }) => {
    let writes = 0;
    await page.route("**/api/projects/00000000-0000-0000-0000-000000000999/**", async route => {
      if (route.request().method() !== "GET") writes++;
      await route.fulfill({ status: 404, json: { code: "PROJECT_NOT_FOUND" } });
    });
    await page.goto("/projects/00000000-0000-0000-0000-000000000999/analyze");
    await expect(page.getByRole("link", { name: /upload a room image to start over/i })).toHaveAttribute("href", "/new-room");
    expect(writes).toBe(0);
  });
});
