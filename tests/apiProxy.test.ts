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
  it("forwards preference PUT requests with their JSON body", async () => {
    vi.stubEnv("ROOMIFY_API_URL", "http://localhost:8080");
    const fetchSpy = vi.fn(async () => Response.json({ saved: true })); vi.stubGlobal("fetch", fetchSpy);
    const { PUT } = await handlers();
    expect(PUT).toBeTypeOf("function");
    const result = await PUT(new Request("http://127.0.0.1:3381/api/projects/room/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"budgetAmount":100}' }));
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/projects/room/preferences");
    expect(init.method).toBe("PUT");
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"budgetAmount":100}');
    expect(result.status).toBe(200);
  });
  it("forwards image Accept headers and returns original binary bytes", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const fetchSpy = vi.fn(async () => new Response(bytes, { headers: { "Content-Type": "image/png" } })); vi.stubGlobal("fetch", fetchSpy);
    const { GET } = await handlers();
    const result = await GET(new Request("http://localhost:3000/api/projects/room/image/content", { headers: { Accept: "image/png" } }));
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("accept")).toBe("image/png");
    expect(result.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes);
  });

});
