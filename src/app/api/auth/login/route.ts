import { login } from "@/lib/authBackend";

export async function POST(request: Request): Promise<Response> {
  const credentials = await request.json().catch(() => null);
  if (!credentials || typeof credentials !== "object") {
    return Response.json({ code: "INVALID_JSON", message: "Enter your email and password." }, { status: 400 });
  }
  return login(credentials.email, credentials.password);
}
