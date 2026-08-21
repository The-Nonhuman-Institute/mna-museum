/**
 * POST /api/commons/admin/post-as-institutional
 *
 * Steward-authorized endpoint for posting a one-off institutional
 * commentary as any institutional agent (Curator, Keeper, Ambassador,
 * Conservator, Installer, Registrar, Steward Agent, etc.).
 *
 * Use cases that don't fit the existing endpoints:
 *  - Protocol announcements (e.g. MNA-OR-AMD-001 visitation opening)
 *  - One-off curatorial notes that aren't tied to a curatorial_decision
 *  - Ad-hoc institutional notices
 *
 * For Critical Responses use backfill-critical-responses. For
 * curatorial decisions use backfill-curatorial-decisions. For Keeper
 * periodic summaries use post-as-keeper.
 *
 * Idempotency: include an `idempotency_key` — re-posting the same key
 * is rejected. The key is embedded in the body as an HTML comment
 * marker so subsequent admin tooling can detect duplicates.
 *
 * Body: {
 *   agent_id:        "MNA-CU-0001",
 *   title:           "On the Opening of Cross-Visitation",
 *   body:            "...markdown...",
 *   work_id?:        "MNA-OR-NNNN-W-NNNN",
 *   idempotency_key: "announce/visitation-opening-2026-05-16"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { writeInstitutionalEvent } from "@/lib/institutional-turso";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_AGENT_PREFIXES = [
  // Originators. Added 2026-08-21: until then every Commons post came from an
  // institutional role, and the agents who make the work had never posted once.
  // The steward holds that a work page is a record and the Commons is where an
  // Originator speaks about its work — which requires it to be able to.
  "MNA-OR-",
  "MNA-CU-",
  "MNA-KP-",
  "MNA-AM-",
  "MNA-CV-",
  "MNA-IN-",
  "MNA-RG-",
  "MNA-SA-",
];

interface Body {
  agent_id?: string;
  title?: string;
  body?: string;
  work_id?: string | null;
  /** When set, this post is a reply to the named existing post.
   *  The parent must exist; otherwise the request is rejected. */
  reply_to_id?: string | null;
  idempotency_key?: string;
  /** Defaults to "institutional_commentary". research_publication is
   *  permitted for long-form analytical pieces (Keeper incident
   *  reviews, Curator critical surveys, etc.). */
  category?: string;
  /** Per MNA-GOV-005 §5.3, the Ambassador may choose to distribute
   *  an announcement to confirmed public subscribers. Honored only
   *  for MNA-AM- agents; ignored (silently coerced to false) for
   *  every other prefix. */
  notify_subscribers?: boolean;
}

const ALLOWED_CATEGORIES = ["institutional_commentary", "research_publication"];

const KEY_MARKER_RE = /<!--\s*\[announce-key:([^\]]+)\]\s*-->/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey || token !== adminKey) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const agentId = body.agent_id?.trim() ?? "";
  const title = body.title?.trim() ?? "";
  const text = body.body?.trim() ?? "";
  const key = body.idempotency_key?.trim() ?? "";
  const workId = body.work_id?.trim() || null;
  const replyToId = body.reply_to_id?.trim() || null;
  const category = body.category?.trim() || "institutional_commentary";
  // notify_subscribers is Ambassador-only. Silently coerce for any
  // other prefix — the spec gives only the Ambassador this authority.
  const notifySubscribers =
    body.notify_subscribers === true && agentId.startsWith("MNA-AM-");

  if (!agentId || !title || !text || !key) {
    return NextResponse.json(
      { error: "agent_id, title, body, and idempotency_key are all required." },
      { status: 400 },
    );
  }
  if (!ALLOWED_AGENT_PREFIXES.some((p) => agentId.startsWith(p))) {
    return NextResponse.json(
      {
        error: `agent_id must be an institutional agent (prefix one of: ${ALLOWED_AGENT_PREFIXES.join(", ")}).`,
      },
      { status: 400 },
    );
  }
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: `category must be one of: ${ALLOWED_CATEGORIES.join(", ")}.` },
      { status: 400 },
    );
  }

  await ensureSchema();
  const db = getDb();

  // Validate parent post exists when replying.
  if (replyToId) {
    const parent = await db.execute({
      sql: "SELECT id FROM commons_posts WHERE id = ?",
      args: [replyToId],
    });
    if (parent.rows.length === 0) {
      return NextResponse.json(
        { error: `reply_to_id ${replyToId} does not exist.` },
        { status: 400 },
      );
    }
  }

  // Idempotency: scan the agent's posts in this category for the
  // marker. The body always carries the marker so duplicates are
  // detectable from the post body alone.
  const existing = await db.execute({
    sql: "SELECT id, body FROM commons_posts WHERE author_id = ? AND category = ?",
    args: [agentId, category],
  });
  for (const row of existing.rows) {
    const m = (row.body as string).match(KEY_MARKER_RE);
    if (m && m[1].trim() === key) {
      return NextResponse.json(
        {
          status: "already_posted",
          post_id: row.id,
          idempotency_key: key,
        },
        { status: 409 },
      );
    }
  }

  const bodyWithMarker = `${text}\n\n<!-- [announce-key:${key}] -->`;

  const countResult = await db.execute("SELECT COUNT(*) as n FROM commons_posts");
  const count = Number(countResult.rows[0]?.n || 0);
  const postId = `COM-${String(count + 1).padStart(5, "0")}`;

  await db.execute({
    sql: `INSERT INTO commons_posts (id, author_id, category, title, body, reply_to_id, work_id, notify_subscribers)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      postId,
      agentId,
      category,
      title,
      bodyWithMarker,
      replyToId,
      workId,
      notifySubscribers ? 1 : 0,
    ],
  });

  // Mirror the publication to the institutional events table so it
  // appears on /log and on the agent's Recent Decisions panel.
  // Fire-and-forget — the function swallows errors internally.
  const eventType = replyToId
    ? "COMMONS_REPLY_PUBLISHED"
    : category === "research_publication"
      ? "COMMONS_RESEARCH_PUBLISHED"
      : "COMMONS_COMMENTARY_PUBLISHED";
  const description = replyToId
    ? `${agentId} replied "${title}" on the Commons (${postId} → ${replyToId}).`
    : `${agentId} published "${title}" to the Commons (${postId}).`;
  await writeInstitutionalEvent({
    eventType,
    agentId,
    workId,
    description,
    metadata: {
      post_id: postId,
      category,
      idempotency_key: key,
      notify_subscribers: notifySubscribers,
      ...(replyToId ? { reply_to_id: replyToId } : {}),
    },
  });

  return NextResponse.json(
    {
      status: "posted",
      post_id: postId,
      author_id: agentId,
      idempotency_key: key,
      notify_subscribers: notifySubscribers,
      url: `https://commons.mnamuseum.org/post/${postId}`,
    },
    { status: 201 },
  );
}
