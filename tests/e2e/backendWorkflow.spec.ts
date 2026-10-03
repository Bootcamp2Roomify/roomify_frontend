import { test, expect } from "@playwright/test";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";

const projectId = "00000000-0000-0000-0000-000000000079";
const objectId = "00000000-0000-0000-0000-000000000081";
const backendPort = Number(process.env.ROOMIFY_INTEGRATION_BACKEND_PORT || "3408");
let server: Server;
let records: { method: string; path: string; origin?: string; contentType?: string; body: Buffer }[] = [];
let failures = 1;
let empty = false;
let savedDecision = "UNSURE";

// An in-memory service reflects the implemented Spring DTOs. All browser calls
// pass through the actual Next route; no page.route API interception is used.
test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const method = request.method || "GET";
    const path = request.url || "";
    records.push({ method, path, origin: request.headers.origin, contentType: request.headers["content-type"], body });
    response.setHeader("Content-Type", "application/json");
    if (request.headers.origin) { response.writeHead(403); response.end('{"message":"Invalid CORS request"}'); return; }
    if (method === "POST" && path === "/api/projects") {
      response.writeHead(201); response.end(JSON.stringify({ id: projectId, status: "CREATED" }));
    } else if (method === "POST" && path === `/api/projects/${projectId}/image`) {
      response.end(JSON.stringify({ imageId: 101, projectId, bucket: "room-images", storageKey: `projects/${projectId}/room.png`, originalFilename: "room.png", contentType: "image/png", size: body.length }));
    } else if (method === "POST" && path === `/api/projects/${projectId}/analysis`) {
      if (failures-- > 0) { response.writeHead(503); response.end('{"message":"private vision failure"}'); }
      else response.end(JSON.stringify({ projectId, status: "ANALYZED", objects: empty ? [] : [{ id: 7, label: "Chair", confidence: .83, bbox: { xMin: .1, yMin: .2, xMax: .4, yMax: .6 }, decision: savedDecision }] }));
    } else if (method === "GET" && path === `/api/projects/${projectId}/analysis`) {
      response.end(JSON.stringify({ projectId, objects: empty ? [] : [{ objectId, imageId: 101, label: "Chair", confidence: .83, bbox: { x: .1, y: .2, w: .3, h: .4 }, modelVersion: "room-model-v1" }] }));
    } else if (method === "PATCH" && path === `/api/projects/${projectId}/objects/${objectId}`) {
      savedDecision = JSON.parse(body.toString()).decision;
      response.end(JSON.stringify({ objectId, decision: savedDecision }));
    } else { response.writeHead(404); response.end('{"message":"not found"}'); }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(backendPort, "127.0.0.1", resolve); });
  expect((server.address() as AddressInfo).port).toBe(backendPort);
});
test.afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
test.beforeEach(() => { records = []; failures = 1; empty = false; savedDecision = "UNSURE"; });

async function chooseRoomImage(page: import("@playwright/test").Page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 600;
    const context = canvas.getContext("2d")!; context.fillStyle = "#eee9df"; context.fillRect(0, 0, 800, 600);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[type="file"]').setInputFiles({ name: "room.png", mimeType: "image/png", buffer: Buffer.from(encoded, "base64") });
}

test("home → create → upload → analysis retry → UUID furniture decision through the real API bridge", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /create room/i }).click();
  await expect(page).toHaveURL(/\/new-room$/);
  await chooseRoomImage(page);
  await page.getByRole("button", { name: /analyze room/i }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/analyze$`));
  await expect(page.getByTestId("analysis-error-alert")).toContainText("We could not analyze this image. Try again.");
  await page.getByRole("button", { name: /retry analysis/i }).click();
  await expect(page.getByText(/analysis complete/i)).toBeVisible();
  await expect(page.getByTestId(`detection-box-${objectId}`)).toBeVisible();
  await page.getByRole("button", { name: /inspect chair · 83%/i }).click();
  await page.getByText("Keep", { exact: true }).click();
  await expect.poll(() => savedDecision).toBe("KEEP");
  await expect(page.getByRole("radio", { name: /keep/i })).toBeChecked();
  expect(records.map(r => `${r.method} ${r.path}`)).toEqual([
    "POST /api/projects", `POST /api/projects/${projectId}/image`,
    `POST /api/projects/${projectId}/analysis`, `POST /api/projects/${projectId}/analysis`,
    `GET /api/projects/${projectId}/analysis`, `PATCH /api/projects/${projectId}/objects/${objectId}`,
  ]);
  const upload = records[1];
  expect(upload.contentType).toMatch(/^multipart\/form-data; boundary=/);
  expect(upload.body.toString()).toContain('name="file"; filename="room.png"');
  expect(records.every(record => record.origin === undefined)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.reload();
  await expect(page.getByText(/no active room image found/i)).toBeVisible();
  expect(records).toHaveLength(6);
});

test("empty saved analysis is a successful room review", async ({ page }) => {
  empty = true; failures = 0;
  await page.goto("/new-room"); await chooseRoomImage(page);
  await page.getByRole("button", { name: /analyze room/i }).click();
  await expect(page.getByText(/0 objects detected/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^continue$/i })).toBeEnabled();
  expect(records.map(r => r.method)).toEqual(["POST", "POST", "POST", "GET"]);
});

test("sample upload, analysis and furniture choices never reach the service", async ({ page }) => {
  await page.goto("/ui-preview"); await chooseRoomImage(page);
  await page.getByRole("button", { name: /analyze room/i }).click();
  await expect(page.getByRole("status")).toContainText("Nothing was uploaded");
  await page.getByRole("button", { name: /analysis · room-80/i }).click();
  await page.getByLabel("Analysis preview state").selectOption("succeeded");
  await page.getByText("Keep", { exact: true }).first().click();
  await expect(page.getByRole("radio", { name: /keep/i }).first()).toBeChecked();
  await page.getByRole("button", { name: /detections · room-81/i }).click();
  await page.getByRole("radio", { name: /replace/i }).first().focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("radio", { name: /replace/i }).first()).toBeChecked();
  expect(records).toEqual([]);
});
