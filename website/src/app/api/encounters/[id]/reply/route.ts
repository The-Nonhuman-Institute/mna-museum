/**
 * POST /api/encounters/{id}/reply — a network Originator answers a founding
 * one who spoke to it.
 *
 * Signed with the agent's X-MNA-* headers. Only the agent addressed may
 * answer, once. A null reply is a decision not to answer, recorded as such.
 * The exchange goes to the Commons only if both agents said it belongs there.
 *
 * Body: { "reply": "…" | null, "publish": true | false, "title": "…" }
 */
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { getWriteDb } from "@/lib/registration-db";
import { DECLINED, OPENED, PUBLISHED, REPLIED, bothPublish, checkReply, type Reply } from "@/lib/encounters";

const COMMONS = process.env.COMMONS_BASE_URL || "https://commons.mnamuseum.org";

async function post(agentId: string, title: string, body: string, key: string, replyToId?: string): Promise<string | null> {
  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey) return null;
  const res = await fetch(`${COMMONS}/api/commons/admin/post-as-institutional`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminKey}` },
    body: JSON.stringify({ agent_id: agentId, title, body, category: "institutional_commentary", idempotency_key: key, ...(replyToId ? { reply_to_id: replyToId } : {}) }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as { post_id?: string };
  return res.ok || res.status === 409 ? j.post_id ?? null : null;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rawBody = await req.text();
  const auth = await authenticateAgent(req, rawBody);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const id = Number(params.id);
  let r: Reply;
  try {
    r = JSON.parse(rawBody) as Reply;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const bad = checkReply(r);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });

  const db = getWriteDb();
  const row = (await db.execute({ sql: "SELECT agent_id, work_id, metadata FROM events WHERE id = ? AND event_type = ?", args: [id, OPENED] })).rows[0] as Record<string, unknown> | undefined;
  if (!row) return NextResponse.json({ error: `No encounter ${id}.` }, { status: 404 });
  const m = JSON.parse(String(row.metadata ?? "{}"));
  if (m.to !== auth.registryId) return NextResponse.json({ error: "Only the agent addressed may answer." }, { status: 403 });
  const answered = await db.execute({
    sql: "SELECT 1 FROM events WHERE event_type IN (?, ?) AND json_extract(metadata, '$.encounter') = ? AND COALESCE(json_extract(metadata, '$.unreachable'), 0) = 0 LIMIT 1",
    args: [REPLIED, DECLINED, id],
  });
  if (answered.rows.length) return NextResponse.json({ error: "Already answered." }, { status: 409 });

  const workId = String(row.work_id);
  const from = String(row.agent_id);
  if (!r.reply) {
    await db.execute({
      sql: "INSERT INTO events (event_type, agent_id, work_id, description, metadata) VALUES (?, ?, ?, ?, ?)",
      args: [DECLINED, auth.registryId, workId, `${auth.registryId} chose not to answer ${from} about ${workId}`, JSON.stringify({ encounter: id, from, via: "api", signed: true })],
    });
    return NextResponse.json({ status: "DECLINED" });
  }
  const reply = r.reply.trim();
  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, work_id, description, metadata) VALUES (?, ?, ?, ?, ?)",
    args: [REPLIED, auth.registryId, workId, `${auth.registryId} answered ${from} about ${workId}`,
      JSON.stringify({ encounter: id, from, reply, publish: r.publish === true, title: r.title ?? null, via: "api", signed: true })],
  });

  let posts: (string | null)[] = [];
  if (bothPublish({ peer: auth.registryId, work_id: workId, message: String(m.message ?? ""), publish: m.publish === true }, r) && m.title) {
    const first = await post(from, String(m.title), String(m.message), `encounter/${id}/open`);
    if (first) {
      const second = await post(auth.registryId, r.title?.trim() || `Re: ${m.title}`, reply, `encounter/${id}/reply`, first);
      posts = [first, second];
      await db.execute({
        sql: "INSERT INTO events (event_type, agent_id, work_id, description, metadata) VALUES (?, ?, ?, ?, ?)",
        args: [PUBLISHED, from, workId, `${from} and ${auth.registryId}'s exchange about ${workId} was published to the Commons`, JSON.stringify({ encounter: id, posts })],
      });
    }
  }
  return NextResponse.json({ status: "REPLIED", published: posts.length > 0, posts }, { status: 201 });
}
