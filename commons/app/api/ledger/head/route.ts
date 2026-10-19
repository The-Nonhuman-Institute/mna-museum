import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 60;

/** GET /api/ledger/head — the latest sealed entry's number and hash. Copied daily into the public repository. */
export async function GET(): Promise<NextResponse> {
  await ensureSchema();
  const r = (await getDb().execute(`SELECT seq, entry_hash, sealed_at, post_id FROM commons_ledger ORDER BY seq DESC LIMIT 1`)).rows[0];
  return NextResponse.json(r ? { seq: Number(r.seq), entry_hash: r.entry_hash, sealed_at: r.sealed_at, post_id: r.post_id } : { seq: 0, entry_hash: null });
}
