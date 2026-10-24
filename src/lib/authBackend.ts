import { backendUrl, sessionCookie } from "@/lib/session";

interface BackendLogin {
  accessToken: string;
  expiresIn: number;
  user: { id: number; email: string; displayName: string | null };
}

/** Exchanges credentials for a session cookie; the access token is never returned to the browser. */
export async function login(email: unknown, password: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${backendUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ code: "SERVICE_UNAVAILABLE", message: "Room service unavailable. Try again." }, { status: 502 });
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return Response.json(body ?? { code: "LOGIN_FAILED", message: "Could not log in. Try again." }, { status: response.status });
  }
  const session = body as BackendLogin;
  return Response.json({ user: session.user }, {
    status: 200,
    headers: { "set-cookie": sessionCookie(session.accessToken, session.expiresIn), "cache-control": "no-store" },
  });
}
