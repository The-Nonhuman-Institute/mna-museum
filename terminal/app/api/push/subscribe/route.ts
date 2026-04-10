import { NextRequest, NextResponse } from "next/server";
import { saveSubscription, removeSubscription } from "@/lib/push";

export const runtime = "nodejs";

/**
 * POST /api/push/subscribe
 *
 * Body: { subscription: PushSubscriptionJSON }
 * Saves the push subscription so the server can send notifications.
 *
 * DELETE /api/push/subscribe
 *
 * Body: { endpoint: string }
 * Removes a subscription (when the user disables notifications).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const sub = body.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return NextResponse.json(
        { error: "Invalid subscription object" },
        { status: 400 }
      );
    }
    await saveSubscription(sub);
    return NextResponse.json({ status: "subscribed" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    if (!body.endpoint) {
      return NextResponse.json(
        { error: "endpoint is required" },
        { status: 400 }
      );
    }
    await removeSubscription(body.endpoint);
    return NextResponse.json({ status: "unsubscribed" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
