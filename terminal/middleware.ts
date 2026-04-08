import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionValue } from "@/lib/auth";

/**
 * MNA Steward Terminal — auth gate middleware.
 *
 * Every request that isn't a public asset or the login flow itself must
 * carry a valid signed session cookie. Unauthenticated requests to any
 * app route are redirected to /login. Unauthenticated requests to any
 * API route return 401 JSON (no redirect).
 *
 * Note: Next.js 16 introduces proxy.ts as the preferred pattern for
 * intercept/auth/rewrite logic. middleware.ts still works and will
 * continue to work — this project uses middleware.ts for maximum
 * portability across Next 13-16. Migration to proxy.ts is a one-line
 * rename when the codebase is ready.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Paths that bypass auth — login flow, API login endpoint, PWA manifest,
  // favicon, static assets, and Next.js internals.
  const PUBLIC_PATHS = [
    "/login",
    "/api/login",
    "/manifest.json",
    "/favicon.svg",
    "/icon.svg",
  ];
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (pathname.startsWith("/_next/")) return NextResponse.next();
  if (pathname.startsWith("/icons/")) return NextResponse.next();

  // Check for a valid session cookie.
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  const sessionValid = verifySessionValue(cookie?.value);

  if (sessionValid) return NextResponse.next();

  // API requests: 401 JSON so fetch callers get a clean error.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // App requests: redirect to /login, preserving the requested path as a
  // `next` query parameter so the login handler can redirect back after
  // successful auth.
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Match everything except the Next.js static/image endpoints. Our
  // handler above does finer-grained allowlisting for the public paths.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
