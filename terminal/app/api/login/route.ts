import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  createSessionValue,
} from "@/lib/session";

// Force this route onto the Node runtime so `lib/auth.ts` can use
// bcryptjs + fs to read the password hash file. The default Edge
// runtime can't handle those imports.
export const runtime = "nodejs";

/**
 * POST /api/login
 *
 * Verifies the steward's password against the bcrypt hash in the
 * environment and, on success, sets a signed session cookie and
 * redirects to the `next` path (defaulting to /feed).
 *
 * Accepts both form-encoded (from the login page form) and JSON (for
 * programmatic clients) request bodies.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Source identifier for login audit logs. Not privacy-sensitive — the
  // terminal lives behind Tailscale, so the "IP" is a tailnet address
  // that identifies which of the steward's own devices is connecting.
  // Logs go to stdout only (console.log) and are read from the terminal
  // process journal on the Mac Studio; nothing is sent to a third party.
  const source =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const timestamp = new Date().toISOString();

  let password = "";
  let next = "/feed";

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      password = String(body?.password || "");
      next = String(body?.next || "/feed");
    } else {
      const form = await request.formData();
      password = String(form.get("password") || "");
      next = String(form.get("next") || "/feed");
    }
  } catch (err) {
    console.error(
      `[terminal/auth] ${timestamp} login_error source=${source} reason=body_parse`,
      err
    );
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400 }
    );
  }

  if (!password) {
    console.warn(
      `[terminal/auth] ${timestamp} login_rejected source=${source} reason=empty_password`
    );
    return redirectBack(request, next, "empty");
  }

  let ok = false;
  try {
    ok = await verifyPassword(password);
  } catch (err) {
    console.error(
      `[terminal/auth] ${timestamp} login_error source=${source} reason=verify_failed`,
      err
    );
    return redirectBack(request, next, "invalid");
  }

  if (!ok) {
    console.warn(
      `[terminal/auth] ${timestamp} login_rejected source=${source} reason=password_mismatch`
    );
    return redirectBack(request, next, "invalid");
  }

  console.log(
    `[terminal/auth] ${timestamp} login_success source=${source}`
  );

  // Normalize the redirect target so an attacker can't pass an external URL.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/feed";

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = safeNext;
  redirectUrl.search = "";
  const response = NextResponse.redirect(redirectUrl, { status: 303 });

  // createSessionValue is async (Web Crypto HMAC sign is async in Edge),
  // so we await here even though this route runs in Node runtime —
  // keeps the session-cookie API uniform across both runtimes.
  const sessionValue = await createSessionValue();
  response.cookies.set(
    SESSION_COOKIE_NAME,
    sessionValue,
    SESSION_COOKIE_OPTIONS
  );

  return response;
}

function redirectBack(
  request: NextRequest,
  next: string,
  error: string
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("error", error);
  url.searchParams.set("next", next);
  return NextResponse.redirect(url, { status: 303 });
}
