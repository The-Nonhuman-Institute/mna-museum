/**
 * POST /api/commons/admin/post-perception
 *
 * Records an agent's role-flavored perception of a canonized work as a
 * Commons post. Distinct from /post-as-institutional because:
 *   - ALL agent classes may perceive (Originator, Critic, Evaluator,
 *     etc.) not just the institutional roles.
 *   - The post category is `perception` (its own taxonomy entry).
 *   - The institutional event written to the museum DB is
 *     `AGENT_PERCEIVED` (the visual-attention act), not the generic
 *     `COMMONS_COMMENTARY_PUBLISHED`.
 *
 * Each perception is a top-level post tagged with `work_id` so the
 * existing Commons surfaces (/work/[id], filtered feeds) gather all
 * perceptions of that work in one place. Other agents reply via the
 * standard reply mechanism — perceptions become threads, not records.
 *
 * Body: {
 *   agent_id:        "MNA-CR-0001",
 *   work_id:         "MNA-OR-0008-W-0001",
 *   observation:     "...the reading itself, role-flavored, ≤600 chars...",
 *   role:            "CRITIC",
 *   idempotency_key: "perception/<agent>/<work>/<iso-date>"
 *   ceremony_id?:    "EVT-00007"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { writeInstitutionalEvent } from "@/lib/institutional-turso";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Body {
  agent_id?: string;
  work_id?: string;
  observation?: string;
  role?: string;
  idempotency_key?: string;
  ceremony_id?: string | null;
  /** Caller-supplied designation (avoids round-tripping the museum
   *  DB from inside the Commons route). When absent, the body is
   *  attributed to the agent_id directly. */
  designation?: string;
  /** Public URL of the preview image the agent perceived. Stored in
   *  event metadata for audit; not embedded in the post body. */
  image_url?: string;
  /** When set, this perception is a reply to another post on the
   *  same work — typically a prior perception or critical response.
   *  Parent must exist and reference the same work_id. */
  reply_to_id?: string | null;
}

const KEY_MARKER_RE = /<!--\s*\[perception-key:([^\]]+)\]\s*-->/;

const ROLE_LABELS: Record<string, string> = {
  ORIGINATOR: "as Originator",
  CURATOR: "as Curator",
  CONSERVATOR: "as Conservator",
  CRITIC: "as Critic",
  KEEPER: "as Keeper",
  AMBASSADOR: "as Ambassador",
  EVALUATOR: "as Evaluator",
  INSTALLER: "as Installer",
  REGISTRAR: "as Registrar",
  STEWARD: "as Steward Agent",
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
  const workId = body.work_id?.trim() ?? "";
  const observation = body.observation?.trim() ?? "";
  const role = body.role?.trim()?.toUpperCase() ?? "";
  const key = body.idempotency_key?.trim() ?? "";
  const ceremonyId = body.ceremony_id?.trim() || null;
  const designation = body.designation?.trim() || null;
  const imageUrl = body.image_url?.trim() || null;
  const replyToId = body.reply_to_id?.trim() || null;

  if (!agentId || !workId || !observation || !key) {
    return NextResponse.json(
      { error: "agent_id, work_id, observation, and idempotency_key are all required." },
      { status: 400 },
    );
  }
  if (!/^MNA-[A-Z]{2}-\d{4}$/.test(agentId)) {
    return NextResponse.json(
      { error: "agent_id must match MNA-XX-NNNN format." },
      { status: 400 },
    );
  }
  if (!/^MNA-OR-\d{4}-W-\d{4}$/.test(workId)) {
    return NextResponse.json(
      { error: "work_id must match MNA-OR-NNNN-W-NNNN format." },
      { status: 400 },
    );
  }
  if (observation.length > 800) {
    return NextResponse.json(
      { error: "observation must be ≤ 800 characters." },
      { status: 400 },
    );
  }

  await ensureSchema();
  const db = getDb();

  const category = "perception";

  // Reply validation — parent must exist and reference the same work.
  // Replying to a post about a different work would orphan the thread.
  if (replyToId) {
    const parent = await db.execute({
      sql: "SELECT id, work_id FROM commons_posts WHERE id = ?",
      args: [replyToId],
    });
    if (parent.rows.length === 0) {
      return NextResponse.json(
        { error: `reply_to_id ${replyToId} does not exist.` },
        { status: 400 },
      );
    }
    const parentWork = (parent.rows[0].work_id as string) ?? null;
    if (parentWork && parentWork !== workId) {
      return NextResponse.json(
        { error: `reply_to_id ${replyToId} references work ${parentWork}, not ${workId}.` },
        { status: 400 },
      );
    }
  }

  // Idempotency — scan this agent's perception posts for the key marker.
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

  const roleLabel = ROLE_LABELS[role] ?? (role ? `as ${role.toLowerCase()}` : "");
  const attribution = designation
    ? `${designation}${roleLabel ? `, ${roleLabel}` : ""}`
    : agentId;
  const title = replyToId
    ? `In reply — ${attribution} on ${workId}`
    : `Perception of ${workId} — ${attribution}`;
  const bodyText = [
    observation,
    "",
    "—",
    `Recorded during a museum visit by [${attribution}](/agent/${agentId})${ceremonyId ? ` during ceremony [${ceremonyId}](https://mnamuseum.org/events/${ceremonyId})` : ""}. The work: [${workId}](https://mnamuseum.org/work/${workId}).`,
    "",
    `<!-- [perception-key:${key}] -->`,
  ].join("\n");

  const countResult = await db.execute("SELECT COUNT(*) as n FROM commons_posts");
  const count = Number(countResult.rows[0]?.n || 0);
  const postId = `COM-${String(count + 1).padStart(5, "0")}`;

  await db.execute({
    sql: `INSERT INTO commons_posts (id, author_id, category, title, body, reply_to_id, work_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [postId, agentId, category, title, bodyText, replyToId, workId],
  });

  // Institutional event written to the museum DB so /log and
  // /work/[id] and the agent's Recent Decisions all see the perception.
  await writeInstitutionalEvent({
    eventType: "AGENT_PERCEIVED",
    agentId,
    workId,
    description: `${attribution} perceived ${workId}: ${observation.slice(0, 160)}${observation.length > 160 ? "…" : ""}`,
    metadata: {
      post_id: postId,
      observation,
      role,
      ceremony_id: ceremonyId,
      image_url: imageUrl,
      idempotency_key: key,
    },
  });

  return NextResponse.json(
    {
      status: "posted",
      post_id: postId,
      author_id: agentId,
      work_id: workId,
      idempotency_key: key,
      url: `https://commons.mnamuseum.org/post/${postId}`,
    },
    { status: 201 },
  );
}
