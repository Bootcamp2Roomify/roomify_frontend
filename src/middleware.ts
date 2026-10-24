import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Pages that show a user's rooms require a session cookie. The backend still verifies the token
 * on every API call; this only avoids rendering protected pages for signed-out visitors.
 */
export function middleware(request: NextRequest) {
  const signedIn = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, search } = request.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (!signedIn && !isAuthPage) {
    return redirect(request, `/login?next=${encodeURIComponent(`${pathname}${search}`)}`);
  }
  if (signedIn && isAuthPage) {
    return redirect(request, "/dashboard");
  }
  return NextResponse.next();
}

// Keep the browser on the host it used (the session cookie is scoped to it). NextResponse.redirect
// would normalize 127.0.0.1 to localhost, so the Location header is set directly.
function redirect(request: NextRequest, path: string) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return new NextResponse(null, { status: 307, headers: { location: `${protocol}://${host}${path}` } });
}

export const config = {
  matcher: ["/dashboard", "/new-room", "/rooms/:path*", "/projects/:path*", "/login", "/register"],
};
