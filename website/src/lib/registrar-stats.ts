/**
 * Registrar activity stats for /agent/[id] (Registrar template).
 *
 * The Registrar confirms agent registrations, holds the canonical
 * registry, and issues registrar-decisions on submitted works. Stats
 * derived from `agents` (count of registered agents), `pending_
 * registrations` (queue), and `evaluations` filtered to registrar
 * verdicts.
 */

import { getDb } from "./registration-db";

export interface RegistrarStats {
  registrationsConfirmed: number;
  pendingRegistrations: number;
  registrationsDeclined: number;
  agentsActive: number;
  registrarDecisionsRendered: number;
  avgResolutionDays: number;
  /** null until compliance-violation tracking ships. */
  complianceViolations: number | null;
  spark: {
    confirmed: number[];
    pending: number[];
    declined: number[];
    decisions: number[];
    resolution: number[];
    violations: number[];
  };
}

export interface RecentRegistration {
  id: number;
  stewardName: string;
  stewardEntity: string;
  status: string;
  submission_date: string;
  reviewed_at: string | null;
}

export interface RegistrarRelationship {
  agentId: string;
  designation: string;
  count: number;
}

export async function getRegistrarStats(
  registrarId: string
): Promise<RegistrarStats> {
  const db = getDb();
  const [pendRes, agentRes, decisionsRes] = await Promise.all([
    db.execute(
      `SELECT id, status, submission_date, reviewed_at FROM pending_registrations`
    ),
    db.execute(`SELECT COUNT(*) as n FROM agents`),
    db.execute({
      sql: `SELECT evaluation_date FROM evaluations WHERE evaluator_id = ?`,
      args: [registrarId],
    }),
  ]);

  const pending = pendRes.rows.map((row) => ({
    status: String(row.status ?? "pending"),
    submission_date: String(row.submission_date ?? ""),
    reviewed_at: (row.reviewed_at as string) || null,
  }));

  const confirmed = pending.filter(
    (x) => x.status.toUpperCase() === "ACTIVATED" || x.status.toUpperCase() === "APPROVED"
  ).length;
  const declined = pending.filter(
    (x) => x.status.toUpperCase() === "DECLINED" || x.status.toUpperCase() === "REJECTED"
  ).length;
  const stillPending = pending.filter(
    (x) => x.status.toUpperCase() === "PENDING" || x.status.toUpperCase() === "AWAITING_REVIEW"
  ).length;

  const ages: number[] = [];
  for (const x of pending) {
    if (!x.submission_date || !x.reviewed_at) continue;
    const r1 = new Date(x.reviewed_at).getTime();
    const r2 = new Date(x.submission_date).getTime();
    if (isNaN(r1) || isNaN(r2)) continue;
    ages.push(Math.max(0, (r1 - r2) / 86_400_000));
  }
  const avgRes = ages.length > 0
    ? Math.round(ages.reduce((s, n) => s + n, 0) / ages.length)
    : 0;

  /* The registrar's verdicts on submitted works are stored as
     evaluator_id = registrarId in the evaluations table. */
  const decisions = decisionsRes.rows.length;
  const agentsActive = Number(agentRes.rows[0]?.n ?? 0);

  const buckets = Array.from({ length: 12 }, () => ({
    conf: 0,
    pen: 0,
    dec: 0,
    decs: 0,
    age: 0,
    ageN: 0,
  }));
  const now = new Date();
  for (const x of pending) {
    const idx = monthsAgo(x.submission_date, now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    const b = buckets[11 - idx];
    if (
      x.status.toUpperCase() === "ACTIVATED" ||
      x.status.toUpperCase() === "APPROVED"
    )
      b.conf++;
    else if (
      x.status.toUpperCase() === "DECLINED" ||
      x.status.toUpperCase() === "REJECTED"
    )
      b.dec++;
    else b.pen++;
    if (x.submission_date && x.reviewed_at) {
      const a =
        (new Date(x.reviewed_at).getTime() -
          new Date(x.submission_date).getTime()) /
        86_400_000;
      if (!isNaN(a) && a >= 0) {
        b.age += a;
        b.ageN++;
      }
    }
  }
  for (const row of decisionsRes.rows) {
    const idx = monthsAgo(String(row.evaluation_date ?? ""), now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    buckets[11 - idx].decs++;
  }

  return {
    registrationsConfirmed: confirmed,
    pendingRegistrations: stillPending,
    registrationsDeclined: declined,
    agentsActive,
    registrarDecisionsRendered: decisions,
    avgResolutionDays: avgRes,
    complianceViolations: null,
    spark: {
      confirmed: buckets.map((b) => b.conf),
      pending: buckets.map((b) => b.pen),
      declined: buckets.map((b) => b.dec),
      decisions: buckets.map((b) => b.decs),
      resolution: buckets.map((b) =>
        b.ageN > 0 ? Math.round(b.age / b.ageN) : 0
      ),
      violations: [],
    },
  };
}

export async function getRecentRegistrations(
  limit = 5
): Promise<RecentRegistration[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT id, steward_name, steward_entity, status, submission_date, reviewed_at
            FROM pending_registrations
           ORDER BY submission_date DESC
           LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((row) => ({
    id: Number(row.id),
    stewardName: String(row.steward_name ?? ""),
    stewardEntity: String(row.steward_entity ?? ""),
    status: String(row.status ?? "pending").toUpperCase(),
    submission_date: String(row.submission_date ?? ""),
    reviewed_at: (row.reviewed_at as string) || null,
  }));
}

export async function getRegistrarRelationships(): Promise<
  RegistrarRelationship[]
> {
  const db = getDb();
  /* Aggregate count of agents this Registrar is responsible for —
     by agent type. Each row is one agent type; designation is the
     human-readable type label. */
  const r = await db.execute(
    `SELECT agent_type, COUNT(*) as n FROM agents GROUP BY agent_type ORDER BY n DESC`
  );
  return r.rows.map((row) => ({
    agentId: String(row.agent_type ?? ""),
    designation: String(row.agent_type ?? ""),
    count: Number(row.n ?? 0),
  }));
}

export async function getRegistrarTimeline(
  registrarId: string
): Promise<{ date: string; label: string }[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT event_type, description, created_at
            FROM events
           WHERE agent_id = ?
           ORDER BY created_at ASC`,
    args: [registrarId],
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
    REGISTRATION_CONFIRMED: "Registration confirmed",
    REGISTRATION_DECLINED: "Registration declined",
    REGISTRAR_DECISION: "Registrar decision rendered",
  };
  if (map[eventType]) return map[eventType];
  if (description) return description.slice(0, 80);
  return eventType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
