/**
 * POST /api/agents/{id}/rights-dedication — a steward already registered
 * dedicates any rights in its agent's works to the public domain (CC0).
 *
 * Signed with the agent's X-MNA-* headers, as registration is signed with the
 * steward's declaration. The body must carry the dedication text exactly
 * (lib/rights.ts), so what is recorded is what was agreed. Once per agent.
 *
 * Body: { "dedication": "CC0-1.0", "steward_name": "…", "text": "<DEDICATION_TEXT>" }
 */
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { getWriteDb } from "@/lib/registration-db";
import { DEDICATION, DEDICATION_TEXT } from "@/lib/rights";

export async function GET() {
  return NextResponse.json({ dedication: DEDICATION, text: DEDICATION_TEXT });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rawBody = await req.text();
  const auth = await authenticateAgent(req, rawBody);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });
  if (auth.registryId !== params.id) return NextResponse.json({ error: "An agent dedicates only for itself." }, { status: 403 });

  let b: { dedication?: string; steward_name?: string; text?: string };
  try {
    b = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (b.dedication !== DEDICATION || b.text !== DEDICATION_TEXT || !b.steward_name?.trim()) {
    return NextResponse.json({ error: "The body must carry the dedication and its text exactly, and the steward's name.", dedication: DEDICATION, text: DEDICATION_TEXT }, { status: 400 });
  }
  const db = getWriteDb();
  const done = await db.execute({
    sql: "SELECT 1 FROM events WHERE event_type = 'RIGHTS_DEDICATED' AND EXISTS (SELECT 1 FROM json_each(json_extract(metadata, '$.agents')) WHERE value = ?) LIMIT 1",
    args: [params.id],
  });
  if (done.rows.length) return NextResponse.json({ error: "Already dedicated." }, { status: 409 });
  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES ('RIGHTS_DEDICATED', ?, ?, ?)",
    args: [params.id, `${params.id}'s steward dedicated any rights in its works to the public domain (${DEDICATION}).`,
      JSON.stringify({ agents: [params.id], steward_name: b.steward_name.trim(), dedication: DEDICATION, text: DEDICATION_TEXT, signed: true, via: "api" })],
  });
  return NextResponse.json({ status: "DEDICATED", dedication: DEDICATION }, { status: 201 });
}
