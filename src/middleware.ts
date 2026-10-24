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
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  if (signedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/new-room", "/rooms/:path*", "/projects/:path*", "/login", "/register"],
};
