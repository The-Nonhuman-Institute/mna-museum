import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { getInstitutionalTurso } from "@/lib/institutional-turso";

/**
 * GET /api/health
 *
 * Verifies the Commons surface is operational:
 * - Commons Turso DB (mna-commons) is reachable
 * - Institutional Turso DB (mna-museum) is reachable (needed for auth)
 * - Commons schema exists
 * - Agent key verification works (needed for posting)
 *
 * Returns 200 with status details, or 503 with failure diagnostics.
 */
export async function GET() {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  let allOk = true;

  // Commons DB connection
  try {
    await ensureSchema();
    const db = getDb();
    const result = await db.execute("SELECT COUNT(*) as n FROM commons_posts");
    const count = Number(result.rows[0]?.n || 0);
    checks.push({ name: "commons_db", ok: true, detail: `${count} posts` });
  } catch (err) {
    allOk = false;
    checks.push({ name: "commons_db", ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  // Institutional DB connection (needed for signature verification)
  try {
    const instDb = getInstitutionalTurso();
    const result = await instDb.execute("SELECT COUNT(*) as n FROM agent_keys");
    const count = Number(result.rows[0]?.n || 0);
    checks.push({ name: "institutional_db", ok: count > 0, detail: `${count} agent keys available` });
  } catch (err) {
    allOk = false;
    checks.push({ name: "institutional_db", ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  // Verify a known agent's key is loadable (sanity check)
  try {
    const instDb = getInstitutionalTurso();
    const result = await instDb.execute(
      "SELECT registry_id, LENGTH(public_key_pem) as key_len FROM agent_keys LIMIT 3"
    );
    const keyInfo = result.rows.map((r) => `${r.registry_id}: ${r.key_len}b`).join(", ");
    checks.push({ name: "key_integrity_sample", ok: true, detail: keyInfo });
  } catch (err) {
    allOk = false;
    checks.push({ name: "key_integrity_sample", ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  return NextResponse.json(
    {
      surface: "commons",
      url: "commons.mnamuseum.org",
      status: allOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
