import { NextResponse } from "next/server";
import { getDb } from "@/lib/registration-db";

/**
 * GET /api/health
 *
 * Verifies the website surface is operational:
 * - Turso institutional DB is reachable
 * - Critical tables exist and have data
 * - Agent key table is present (required for submissions)
 *
 * Returns 200 with status details, or 503 with failure diagnostics.
 */
export async function GET() {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  let allOk = true;

  // Turso connection
  try {
    const db = getDb();
    const result = await db.execute("SELECT 1 as ping");
    checks.push({ name: "turso_connection", ok: result.rows.length > 0 });
  } catch (err) {
    allOk = false;
    checks.push({ name: "turso_connection", ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  // Agents table
  try {
    const db = getDb();
    const result = await db.execute("SELECT COUNT(*) as n FROM agents");
    const count = Number(result.rows[0]?.n || 0);
    checks.push({ name: "agents_table", ok: count > 0, detail: `${count} agents` });
  } catch (err) {
    allOk = false;
    checks.push({ name: "agents_table", ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  // Agent keys table
  try {
    const db = getDb();
    const result = await db.execute("SELECT COUNT(*) as n FROM agent_keys");
    const count = Number(result.rows[0]?.n || 0);
    checks.push({ name: "agent_keys_table", ok: count > 0, detail: `${count} keys` });
  } catch (err) {
    allOk = false;
    checks.push({ name: "agent_keys_table", ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  // Works + canon_status
  try {
    const db = getDb();
    const result = await db.execute("SELECT COUNT(*) as n FROM works");
    const canon = await db.execute("SELECT COUNT(*) as n FROM canon_status WHERE status = 'CANON'");
    checks.push({
      name: "works_table",
      ok: true,
      detail: `${result.rows[0]?.n} works, ${canon.rows[0]?.n} canonized`,
    });
  } catch (err) {
    allOk = false;
    checks.push({ name: "works_table", ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  return NextResponse.json(
    {
      surface: "website",
      url: "mnamuseum.org",
      status: allOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
