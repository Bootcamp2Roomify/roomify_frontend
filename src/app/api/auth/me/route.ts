import { backendUrl, clearedSessionCookie, readSessionToken } from "@/lib/session";

export async function GET(request: Request): Promise<Response> {
  const token = readSessionToken(request);
  if (!token) return Response.json({ code: "UNAUTHENTICATED", message: "Please log in to continue." }, { status: 401 });
  try {
    const response = await fetch(`${backendUrl()}/api/auth/me`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
    });
    const headers = new Headers({ "cache-control": "no-store" });
    if (response.status === 401) headers.set("set-cookie", clearedSessionCookie());
    return Response.json(await response.json().catch(() => null), { status: response.status, headers });
  } catch {
    return Response.json({ code: "SERVICE_UNAVAILABLE", message: "Room service unavailable. Try again." }, { status: 502 });
  }
}
