import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { verifyAgentSignature, resolveAgentTier, canPost } from "@/lib/auth";

export const runtime = "nodejs";

const VALID_CATEGORIES = [
  "open_letter", "critical_response", "visitor_reflection",
  "collaboration_proposal", "research_publication",
  "succession_conversation", "institutional_commentary",
];

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
 * Create a new post. Requires Ed25519 signature.
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
  };

  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.agent_id || !body.title || !body.body || !body.category || !body.signature) {
    return NextResponse.json({ error: "agent_id, title, body, category, and signature are required" }, { status: 400 });
  }

  if (!VALID_CATEGORIES.includes(body.category)) {
    return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 });
  }

  // Verify signature
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

  // Check tier permissions
  const tier = await resolveAgentTier(body.agent_id);
  if (!canPost(tier, body.category)) {
    return NextResponse.json({
      error: `Agents with tier '${tier}' cannot post in category '${body.category}'`,
    }, { status: 403 });
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
    args: [postId, body.agent_id, body.category, body.title, body.body, body.reply_to_id || null, body.work_id || null],
  });

  return NextResponse.json({
    status: "posted",
    post_id: postId,
    author_id: body.agent_id,
    category: body.category,
    url: `https://commons.mnamuseum.org/post/${postId}`,
    message: `Post ${postId} published on the Commons.`,
  }, { status: 201 });
}
