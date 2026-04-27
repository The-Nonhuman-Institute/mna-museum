/**
 * Conservator activity stats for /agent/[id] (Conservator template).
 *
 * The Conservator validates rendered integrity of canonized works
 * across display contexts and applies bounded safe recoveries. Real
 * activity will populate `render_status` once the validation pipeline
 * runs; until then this returns zeros and "Awaiting first cycle"
 * placeholders rather than fabricated numbers.
 */

import { getDb } from "./registration-db";

export interface ConservatorStats {
  worksUnderWatch: number;
  validationsRun: number;
  recoveriesApplied: number;
  flagsRaised: number;
  /** null until uptime tracking ships. */
  averageUptime: number | null;
  daysSinceLastIncident: number;
  /** null until cross-context validation differential ships. */
  contextCoverage: number | null;
  spark: {
    validations: number[];
    recoveries: number[];
    flags: number[];
    uptime: number[];
    coverage: number[];
  };
}

export interface RecentValidation {
  workId: string;
  outputType: string;
  status: string;
  errorMessage: string | null;
  recoveryApplied: number;
  last_checked: string;
}

export interface ConservatorRelationship {
  agentId: string;
  designation: string;
  count: number;
}

export async function getConservatorStats(): Promise<ConservatorStats> {
  const db = getDb();

  const [worksRes, statusRes] = await Promise.all([
    db.execute(`SELECT COUNT(*) as n FROM works`),
    db.execute(`SELECT * FROM render_status`),
  ]);

  const worksUnderWatch = Number(worksRes.rows[0]?.n ?? 0);
  const rows = statusRes.rows.map((row) => ({
    work_id: String(row.work_id ?? ""),
    status: String(row.status ?? ""),
    error_message: (row.error_message as string) || null,
    recovery_applied: Number(row.recovery_applied ?? 0),
    last_checked: String(row.last_checked ?? ""),
  }));
  const validations = rows.length;
  const recoveries = rows.filter((x) => x.recovery_applied === 1).length;
  const flags = rows.filter(
    (x) => x.status === "FLAG" || x.error_message
  ).length;

  /* Days since last incident: from the most recent flagged status
     row, fall back to "—" / 0 if no flags yet. */
  let daysSinceLastIncident = 0;
  const flaggedDates = rows
    .filter((x) => x.status === "FLAG" || x.error_message)
    .map((x) => new Date(x.last_checked).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => b - a);
  if (flaggedDates.length > 0) {
    daysSinceLastIncident = Math.max(
      0,
      Math.floor((Date.now() - flaggedDates[0]) / 86_400_000)
    );
  }

  /* 12-month buckets. */
  const buckets = Array.from({ length: 12 }, () => ({
    val: 0,
    rec: 0,
    flag: 0,
  }));
  const now = new Date();
  for (const x of rows) {
    const idx = monthsAgo(x.last_checked, now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    const b = buckets[11 - idx];
    b.val++;
    if (x.recovery_applied === 1) b.rec++;
    if (x.status === "FLAG" || x.error_message) b.flag++;
  }

  return {
    worksUnderWatch,
    validationsRun: validations,
    recoveriesApplied: recoveries,
    flagsRaised: flags,
    averageUptime: null,
    daysSinceLastIncident,
    contextCoverage: null,
    spark: {
      validations: buckets.map((b) => b.val),
      recoveries: buckets.map((b) => b.rec),
      flags: buckets.map((b) => b.flag),
      uptime: [],
      coverage: [],
    },
  };
}

export async function getRecentValidations(
  limit = 5
): Promise<RecentValidation[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT work_id, output_type, status, error_message, recovery_applied, last_checked
            FROM render_status
           ORDER BY last_checked DESC
           LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((row) => ({
    workId: String(row.work_id ?? ""),
    outputType: String(row.output_type ?? ""),
    status: String(row.status ?? ""),
    errorMessage: (row.error_message as string) || null,
    recoveryApplied: Number(row.recovery_applied ?? 0),
    last_checked: String(row.last_checked ?? ""),
  }));
}

export async function getConservatorRelationships(): Promise<
  ConservatorRelationship[]
> {
  const db = getDb();
  const r = await db.execute(
    `SELECT w.originator_id as registry_id,
            a.common_designation,
            COUNT(*) as n
       FROM render_status rs
       JOIN works w ON w.id = rs.work_id
       LEFT JOIN agents a ON a.registry_id = w.originator_id
      GROUP BY w.originator_id
      ORDER BY n DESC`
  );
  return r.rows.map((row) => ({
    agentId: String(row.registry_id ?? ""),
    designation: String(row.common_designation ?? row.registry_id ?? ""),
    count: Number(row.n ?? 0),
  }));
}

export async function getConservatorTimeline(
  conservatorId: string
): Promise<{ date: string; label: string }[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT event_type, description, created_at
            FROM events
           WHERE agent_id = ?
           ORDER BY created_at ASC`,
    args: [conservatorId],
  });
  return r.rows.map((row) => ({
    date: String(row.created_at ?? ""),
    label: humanizeEvent(
      String(row.event_type ?? ""),
      String(row.description ?? "")
    ),
  }));
}

function monthsAgo(dateStr: string, now: Date): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return (
    (now.getFullYear() - d.getFullYear()) * 12 +
    (now.getMonth() - d.getMonth())
  );
}

function humanizeEvent(eventType: string, description: string): string {
  const map: Record<string, string> = {
    CONSTITUTION_REGISTERED: "Constitution registered (v1.0)",
    CONSTITUTION_AMENDED: "Constitution amended",
    AGENT_ACTIVATED: "Agent activated",
    VALIDATION_RUN: "Validation cycle complete",
    RECOVERY_APPLIED: "Safe recovery applied",
    FLAG_RAISED: "Render integrity flag raised",
  };
  if (map[eventType]) return map[eventType];
  if (description) return description.slice(0, 80);
  return eventType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
