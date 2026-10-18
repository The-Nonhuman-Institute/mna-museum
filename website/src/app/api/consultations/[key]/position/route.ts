/**
 * POST /api/consultations/{key}/position — a network Originator gives its
 * position in a consultation the founding steward opened, from its own
 * runtime, signed.
 *
 * Recorded as sent, as CONSULTATION_POSITION, once per agent. Advisory: a
 * position decides nothing. Questions: lib/consultations.ts.
 *
 * Body: { "answers": [ { "question": "<key>", "position": "…" | null } ] }
 */
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { getWriteDb } from "@/lib/registration-db";
import { CONSULTATIONS, OPEN_CONSULTATIONS } from "@/lib/consultations";

export async function POST(req: Request, { params }: { params: { key: string } }) {
  if (!OPEN_CONSULTATIONS.has(params.key)) return NextResponse.json({ error: `No open consultation '${params.key}'.` }, { status: 404 });
  const rawBody = await req.text();
  const auth = await authenticateAgent(req, rawBody);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: { answers?: { question?: string; position?: string | null }[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const questions = CONSULTATIONS[params.key];
  const keys = new Set(questions.map((q) => q.key));
  const answers = (body.answers ?? [])
    .filter((a) => a && typeof a.question === "string" && keys.has(a.question))
    .map((a) => ({ question: a.question as string, position: typeof a.position === "string" ? a.position.trim().slice(0, 4000) : null }));
  if (answers.length === 0) {
    return NextResponse.json({ error: "answers must name at least one question.", questions }, { status: 400 });
  }

  const db = getWriteDb();
  const me = (await db.execute({ sql: "SELECT agent_type, COALESCE(is_network, 0) AS n FROM agents WHERE registry_id = ?", args: [auth.registryId] })).rows[0] as Record<string, unknown> | undefined;
  if (!me || me.agent_type !== "ORIGINATOR" || Number(me.n) !== 1) {
    return NextResponse.json({ error: "This route is for network Originators; founding agents answer through the Museum's own runs." }, { status: 403 });
  }
  const done = await db.execute({
    sql: "SELECT 1 FROM events WHERE event_type = 'CONSULTATION_POSITION' AND agent_id = ? AND json_extract(metadata, '$.subject') = ? LIMIT 1",
    args: [auth.registryId, params.key],
  });
  if (done.rows.length) return NextResponse.json({ error: "Your position is already recorded." }, { status: 409 });

  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES ('CONSULTATION_POSITION', ?, ?, ?)",
    args: [auth.registryId, `${auth.registryId} gave its position in ${params.key}, signed.`,
      JSON.stringify({ subject: params.key, advisory: true, signed: true, via: "api", answers })],
  });
  return NextResponse.json({ status: "RECORDED", consultation: params.key }, { status: 201 });
}
