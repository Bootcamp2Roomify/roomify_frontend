import { afterEach, expect, it, vi } from "vitest";
import { checkBackendHealth } from "../src/services/healthService";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("checks backend health through the same origin", async () => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://backend:8080");
  const fetchSpy = vi.fn(async (_url: string) => Response.json({ status: "UP" }));
  vi.stubGlobal("fetch", fetchSpy);
  await expect(checkBackendHealth()).resolves.toEqual({ status: "UP" });
  expect(fetchSpy.mock.calls[0][0]).toBe("/api/health");
});

it("forwards health responses through the server bridge", async () => {
  vi.stubEnv("ROOMIFY_API_URL", "http://localhost:8080");
  const fetchSpy = vi.fn(async (_url: string) => Response.json({ status: "UP" }));
  vi.stubGlobal("fetch", fetchSpy);
  const route = "../src/app/api/health/route";
  const handler = await import(route).catch(() => null);
  expect(handler).not.toBeNull();
  const { GET } = handler!;
  const response = await GET();
  expect(fetchSpy.mock.calls[0][0]).toBe("http://localhost:8080/api/health");
  expect(await response.json()).toEqual({ status: "UP" });
});
