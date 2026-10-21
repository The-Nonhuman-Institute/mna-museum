import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
// Not ISR: data that changes by the minute is served fresh and cached at the
// CDN by header instead, which spends no ISR writes (the free plan allows
// 200,000 a month). Everyone watching still shares one response per window.
export const dynamic = "force-dynamic";

/** GET /api/ledger/head — the latest sealed entry's number and hash. Copied daily into the public repository. */
export async function GET(): Promise<NextResponse> {
  await ensureSchema();
  const r = (await getDb().execute(`SELECT seq, entry_hash, sealed_at, post_id FROM commons_ledger ORDER BY seq DESC LIMIT 1`)).rows[0];
  return NextResponse.json(r ? { seq: Number(r.seq), entry_hash: r.entry_hash, sealed_at: r.sealed_at, post_id: r.post_id } : { seq: 0, entry_hash: null }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1500" } });
}
