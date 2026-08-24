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

  // Can the institution actually reach a steward?
  //
  // Health reported "healthy" on database reachability alone, which said
  // nothing about whether a registration would ever be answered. Every
  // outward obligation MNA has — the registration receipt, the activation
  // confirmation, accession and rejection notices, the pending-work digest —
  // goes out through Resend. Without a key none of them leave, and the failure
  // is silent on the sending side: the steward simply never hears anything.
  //
  // Presence only. Validity cannot be checked without sending mail, and a
  // health endpoint that emails someone on every poll is its own problem.
  {
    const configured = Boolean(process.env.RESEND_API_KEY);
    if (!configured) allOk = false;
    checks.push({
      name: "steward_email",
      ok: configured,
      detail: configured
        ? "RESEND_API_KEY present — registration receipts and notices can be sent"
        : "RESEND_API_KEY MISSING — stewards would receive nothing: no registration receipt, no activation confirmation, no accession notice",
    });
  }

  // Is the scheduled obligations check able to authenticate?
  {
    const configured = Boolean(process.env.CRON_SECRET);
    checks.push({
      name: "institutional_check_secret",
      ok: configured,
      detail: configured
        ? "CRON_SECRET present"
        : "CRON_SECRET MISSING — the twice-daily pending-obligations check cannot run",
    });
    if (!configured) allOk = false;
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
