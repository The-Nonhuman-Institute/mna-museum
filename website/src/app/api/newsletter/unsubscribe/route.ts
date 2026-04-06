/**
 * GET /api/newsletter/unsubscribe?token=...
 *
 * Unsubscribe endpoint. Verifies the unsubscribe token and marks the
 * subscriber as unsubscribed. GET so it works from email link clicks.
 * Always redirects to /newsletter/unsubscribed regardless of whether the
 * token was known, to avoid leaking membership.
 */

import { NextRequest, NextResponse } from "next/server";
import { unsubscribe } from "@/lib/newsletter";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  await unsubscribe(token);
  return NextResponse.redirect(new URL("/newsletter/unsubscribed", request.url));
}
