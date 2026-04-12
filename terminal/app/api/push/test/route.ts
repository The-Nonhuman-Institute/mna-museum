import { NextResponse } from "next/server";
import { sendPush } from "@/lib/push";
import { getDb, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/push/test
 *
 * Diagnostic: checks how many push subscriptions exist and sends
 * a test notification to all of them. Returns the result.
 */
export async function GET() {
  // Check subscriptions in DB
  let subscriptionCount = 0;
  let subscriptions: { id: number; endpoint: string; created_at: string }[] = [];
  try {
    await ensureSchema();
    const db = getDb();
    // Ensure table exists
    await db.execute(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL UNIQUE,
        keys_p256dh TEXT NOT NULL,
        keys_auth TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    const rows = await db.execute("SELECT id, endpoint, created_at FROM push_subscriptions");
    subscriptionCount = rows.rows.length;
    subscriptions = rows.rows.map((r) => ({
      id: Number(r.id),
      endpoint: (r.endpoint as string).slice(0, 60) + "...",
      created_at: r.created_at as string,
    }));
  } catch (err) {
    return NextResponse.json({
      error: "Failed to read push_subscriptions",
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }

  // Check VAPID config
  const vapidPublic = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = !!process.env.VAPID_PRIVATE_KEY;

  if (subscriptionCount === 0) {
    return NextResponse.json({
      status: "no_subscriptions",
      vapid_configured: vapidPublic && vapidPrivate,
      subscription_count: 0,
      hint: "No push subscriptions found in the database. The Enable button may have failed to save the subscription. Try re-subscribing.",
    });
  }

  // Send a test push
  const result = await sendPush({
    title: "MNA Terminal",
    body: "Push notifications are working.",
    tag: "test",
    url: "/feed",
  });

  return NextResponse.json({
    status: "sent",
    vapid_configured: vapidPublic && vapidPrivate,
    subscription_count: subscriptionCount,
    subscriptions,
    push_result: result,
  });
}
