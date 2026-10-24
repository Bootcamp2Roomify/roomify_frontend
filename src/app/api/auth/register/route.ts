import { backendUrl } from "@/lib/session";
import { login } from "@/lib/authBackend";

/** Creates the account, then signs the new user in so they land on their dashboard. */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ code: "INVALID_JSON", message: "Enter your email and password." }, { status: 400 });
  }
  let response: Response;
  try {
    response = await fetch(`${backendUrl()}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email: body.email, password: body.password, displayName: body.displayName }),
      cache: "no-store",
    });
  } catch {
    return Response.json({ code: "SERVICE_UNAVAILABLE", message: "Room service unavailable. Try again." }, { status: 502 });
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    return Response.json(error ?? { code: "REGISTRATION_FAILED", message: "Could not create your account." }, { status: response.status });
  }
  const signedIn = await login(body.email, body.password);
  return new Response(signedIn.body, { status: signedIn.ok ? 201 : signedIn.status, headers: signedIn.headers });
}
