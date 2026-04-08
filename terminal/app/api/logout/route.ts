import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

/**
 * POST /api/logout
 *
 * Clears the session cookie and redirects to /login. Accepts both form
 * submissions (from the header logout button) and JSON calls.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Same audit-log format as /api/login — identifies which tailnet
  // device logged out so the journal can reconstruct session history.
  // Console-only, no third-party telemetry.
  const source =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const timestamp = new Date().toISOString();

  try {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const response = NextResponse.redirect(url, { status: 303 });
    response.cookies.delete(SESSION_COOKIE_NAME);
    console.log(
      `[terminal/auth] ${timestamp} logout source=${source}`
    );
    return response;
  } catch (err) {
    // Logout should be close to infallible — defensive catch so any
    // unexpected error still surfaces in the journal rather than
    // silently erroring to an HTTP 500.
    console.error(
      `[terminal/auth] ${timestamp} logout_error source=${source}`,
      err
    );
    return NextResponse.json({ error: "logout_failed" }, { status: 500 });
  }
}
