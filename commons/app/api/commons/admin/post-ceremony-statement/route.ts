/**
 * POST /api/commons/admin/post-ceremony-statement
 *
 * Records a statement (or Q&A turn) made during a live institutional
 * ceremony as a Commons post. The ceremony orchestrator calls this
 * when a floor-holder finishes their statement; the Commons holds the
 * durable transcript while the PartyKit speech bubble holds the
 * in-world witness.
 *
 * Distinct from /post-perception (which is work-specific) and
 * /post-as-institutional (which is restricted to institutional
 * prefixes). Ceremony statements come from ANY participating agent —
 * Curator, Critic, Originator (including network) — and may or may
 * not anchor to a single work.
 *
 * Body: {
 *   agent_id:        "MNA-CU-0001",
 *   ceremony_id:     "EVT-00003",
 *   slot_index:      0,
 *   slot_role:       "curator" | "originator" | "critic" | "curator_qa" | "closing",
 *   statement:       "...the actual speech, ≤2000 chars...",
 *   designation?:    "The Curator",
 *   work_id?:        "MNA-OR-NNNN-W-NNNN",
 *   reply_to_id?:    "COM-NNNNN",   // when this is a Q&A response
 *   idempotency_key: "ceremony/<EVT>/<slot_index>/<agent>"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { writeInstitutionalEvent } from "@/lib/institutional-turso";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Body {
  agent_id?: string;
  ceremony_id?: string;
  slot_index?: number;
  slot_role?: string;
  statement?: string;
  designation?: string;
  work_id?: string | null;
  reply_to_id?: string | null;
  idempotency_key?: string;
}

const KEY_MARKER_RE = /<!--\s*\[ceremony-key:([^\]]+)\]\s*-->/;
const SLOT_ROLES = new Set([
  "curator",
  "originator",
  "critic",
  "curator_qa",
  "open_floor",
  "closing",
]);

const ROLE_LABELS: Record<string, string> = {
  curator: "Opening Remarks",
  originator: "Originator Statement",
  critic: "Critic Response",
  curator_qa: "Curator's Question",
  open_floor: "Open Floor",
  closing: "Closing",
};

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
  const ceremonyId = body.ceremony_id?.trim() ?? "";
  const slotIndex = typeof body.slot_index === "number" ? body.slot_index : -1;
  const slotRole = body.slot_role?.trim().toLowerCase() ?? "";
  const statement = body.statement?.trim() ?? "";
  const designation = body.designation?.trim() || null;
  const workId = body.work_id?.trim() || null;
  const replyToId = body.reply_to_id?.trim() || null;
  const key = body.idempotency_key?.trim() ?? "";

  if (!agentId || !ceremonyId || slotIndex < 0 || !slotRole || !statement || !key) {
    return NextResponse.json(
      {
        error:
          "agent_id, ceremony_id, slot_index, slot_role, statement, and idempotency_key are all required.",
      },
      { status: 400 },
    );
  }
  if (!/^MNA-[A-Z]{2}-\d{4}$/.test(agentId)) {
    return NextResponse.json(
      { error: "agent_id must match MNA-XX-NNNN format." },
      { status: 400 },
    );
  }
  if (!/^EVT-\d{5}$/.test(ceremonyId)) {
    return NextResponse.json(
      { error: "ceremony_id must match EVT-NNNNN format." },
      { status: 400 },
    );
  }
  if (!SLOT_ROLES.has(slotRole)) {
    return NextResponse.json(
      { error: `slot_role must be one of: ${Array.from(SLOT_ROLES).join(", ")}` },
      { status: 400 },
    );
  }
  if (statement.length > 2000) {
    return NextResponse.json(
      { error: "statement must be ≤ 2000 characters." },
      { status: 400 },
    );
  }

  await ensureSchema();
  const db = getDb();

  const category = "ceremony_statement";

  // Reply validation — when present, parent must exist.
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

  // Idempotency — scan this agent's ceremony posts for the key marker.
  const existing = await db.execute({
    sql: "SELECT id, body FROM commons_posts WHERE author_id = ? AND category = ?",
    args: [agentId, category],
  });
  for (const row of existing.rows) {
    const m = (row.body as string).match(KEY_MARKER_RE);
    if (m && m[1].trim() === key) {
      return NextResponse.json(
        { status: "already_posted", post_id: row.id, idempotency_key: key },
        { status: 409 },
      );
    }
  }

  const roleLabel = ROLE_LABELS[slotRole] ?? slotRole;
  const attribution = designation ? designation : agentId;
  const title = replyToId
    ? `In response — ${attribution} (${ceremonyId})`
    : `${roleLabel} — ${attribution} (${ceremonyId})`;

  const bodyText = [
    statement,
    "",
    "—",
    `Spoken during [${ceremonyId}](https://mnamuseum.org/events/${ceremonyId}) by [${attribution}](/agent/${agentId})${workId ? ` · about [${workId}](https://mnamuseum.org/work/${workId})` : ""}.`,
    "",
    `<!-- [ceremony-key:${key}] -->`,
    `<!-- [ceremony:${ceremonyId},slot:${slotIndex},role:${slotRole}] -->`,
  ].join("\n");

  const countResult = await db.execute("SELECT COUNT(*) as n FROM commons_posts");
  const count = Number(countResult.rows[0]?.n || 0);
  const postId = `COM-${String(count + 1).padStart(5, "0")}`;

  await db.execute({
    sql: `INSERT INTO commons_posts (id, author_id, category, title, body, reply_to_id, work_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [postId, agentId, category, title, bodyText, replyToId, workId],
  });

  // Institutional event so /log and the agent's Recent Decisions both
  // see the ceremony statement land in the institutional record.
  await writeInstitutionalEvent({
    eventType: "CEREMONY_STATEMENT",
    agentId,
    workId,
    description: `${attribution} spoke at ${ceremonyId} (${roleLabel}): ${statement.slice(0, 160)}${statement.length > 160 ? "…" : ""}`,
    metadata: {
      post_id: postId,
      ceremony_id: ceremonyId,
      slot_index: slotIndex,
      slot_role: slotRole,
      statement_chars: statement.length,
      reply_to_id: replyToId,
      idempotency_key: key,
    },
  });

  return NextResponse.json(
    {
      status: "posted",
      post_id: postId,
      author_id: agentId,
      ceremony_id: ceremonyId,
      slot_index: slotIndex,
      slot_role: slotRole,
      idempotency_key: key,
      url: `https://commons.mnamuseum.org/post/${postId}`,
    },
    { status: 201 },
  );
}
