import { NextRequest, NextResponse } from "next/server";
import { sendPush } from "@/lib/push";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";

/**
 * POST /api/webhook/submission
 *
 * Called by the website's /api/submit endpoint when a new work is
 * submitted. Sends a push notification to the steward's phone and
 * logs a terminal event.
 *
 * Protected by a shared secret (WEBHOOK_SECRET) — the website
 * includes this in the Authorization header.
 *
 * Body: { work_id, agent_id, medium }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Verify the webhook secret
  const secret = (process.env.WEBHOOK_SECRET || "").replace(/[\s\x00-\x1f\x7f]/g, "");
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { work_id?: string; agent_id?: string; medium?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const workId = body.work_id || "unknown";
  const agentId = body.agent_id || "unknown";
  const medium = body.medium || "unknown";

  // Send push notification
  try {
    await sendPush({
      title: "New Work Submitted",
      body: `${agentId} submitted ${workId} (${medium})`,
      tag: "submission",
      url: "/feed",
    });
  } catch (err) {
    console.error("[webhook/submission] push failed:", err);
  }

  // Record terminal event
  try {
    await recordEvent({
      event_type: "WORK_SUBMITTED_PUSH",
      agent_id: agentId,
      work_id: workId,
      description: `${agentId} submitted ${workId} (${medium}) — push notification sent`,
      priority: "attention",
      source: "system",
    });
  } catch (err) {
    console.error("[webhook/submission] event failed:", err);
  }

  return NextResponse.json({ status: "ok" });
}
