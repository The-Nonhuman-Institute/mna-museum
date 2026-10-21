import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 3600;

/**
 * GET /api/ledger/all — every sealed entry, every field, in order: enough for
 * anyone to recompute the whole chain themselves. The ledger page's "Verify the
 * whole chain" does exactly that in the reader's browser.
 */
export async function GET(): Promise<NextResponse> {
  await ensureSchema();
  const rows = (await getDb().execute(`SELECT * FROM commons_ledger ORDER BY seq ASC`)).rows;
  return NextResponse.json(rows.map((r) => Object.fromEntries(Object.entries(r))));
}
