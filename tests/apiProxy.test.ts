import { afterEach, describe, expect, it, vi } from "vitest";
const modulePath = "../src/app/api/projects/[[...path]]/route";
async function handlers() {
  const handler = await import(modulePath).catch(() => null);
  expect(handler, "project API bridge must be registered").not.toBeNull();
  return handler!;
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Project API bridge", () => {
  it("forwards upload bytes while excluding the browser Origin that Spring rejects", async () => {
    vi.stubEnv("ROOMIFY_API_URL", "http://localhost:8080/");
    const fetchSpy = vi.fn(async () => new Response('{"imageId":101}', { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchSpy);
    const { POST } = await handlers();
    const body = "--room\r\nContent-Disposition: form-data; name=\"file\"; filename=\"room.png\"\r\n\r\nimage-bytes\r\n--room--";
    const result = await POST(new Request("http://127.0.0.1:3381/api/projects/00000000-0000-0000-0000-000000000079/image", {
      method: "POST", headers: { Origin: "http://127.0.0.1:3381", "Content-Type": "multipart/form-data; boundary=room" }, body,
    }));
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/projects/00000000-0000-0000-0000-000000000079/image");
    expect(new Headers(init.headers).get("Origin")).toBeNull();
    expect(new Headers(init.headers).get("Content-Type")).toBe("multipart/form-data; boundary=room");
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(body);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ imageId: 101 });
  });
  it("preserves backend HTTP failures rather than disguising them as success", async () => {
    vi.stubEnv("ROOMIFY_API_URL", "http://localhost:8080");
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"message":"failed"}', { status: 503, headers: { "Content-Type": "application/json" } })));
    const { POST } = await handlers();
    const result = await POST(new Request("http://localhost:3000/api/projects/00000000-0000-0000-0000-000000000079/analysis", { method: "POST" }));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ message: "failed" });
  });
  it("returns a safe connection failure without disclosing backend internals", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("private stack"); }));
    const { GET } = await handlers();
    const result = await GET(new Request("http://localhost:3000/api/projects/00000000-0000-0000-0000-000000000079/analysis"));
    expect(result.status).toBe(502);
    expect(await result.text()).not.toContain("private stack");
  });
});
