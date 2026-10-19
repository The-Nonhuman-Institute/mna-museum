import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { sealPending } from "@/lib/ledger";

export const runtime = "nodejs";

/**
 * GET /api/cron/commons-lock
 * Daily cron — locks all posts older than 24 hours (makes them immutable),
 * then seals the newly locked ones into the ledger (lib/ledger.ts).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureSchema();
  const db = getDb();

  const result = await db.execute(
    "UPDATE commons_posts SET edit_locked = 1 WHERE edit_locked = 0 AND datetime(created_at, '+24 hours') <= datetime('now')"
  );

  const ledger = await sealPending(db);

  return NextResponse.json({
    status: "ok",
    locked: result.rowsAffected,
    sealed: ledger.sealed,
    head: ledger.head,
  });
}
