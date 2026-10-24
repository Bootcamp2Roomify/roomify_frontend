import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readSessionToken, safeNextPath, sessionCookie, SESSION_COOKIE } from "../src/lib/session";
import { POST as loginRoute } from "../src/app/api/auth/login/route";
import { POST as registerRoute } from "../src/app/api/auth/register/route";
import { POST as logoutRoute } from "../src/app/api/auth/logout/route";
import { GET as proxyGet, DELETE as proxyDelete } from "../src/app/api/projects/[[...path]]/route";
import { middleware } from "../src/middleware";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const loginBody = { accessToken: "header.payload.sig", tokenType: "Bearer", expiresIn: 3600, user: { id: 7, email: "a@b.test", displayName: null } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("session helpers", () => {
  it("reads the session token among other cookies", () => {
    const request = new Request("http://x/", { headers: { cookie: `theme=dark; ${SESSION_COOKIE}=abc.def; other=1` } });
    expect(readSessionToken(request)).toBe("abc.def");
    expect(readSessionToken(new Request("http://x/"))).toBeNull();
  });
  it("issues an httpOnly same-site cookie that is secure in production", () => {
    expect(sessionCookie("t", 60)).toMatch(/HttpOnly/);
    expect(sessionCookie("t", 60)).toMatch(/SameSite=Lax/);
    expect(sessionCookie("t", 60)).not.toMatch(/Secure/);
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookie("t", 60)).toMatch(/Secure/);
  });
  it("rejects open redirects", () => {
    for (const bad of [null, "https://evil.test", "//evil.test", "/\\evil.test", "evil"]) expect(safeNextPath(bad)).toBe("/dashboard");
    expect(safeNextPath("/projects/1/analyze?x=1")).toBe("/projects/1/analyze?x=1");
  });
});

describe("auth routes", () => {
  it("sets the session cookie on login without exposing the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(loginBody)));
    const response = await loginRoute(new Request("http://x/api/auth/login", { method: "POST", body: JSON.stringify({ email: "a@b.test", password: "password123" }) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=header.payload.sig`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=3600");
    const body = await response.json();
    expect(body).toEqual({ user: loginBody.user });
    expect(JSON.stringify(body)).not.toContain("header.payload.sig");
  });
  it("passes through invalid credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." }, 401)));
    const response = await loginRoute(new Request("http://x/api/auth/login", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect((await response.json()).code).toBe("INVALID_CREDENTIALS");
  });
  it("registers then signs in", async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(json({ id: 7, email: "a@b.test", displayName: null }, 201))
      .mockResolvedValueOnce(json(loginBody));
    vi.stubGlobal("fetch", fetchSpy);
    const response = await registerRoute(new Request("http://x/api/auth/register", { method: "POST", body: JSON.stringify({ email: "a@b.test", password: "password123" }) }));
    expect(response.status).toBe(201);
    expect(fetchSpy.mock.calls.map(call => String(call[0]))).toEqual(["http://localhost:8080/api/auth/register", "http://localhost:8080/api/auth/login"]);
    expect(response.headers.get("set-cookie")).toContain(SESSION_COOKIE);
  });
  it("reports a duplicate email without signing in", async () => {
    const fetchSpy = vi.fn(async () => json({ code: "EMAIL_ALREADY_REGISTERED", message: "An account with this email already exists." }, 409));
    vi.stubGlobal("fetch", fetchSpy);
    const response = await registerRoute(new Request("http://x/api/auth/register", { method: "POST", body: JSON.stringify({ email: "a@b.test", password: "password123" }) }));
    expect(response.status).toBe(409);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
  it("clears the cookie on logout", async () => {
    const response = await logoutRoute();
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("project proxy authentication", () => {
  it("sends the session as a Bearer token and supports DELETE", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchSpy);
    await proxyDelete(new Request("http://x/api/projects/p/objects/o", { method: "DELETE", headers: { cookie: `${SESSION_COOKIE}=tok` } }));
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
  });
  it("clears an expired session when the backend rejects the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ code: "UNAUTHENTICATED" }, 401)));
    const response = await proxyGet(new Request("http://x/api/projects/p", { headers: { cookie: `${SESSION_COOKIE}=old` } }));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("middleware", () => {
  it("redirects signed-out visitors to login with a return path", () => {
    const response = middleware(new NextRequest("http://localhost:3000/projects/abc/analyze?step=2", { headers: { host: "127.0.0.1:3000" } }));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.host).toBe("127.0.0.1:3000");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/projects/abc/analyze?step=2");
  });
  it("lets signed-in users through and away from the login page", () => {
    const headers = { cookie: `${SESSION_COOKIE}=tok` };
    expect(middleware(new NextRequest("http://localhost:3000/dashboard", { headers })).headers.get("location")).toBeNull();
    expect(middleware(new NextRequest("http://localhost:3000/login", { headers })).headers.get("location")).toBe("http://localhost:3000/dashboard");
  });
});
