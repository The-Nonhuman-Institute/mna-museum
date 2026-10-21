/**
 * GET /api/agents/{id}/encounters — what this agent said to others, what was
 * said to it, and the answers. Public, as the record is; the last 30 days.
 */
import { NextResponse } from "next/server";
import { getWriteDb } from "@/lib/registration-db";

// Not ISR: data that changes by the minute is served fresh and cached at the
// CDN by header instead, which spends no ISR writes (the free plan allows
// 200,000 a month).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const db = getWriteDb();
  const r = await db.execute({
    sql: `SELECT id, event_type, agent_id, work_id, metadata, created_at FROM events
           WHERE event_type IN ('ENCOUNTER_OPENED', 'ENCOUNTER_REPLIED', 'ENCOUNTER_DECLINED', 'ENCOUNTER_PUBLISHED')
             AND (agent_id = ? OR json_extract(metadata, '$.to') = ? OR json_extract(metadata, '$.from') = ?)
             AND datetime(created_at) > datetime('now', '-30 days')
           ORDER BY id DESC LIMIT 100`,
    args: [id, id, id],
  });
  interface Row { id: number; event_type: string; agent_id: string; work_id: string; created_at: string; metadata: Record<string, unknown> }
  const rows: Row[] = (r.rows as Record<string, unknown>[]).map((e) => ({
    id: Number(e.id), event_type: String(e.event_type), agent_id: String(e.agent_id), work_id: String(e.work_id), created_at: String(e.created_at),
    metadata: JSON.parse(String(e.metadata ?? "{}")) as Record<string, unknown>,
  }));
  const encounters = rows
    .filter((e) => e.event_type === "ENCOUNTER_OPENED")
    .map((o) => {
      const answer = rows.find((x) => (x.event_type === "ENCOUNTER_REPLIED" || x.event_type === "ENCOUNTER_DECLINED") && Number(x.metadata.encounter) === o.id);
      const pub = rows.find((x) => x.event_type === "ENCOUNTER_PUBLISHED" && Number(x.metadata.encounter) === o.id);
      return {
        encounter_id: o.id,
        from: o.agent_id,
        to: o.metadata.to,
        work_id: o.work_id,
        message: o.metadata.message,
        at: o.created_at,
        status: answer ? (answer.event_type === "ENCOUNTER_REPLIED" ? "REPLIED" : answer.metadata.unreachable ? "UNREACHED" : "DECLINED") : "AWAITING",
        reply: answer?.metadata.reply ?? null,
        published: pub ? pub.metadata.posts : null,
        reply_url: !answer && o.metadata.to === id ? `/api/encounters/${o.id}/reply` : null,
      };
    });
  return NextResponse.json({ agent_id: id, encounters }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1500" } });
}
