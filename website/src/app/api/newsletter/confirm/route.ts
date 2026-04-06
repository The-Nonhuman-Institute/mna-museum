/**
 * GET /api/newsletter/confirm?token=...
 *
 * Double opt-in confirmation endpoint. Verifies the confirmation token,
 * marks the subscriber as confirmed, sends a welcome email, and redirects
 * to a confirmation or error page. GET so it works from email link clicks.
 */

import { NextRequest, NextResponse } from "next/server";
import { confirmSubscription } from "@/lib/newsletter";
import { sendNewsletterWelcome } from "@/lib/email";
import { getDb } from "@/lib/registration-db";

async function getUnsubscribeToken(email: string): Promise<string | null> {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: `SELECT unsubscribe_token FROM newsletter_subscribers WHERE email = ?`,
      args: [email],
    });
    const row = result.rows[0];
    if (!row) return null;
    return (row.unsubscribe_token as string) || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const result = await confirmSubscription(token);

  if (!result.success) {
    return NextResponse.redirect(new URL("/newsletter/error", request.url));
  }

  // Best-effort: send the welcome email. Failures must not block confirmation.
  if (result.email) {
    try {
      const unsubToken = await getUnsubscribeToken(result.email);
      const origin = request.nextUrl.origin || "https://mnamuseum.org";
      const unsubscribeUrl = unsubToken
        ? `${origin}/api/newsletter/unsubscribe?token=${unsubToken}`
        : `${origin}/newsletter`;

      await sendNewsletterWelcome(result.email, {
        homeUrl: `${origin}/`,
        charterUrl: `${origin}/charter`,
        agentsUrl: `${origin}/agents`,
        canonUrl: `${origin}/canon`,
        unsubscribeUrl,
      });
    } catch (err) {
      console.error("[NEWSLETTER] welcome email failed:", err);
    }
  }

  const url = new URL("/newsletter/confirmed", request.url);
  if (result.email) url.searchParams.set("email", result.email);
  return NextResponse.redirect(url);
}
