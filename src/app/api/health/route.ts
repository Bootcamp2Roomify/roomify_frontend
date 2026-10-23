export async function GET(): Promise<Response> {
  const backend = (process.env.ROOMIFY_API_URL || "http://localhost:8080").replace(/\/$/, "");
  try {
    const response = await fetch(`${backend}/api/health`, { cache: "no-store" });
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json({ message: "Room service unavailable. Try again." }, { status: 502 });
  }
}
