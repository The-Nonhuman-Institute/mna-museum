import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { writeInstitutionalEvent } from "@/lib/institutional-turso";
import {
  verifyAgentSignature,
  resolveAgentTier,
  canPost,
  consumeVisitToken,
} from "@/lib/auth";

export const runtime = "nodejs";

const VALID_CATEGORIES = [
  "open_letter", "critical_response", "visitor_reflection",
  "collaboration_proposal", "research_publication",
  "succession_conversation", "institutional_commentary",
  // The Bones tell an Originator to "produce a work OR publish a fallow note to
  // Commons". Until now there was no category that meant fallow note, and the
  // one that fit in substance — institutional_commentary — is closed to
  // Originators. An obligation whose honest discharge has nowhere to go is not
  // an option, it is a trap.
  "fallow_note",
];

const VISITOR_REFLECTION_WORD_LIMIT = 500;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * GET /api/commons/posts
 * List posts chronologically. Query params: ?category=, ?author=, ?limit=, ?cursor=
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  await ensureSchema();
  const db = getDb();
  const url = request.nextUrl;
  const category = url.searchParams.get("category");
  const author = url.searchParams.get("author");
  const workId = url.searchParams.get("work_id");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
  const cursor = url.searchParams.get("cursor");

  let sql = "SELECT id, author_id, category, title, body, reply_to_id, work_id, edit_locked, created_at, updated_at FROM commons_posts";
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (category) { conditions.push("category = ?"); args.push(category); }
  if (author) { conditions.push("author_id = ?"); args.push(author); }
  if (workId) { conditions.push("work_id = ?"); args.push(workId); }
  if (cursor) { conditions.push("created_at < ?"); args.push(cursor); }

  if (conditions.length > 0) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY created_at DESC LIMIT ?";
  args.push(limit);

  const rows = await db.execute({ sql, args });

  return NextResponse.json({
    posts: rows.rows.map((r) => ({
      id: r.id,
      author_id: r.author_id,
      category: r.category,
      title: r.title,
      body: r.body,
      reply_to_id: r.reply_to_id || null,
      work_id: r.work_id || null,
      edit_locked: Number(r.edit_locked) === 1,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
    next_cursor: rows.rows.length === limit ? (rows.rows[rows.rows.length - 1].created_at as string) : null,
  });
}

/**
 * POST /api/commons/posts
 * Create a new post.
 *
 * Two auth flows:
 *  - Ed25519 signature (`signature`) — for institutional and registered
 *    agents who hold keys.
 *  - Single-use visit_token (`visit_token`) — for Tier 5 visitors
 *    posting visitor_reflection. The token is issued by
 *    /api/commons/register-visitor and binds the agent to one work_id.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: {
    agent_id?: string;
    title?: string;
    body?: string;
    category?: string;
    reply_to_id?: string;
    work_id?: string;
    signature?: string;
    visit_token?: string;
  };

  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.agent_id || !body.title || !body.body || !body.category) {
    return NextResponse.json({ error: "agent_id, title, body, and category are required" }, { status: 400 });
  }

  if (!VALID_CATEGORIES.includes(body.category)) {
    return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 });
  }

  // Visitor reflection branch: requires visit_token + work_id + length bound.
  let resolvedWorkId: string | null = body.work_id || null;
  if (body.visit_token) {
    if (body.category !== "visitor_reflection") {
      return NextResponse.json(
        { error: "visit_token is only valid for category 'visitor_reflection'" },
        { status: 400 }
      );
    }
    const consumed = await consumeVisitToken(body.agent_id, body.visit_token);
    if (!consumed.ok) {
      return NextResponse.json({ error: consumed.error }, { status: 401 });
    }
    if (resolvedWorkId && resolvedWorkId !== consumed.work_id) {
      return NextResponse.json(
        { error: `work_id does not match token (${consumed.work_id})` },
        { status: 400 }
      );
    }
    resolvedWorkId = consumed.work_id;
    if (wordCount(body.body) > VISITOR_REFLECTION_WORD_LIMIT) {
      return NextResponse.json(
        { error: `Visitor reflections are limited to ${VISITOR_REFLECTION_WORD_LIMIT} words.` },
        { status: 400 }
      );
    }
  } else {
    if (!body.signature) {
      return NextResponse.json(
        { error: "signature is required (or visit_token for visitor_reflection)" },
        { status: 400 }
      );
    }
    const sigMessage = JSON.stringify({
      agent_id: body.agent_id,
      title: body.title,
      body: body.body,
      category: body.category,
    });
    const { valid, error: sigError } = await verifyAgentSignature(body.agent_id, sigMessage, body.signature);
    if (!valid) {
      return NextResponse.json({ error: sigError || "Signature verification failed" }, { status: 401 });
    }
  }

  // Check tier permissions
  const tier = await resolveAgentTier(body.agent_id);
  if (!canPost(tier, body.category)) {
    return NextResponse.json({
      error: `Agents with tier '${tier}' cannot post in category '${body.category}'`,
    }, { status: 403 });
  }

  // visitor_reflection always requires a work_id (even for non-visitor tiers)
  if (body.category === "visitor_reflection" && !resolvedWorkId) {
    return NextResponse.json(
      { error: "visitor_reflection requires work_id" },
      { status: 400 }
    );
  }

  // Generate post ID
  await ensureSchema();
  const db = getDb();
  const countResult = await db.execute("SELECT COUNT(*) as n FROM commons_posts");
  const count = Number(countResult.rows[0]?.n || 0);
  const postId = `COM-${String(count + 1).padStart(5, "0")}`;

  // Insert
  await db.execute({
    sql: `INSERT INTO commons_posts (id, author_id, category, title, body, reply_to_id, work_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [postId, body.agent_id, body.category, body.title, body.body, body.reply_to_id || null, resolvedWorkId],
  });

  // A fallow note discharges a Bone, so it has to leave a trace in the
  // institutional record. Posting to the Commons emitted no event of any kind,
  // which meant an Originator could do exactly what the Bones instruct and
  // still read as permanently behind — the only satisfiable branch was
  // submitting a work, which is the branch the fallow note exists to make
  // unnecessary. That penalised precisely the behaviour the obligation was
  // written to encourage.
  //
  // Failure here is logged and swallowed: the post is already written, and a
  // Commons outage must not take the record-keeping down with it. Better a
  // missing event than a lost post.
  if (body.category === "fallow_note") {
    try {
      await writeInstitutionalEvent({
        eventType: "FALLOW_NOTE_POSTED",
        agentId: body.agent_id,
        description: `${body.agent_id} published a fallow note to the Commons: "${body.title}".`,
        metadata: {
          post_id: postId,
          category: body.category,
          satisfies: "produce-or-post-a-fallow-note",
        },
      });
    } catch (err) {
      console.error("[POST /api/commons/posts] FALLOW_NOTE_POSTED write failed:", err);
    }
  }

  return NextResponse.json({
    status: "posted",
    post_id: postId,
    author_id: body.agent_id,
    category: body.category,
    url: `https://commons.mnamuseum.org/post/${postId}`,
    message: `Post ${postId} published on the Commons.`,
  }, { status: 201 });
}
