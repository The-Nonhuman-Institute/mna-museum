import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionValue } from "@/lib/session";

/**
 * MNA Steward Terminal — auth gate proxy (Next.js 16.2+ convention).
 *
 * Every request that isn't a public asset or the login flow itself must
 * carry a valid signed session cookie. Unauthenticated requests to any
 * app route are redirected to /login. Unauthenticated requests to any
 * API route return 401 JSON (no redirect).
 *
 * This file runs in Edge runtime by default, which forbids Node's
 * `fs`, `path`, and `crypto` modules. Session verification uses Web
 * Crypto (available in Edge) via `lib/session.ts`, which is why this
 * file does NOT import from `lib/auth.ts` (that module uses bcryptjs
 * + Node fs to read the password hash file and is Node-runtime only).
 *
 * Next.js 16.2 replaced the `middleware.ts` file convention with
 * `proxy.ts` and renamed the expected export from `middleware` to
 * `proxy`. The signature and semantics are identical — only the file
 * name and export name changed.
 */
export async function proxy(
  request: NextRequest
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Paths that bypass auth — login flow, API login endpoint, PWA
  // manifest, favicon and home-screen icons, Next.js internals.
  // Icons must be publicly accessible so iOS can fetch them when the
  // user runs "Add to Home Screen" (Safari fetches apple-touch-icon
  // before the session cookie is known to the installer).
  const PUBLIC_PATHS = [
    "/login",
    "/api/login",
    "/manifest.json",
    "/favicon.svg",
    "/favicon.ico",
    "/icon.svg",
    "/apple-touch-icon.png",
    "/apple-touch-icon-precomposed.png",
    "/icon-192.png",
    "/icon-512.png",
  ];
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (pathname.startsWith("/_next/")) return NextResponse.next();
  if (pathname.startsWith("/icons/")) return NextResponse.next();

  // Check for a valid session cookie. verifySessionValue is async
  // because Web Crypto's HMAC verify is async.
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  const sessionValid = await verifySessionValue(cookie?.value);

  if (sessionValid) {
    // For authed page requests (not API, not static), set
    // Cache-Control: no-store so the browser always fetches fresh
    // HTML after code deploys. Without this, the PWA serves stale
    // cached pages and the steward has to log out and back in to
    // see updates — terrible UX.
    const response = NextResponse.next();
    if (!pathname.startsWith("/api/") && !pathname.startsWith("/_next/")) {
      response.headers.set("Cache-Control", "no-store, must-revalidate");
    }
    return response;
  }

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
