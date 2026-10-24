import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { VALID_PNG_BASE64 } from "../helpers/imageFixtures";

const projectId = "00000000-0000-0000-0000-000000000079";
const objectId = "00000000-0000-0000-0000-000000000081";
const backendPort = 41847;
const requests: string[] = [];
let savedPreferences: Record<string, unknown> | null = null;
let server: Server;

// One fixed-port fake backend is shared by every test in this file.
test.describe.configure({ mode: "default" });

test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const path = request.url || "";
    requests.push(`${request.method} ${path}`);
    const reply = (status: number, value: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(status === 204 ? undefined : JSON.stringify(value));
    };
    if (path === `/api/projects/${projectId}/image` && request.method === "GET") {
      return reply(200, { projectId, imageId: 101, imageUrl: `http://127.0.0.1:${backendPort}/api/projects/${projectId}/image/content`, width: 1, height: 1 });
    }
    if (path === `/api/projects/${projectId}/image/content` && request.method === "GET") {
      response.writeHead(200, { "content-type": "image/png" });
      return response.end(Buffer.from(VALID_PNG_BASE64, "base64"));
    }
    if (path === `/api/projects/${projectId}/analysis` && request.method === "POST") {
      return reply(200, { projectId, status: "ANALYZED", objects: [] });
    }
    if (path === `/api/projects/${projectId}/analysis` && request.method === "GET") {
      return reply(200, { projectId, objects: [{ objectId, imageId: 101, label: "Chair", confidence: 0.83, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, modelVersion: "room-model-v1" }] });
    }
    if (path === `/api/projects/${projectId}/preferences/limits` && request.method === "GET") {
      return reply(200, { maxBudgetAmount: 10000 });
    }
    if (path === `/api/projects/${projectId}/preferences` && request.method === "GET") {
      return savedPreferences ? reply(200, savedPreferences) : reply(204, null);
    }
    if (path === `/api/projects/${projectId}/preferences` && request.method === "PUT") {
      const parts: Buffer[] = [];
      for await (const part of request) parts.push(Buffer.from(part));
      savedPreferences = { ...JSON.parse(Buffer.concat(parts).toString("utf8")), projectId, maxBudgetAmount: 10000 };
      return reply(200, savedPreferences);
    }
    reply(404, { message: "Missing fixture route" });
  });
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(backendPort, "127.0.0.1", resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test("restores the active image through Next and analyzes before loading stored objects", async ({ page }) => {
  requests.length = 0;
  await page.goto(`/projects/${projectId}/analyze`);
  await expect(page.getByTestId("detection-review")).toBeVisible();
  await expect(page.getByRole("button", { name: /chair · 83%/i })).toBeVisible();
  await expect(page.getByTestId(`detection-box-${objectId}`)).toBeVisible();
  const image = page.getByRole("img", { name: /room preview/i });
  await expect(image).toHaveAttribute("src", `/api/projects/${projectId}/image/content`);
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(1);
  expect(requests.indexOf(`POST /api/projects/${projectId}/analysis`)).toBeLessThan(requests.indexOf(`GET /api/projects/${projectId}/analysis`));
  expect(requests).toContain(`GET /api/projects/${projectId}/image/content`);

  await page.reload();
  await expect(page.getByTestId("detection-review")).toBeVisible();
});

test("saves preferences through Next PUT and restores the saved draft", async ({ page }) => {
  savedPreferences = null;
  requests.length = 0;
  await page.goto(`/rooms/${projectId}`);
  await expect(page.getByLabel("Style (required)")).toBeEnabled();
  await page.getByLabel("Style (required)").selectOption("MODERN");
  await page.getByLabel("Budget (required)").fill("100");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Preferences saved. Review them before generation.")).toBeVisible();
  expect(requests).toContain(`PUT /api/projects/${projectId}/preferences`);
  expect(savedPreferences).toMatchObject({ projectId, style: "MODERN", budgetAmount: 100 });
  await page.reload();
  await expect(page.getByLabel("Style (required)")).toHaveValue("MODERN");
  await expect(page.getByLabel("Budget (required)")).toHaveValue("100");
});

test("previews upload, analysis, and decisions without project API requests", async ({ page }) => {
  const projectRequests: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/projects")) projectRequests.push(request.url()); });
  await page.goto("/ui-preview");
  await page.getByRole("button", { name: "Analysis · ROOM-80" }).click();
  await expect(page.getByText("A closer look at the furniture and details in your room.")).toBeVisible();
  await page.getByRole("button", { name: "Detections · ROOM-81" }).click();
  await expect(page.getByRole("button", { name: /sofa · 97%/i })).toBeVisible();
  await page.getByRole("radio", { name: /keep/i }).first().locator("..").click();
  expect(projectRequests).toEqual([]);
});
