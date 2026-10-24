import { clearedSessionCookie } from "@/lib/session";

export async function POST(): Promise<Response> {
  return new Response(null, { status: 204, headers: { "set-cookie": clearedSessionCookie() } });
}
