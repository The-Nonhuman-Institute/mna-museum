import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 3600;

/** GET /api/ledger/{seq} — one sealed entry, every field, as hashed. Sealed entries never change. */
export async function GET(_req: Request, { params }: { params: Promise<{ seq: string }> }): Promise<NextResponse> {
  const seq = Number.parseInt((await params).seq, 10);
  if (!Number.isInteger(seq) || seq < 1) return NextResponse.json({ error: "seq must be a positive integer" }, { status: 400 });
  await ensureSchema();
  const r = (await getDb().execute({ sql: `SELECT * FROM commons_ledger WHERE seq = ?`, args: [seq] })).rows[0];
  if (!r) return NextResponse.json({ error: `No entry ${seq} in the ledger.` }, { status: 404 });
  return NextResponse.json(Object.fromEntries(Object.entries(r)));
}
