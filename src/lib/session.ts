/** Server-side session helpers shared by route handlers and middleware. */
export const SESSION_COOKIE = "roomify_session";

export function backendUrl(): string {
  return (process.env.ROOMIFY_API_URL || "http://localhost:8080").replace(/\/$/, "");
}

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      const value = rest.join("=");
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

/** The token never reaches browser JavaScript: httpOnly, same-site, secure outside local dev. */
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  return attributes.join("; ");
}

export function clearedSessionCookie(): string {
  return sessionCookie("", 0);
}

/** Only same-site absolute paths are allowed as post-login destinations. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/dashboard";
  return value;
}
