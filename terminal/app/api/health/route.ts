import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { getInstitutionalTurso, institutionalTursoConfigured } from "@/lib/institutional-turso";
import { getCommonsTurso, commonsTursoConfigured } from "@/lib/commons-turso";

/**
 * GET /api/health
 *
 * Verifies the Terminal surface is operational:
 * - Terminal Turso DB (mna-terminal) is reachable
 * - Institutional Turso DB (mna-museum) is reachable
 * - Commons Turso DB (mna-commons) is reachable
 * - All three surfaces can cross-read
 *
 * Also checks remote surfaces (website, commons) health endpoints.
 * Returns 200 with status details, or 503 with failure diagnostics.
 */
export async function GET() {
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  let allOk = true;

  // Terminal DB
  try {
    await ensureSchema();
    const db = getDb();
    const result = await db.execute("SELECT 1 as ping");
    checks.push({ name: "terminal_db", ok: result.rows.length > 0 });
  } catch (err) {
    allOk = false;
    checks.push({ name: "terminal_db", ok: false, detail: err instanceof Error ? err.message : String(err) });
  }

  // Institutional DB
  if (institutionalTursoConfigured()) {
    try {
      const db = getInstitutionalTurso();
      const agents = await db.execute("SELECT COUNT(*) as n FROM agents");
      const keys = await db.execute("SELECT COUNT(*) as n FROM agent_keys");
      checks.push({
        name: "institutional_db",
        ok: true,
        detail: `${agents.rows[0]?.n} agents, ${keys.rows[0]?.n} keys`,
      });
    } catch (err) {
      allOk = false;
      checks.push({ name: "institutional_db", ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
  } else {
    allOk = false;
    checks.push({ name: "institutional_db", ok: false, detail: "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set" });
  }

  // Commons DB
  if (commonsTursoConfigured()) {
    try {
      const db = getCommonsTurso();
      const result = await db.execute("SELECT COUNT(*) as n FROM commons_posts");
      checks.push({ name: "commons_db", ok: true, detail: `${result.rows[0]?.n} posts` });
    } catch (err) {
      allOk = false;
      checks.push({ name: "commons_db", ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
  } else {
    checks.push({ name: "commons_db", ok: false, detail: "COMMONS_TURSO_DATABASE_URL / COMMONS_TURSO_AUTH_TOKEN not set" });
  }

  // Remote surface checks
  const surfaces = [
    { name: "website_health", url: "https://mnamuseum.org/api/health" },
    { name: "commons_health", url: "https://commons.mnamuseum.org/api/health" },
  ];
  for (const s of surfaces) {
    try {
      const res = await fetch(s.url, { next: { revalidate: 0 } });
      if (res.ok) {
        const data = await res.json();
        checks.push({ name: s.name, ok: data.status === "healthy", detail: data.status });
      } else {
        allOk = false;
        checks.push({ name: s.name, ok: false, detail: `HTTP ${res.status}` });
      }
    } catch (err) {
      allOk = false;
      checks.push({ name: s.name, ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
  }

  // Env var audit
  const envVars = {
    TURSO_DATABASE_URL: !!process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: !!process.env.TURSO_AUTH_TOKEN,
    TERMINAL_TURSO_DATABASE_URL: !!process.env.TERMINAL_TURSO_DATABASE_URL,
    TERMINAL_TURSO_AUTH_TOKEN: !!process.env.TERMINAL_TURSO_AUTH_TOKEN,
    COMMONS_TURSO_DATABASE_URL: !!process.env.COMMONS_TURSO_DATABASE_URL,
    COMMONS_TURSO_AUTH_TOKEN: !!process.env.COMMONS_TURSO_AUTH_TOKEN,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
  };

  return NextResponse.json(
    {
      surface: "terminal",
      url: "terminal.mnamuseum.org",
      status: allOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
      env_vars: envVars,
    },
    { status: allOk ? 200 : 503 }
  );
}
