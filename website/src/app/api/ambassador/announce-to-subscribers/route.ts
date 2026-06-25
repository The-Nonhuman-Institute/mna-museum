/**
 * POST /api/ambassador/announce-to-subscribers
 *
 * Distributes an Ambassador Commons piece to every confirmed public
 * subscriber. Called by system/src/agent-consultation.ts after the
 * Ambassador publishes a piece with notify_subscribers=true (per
 * MNA-GOV-005 §5.3). Also callable by the Founding Steward for
 * manual sends.
 *
 * The institution does not surveil readers — no tracking pixels, no
 * open-rate metrics. Only sent / failed counts are recorded.
 *
 * Authorization: Bearer <MNA_ADMIN_KEY>
 *
 * Body:
 *   {
 *     "post_id": "COM-00123",
 *     "title":   "...",
 *     "body":    "...markdown...",
 *     "source_event_id": 794  // optional: events.id of the originating
 *                              // AMBASSADOR_ANNOUNCEMENT, for linkage
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { sendAmbassadorAnnouncementToAll } from "@/lib/announce";
import { getWriteDb } from "@/lib/registration-db";

interface AnnounceBody {
  post_id?: string;
  title?: string;
  body?: string;
  source_event_id?: number;
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey || token !== adminKey) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: AnnounceBody;
  try {
    body = (await request.json()) as AnnounceBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const postId = body.post_id?.trim() ?? "";
  const title = body.title?.trim() ?? "";
  const text = body.body?.trim() ?? "";
  const sourceEventId =
    typeof body.source_event_id === "number" ? body.source_event_id : null;

  if (!postId || !title || !text) {
    return NextResponse.json(
      { error: "post_id, title, and body are required." },
      { status: 400 }
    );
  }

  try {
    const result = await sendAmbassadorAnnouncementToAll({
      postId,
      title,
      body: text,
    });

    // Record the fan-out as a SUBSCRIBER_NOTIFICATION_SENT event so it
    // appears on /log and the Ambassador's recent decisions panel.
    try {
      await getWriteDb().execute({
        sql: `INSERT INTO events (event_type, agent_id, description, metadata)
              VALUES (?, ?, ?, ?)`,
        args: [
          "SUBSCRIBER_NOTIFICATION_SENT",
          "MNA-AM-0001",
          `Ambassador announcement "${title}" distributed to ${result.sent} subscriber${result.sent === 1 ? "" : "s"} (${postId}).`,
          JSON.stringify({
            post_id: postId,
            title,
            sent: result.sent,
            failed: result.failed,
            total: result.total,
            source_event_id: sourceEventId,
            steward_authorized: true,
          }),
        ],
      });
    } catch (err) {
      console.error("[ANNOUNCE] event write failed:", err);
    }

    return NextResponse.json({ post_id: postId, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ANNOUNCE] Endpoint error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
