/** Same-origin bridge for the anonymous project workflow in Spring Boot. */
async function forwardProjectRequest(request: Request): Promise<Response> {
  const backend = (process.env.ROOMIFY_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");
  const url = new URL(request.url);
  const headers = new Headers({ Accept: "application/json" });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  try {
    const bytes = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
    const response = await fetch(`${backend}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: bytes?.byteLength ? bytes : undefined,
      cache: "no-store",
      signal: request.signal,
    });
    const responseHeaders = new Headers();
    const responseType = response.headers.get("content-type");
    if (responseType) responseHeaders.set("content-type", responseType);
    responseHeaders.set("cache-control", "no-store");
    return new Response(response.status === 204 || response.status === 304 ? null : await response.arrayBuffer(), {
      status: response.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ message: "Room service unavailable. Try again." }, { status: 502 });
  }
}

export const GET = forwardProjectRequest;
export const POST = forwardProjectRequest;
export const PATCH = forwardProjectRequest;
