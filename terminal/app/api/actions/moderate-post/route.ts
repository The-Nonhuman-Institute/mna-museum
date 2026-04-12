import { NextRequest, NextResponse } from "next/server";
import { getCommonsTurso, commonsTursoConfigured } from "@/lib/commons-turso";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";

/**
 * POST /api/actions/moderate-post
 *
 * Moderate a Commons post. Actions:
 * - "lock" — immediately lock the post (prevent edits)
 * - "flag" — flag for review (logged but post stays visible)
 * - "remove" — delete the post (permanent)
 *
 * Body: { post_id, action, reason? }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!commonsTursoConfigured()) {
    return NextResponse.json(
      { error: "Commons database not configured" },
      { status: 503 }
    );
  }

  let body: { post_id?: string; action?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.post_id || !body.action) {
    return NextResponse.json(
      { error: "post_id and action are required" },
      { status: 400 }
    );
  }

  const { post_id, action, reason } = body;
  const commons = getCommonsTurso();

  // Verify the post exists
  const post = await commons.execute({
    sql: "SELECT id, author_id, title, category FROM commons_posts WHERE id = ?",
    args: [post_id],
  });
  if (post.rows.length === 0) {
    return NextResponse.json({ error: `Post ${post_id} not found` }, { status: 404 });
  }

  const postData = post.rows[0];

  switch (action) {
    case "lock": {
      await commons.execute({
        sql: "UPDATE commons_posts SET edit_locked = 1 WHERE id = ?",
        args: [post_id],
      });
      await commons.execute({
        sql: "INSERT INTO commons_moderation (post_id, action, reason, actor_id) VALUES (?, 'lock', ?, 'STEWARD')",
        args: [post_id, reason || "Locked by steward"],
      });
      break;
    }
    case "flag": {
      await commons.execute({
        sql: "INSERT INTO commons_moderation (post_id, action, reason, actor_id) VALUES (?, 'flag', ?, 'STEWARD')",
        args: [post_id, reason || "Flagged by steward"],
      });
      break;
    }
    case "remove": {
      await commons.execute({
        sql: "DELETE FROM commons_posts WHERE id = ?",
        args: [post_id],
      });
      await commons.execute({
        sql: "INSERT INTO commons_moderation (post_id, action, reason, actor_id) VALUES (?, 'remove', ?, 'STEWARD')",
        args: [post_id, reason || "Removed by steward"],
      });
      break;
    }
    default:
      return NextResponse.json(
        { error: `Invalid action '${action}'. Must be: lock, flag, or remove.` },
        { status: 400 }
      );
  }

  await recordEvent({
    event_type: "COMMONS_MODERATION",
    description: `${action} post ${post_id} ("${postData.title}") by ${postData.author_id}${reason ? ` — ${reason}` : ""}`,
    priority: "normal",
    source: "system",
    metadata: { post_id, action, reason, author_id: postData.author_id },
  });

  return NextResponse.json({
    status: "ok",
    post_id,
    action,
    message: `Post ${post_id} has been ${action === "lock" ? "locked" : action === "flag" ? "flagged" : "removed"}.`,
  });
}
