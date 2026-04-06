/**
 * GET /api/newsletter/confirm?token=...
 *
 * Double opt-in confirmation endpoint. Verifies the confirmation token,
 * marks the subscriber as confirmed, and redirects to a confirmation or
 * error page. GET so it works from email link clicks.
 */

import { NextRequest, NextResponse } from "next/server";
import { confirmSubscription } from "@/lib/newsletter";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const result = await confirmSubscription(token);

  if (!result.success) {
    return NextResponse.redirect(new URL("/newsletter/error", request.url));
  }

  const url = new URL("/newsletter/confirmed", request.url);
  if (result.email) url.searchParams.set("email", result.email);
  return NextResponse.redirect(url);
}
