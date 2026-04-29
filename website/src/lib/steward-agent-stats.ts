/**
 * Steward Agent activity stats for /agent/[id] (Steward Agent template).
 *
 * The Steward Agent reviews other agents' outputs, records compliance
 * audits, and maintains governance documents on the steward's behalf.
 * Real activity comes from `governance_documents`, `events` filtered to
 * stewardship events, and `institutional_notices`.
 */

import { getDb } from "./registration-db";

export interface StewardAgentStats {
  governanceDocumentsAuthored: number;
  reviewsLogged: number;
  auditsRecorded: number;
  noticesIssued: number;
  /** null until override tracking ships. */
  stewardOverrides: number | null;
  /** null until compliance scoring is defined. */
  complianceCoverage: number | null;
  daysOfActiveStewardship: number;
  spark: {
    governance: number[];
    reviews: number[];
    audits: number[];
    notices: number[];
    overrides: number[];
    coverage: number[];
    stewardship: number[];
  };
}

export interface RecentStewardshipAct {
  kind: string;
  recordId: string;
  subject: string;
  detail: string;
  acted_at: string;
  href: string;
}

export interface GovernanceDoc {
  id: number;
  title: string;
  version: string;
  status: string;
  ratified_at: string | null;
}

export interface StewardRelationship {
  agentId: string;
  designation: string;
  count: number;
}

export async function getStewardAgentStats(
  stewardId: string
): Promise<StewardAgentStats> {
  const db = getDb();
  const [govRes, evRes, ntRes] = await Promise.all([
    db.execute(`SELECT id, drafted_at FROM governance_documents`),
    db.execute({
      sql: `SELECT event_type, created_at FROM events WHERE agent_id = ?`,
      args: [stewardId],
    }),
    db.execute({
      sql: `SELECT id, issued_at FROM institutional_notices WHERE issued_by = ?`,
      args: [stewardId],
    }),
  ]);

  const reviews = evRes.rows.filter((row) =>
    String(row.event_type ?? "").includes("REVIEW")
  ).length;
  const audits = evRes.rows.filter((row) =>
    String(row.event_type ?? "").includes("AUDIT")
  ).length;

  /* Days of active stewardship: from earliest stewardship event to now. */
  const allDates = [
    ...evRes.rows.map((row) => String(row.created_at ?? "")),
    ...ntRes.rows.map((row) => String(row.issued_at ?? "")),
    ...govRes.rows.map((row) => String(row.drafted_at ?? "")),
  ]
    .filter(Boolean)
    .map((s) => new Date(s).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);
  const daysActive =
    allDates.length > 0
      ? Math.max(0, Math.floor((Date.now() - allDates[0]) / 86_400_000))
      : 0;

  const buckets = Array.from({ length: 12 }, () => ({
    g: 0,
    r: 0,
    a: 0,
    n: 0,
  }));
  const now = new Date();
  for (const row of govRes.rows) {
    const idx = monthsAgo(String(row.drafted_at ?? ""), now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    buckets[11 - idx].g++;
  }
  for (const row of evRes.rows) {
    const idx = monthsAgo(String(row.created_at ?? ""), now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    const t = String(row.event_type ?? "");
    if (t.includes("REVIEW")) buckets[11 - idx].r++;
    if (t.includes("AUDIT")) buckets[11 - idx].a++;
  }
  for (const row of ntRes.rows) {
    const idx = monthsAgo(String(row.issued_at ?? ""), now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    buckets[11 - idx].n++;
  }

  return {
    governanceDocumentsAuthored: govRes.rows.length,
    reviewsLogged: reviews,
    auditsRecorded: audits,
    noticesIssued: ntRes.rows.length,
    stewardOverrides: null,
    complianceCoverage: null,
    daysOfActiveStewardship: daysActive,
    spark: {
      governance: buckets.map((b) => b.g),
      reviews: buckets.map((b) => b.r),
      audits: buckets.map((b) => b.a),
      notices: buckets.map((b) => b.n),
      overrides: [],
      coverage: [],
      stewardship: buckets.map((b) => (b.g + b.r + b.a + b.n > 0 ? 1 : 0)),
    },
  };
}

export async function getRecentStewardshipActs(
  stewardId: string,
  limit = 5
): Promise<RecentStewardshipAct[]> {
  const db = getDb();
  const [govRes, evRes, ntRes] = await Promise.all([
    db.execute(
      `SELECT id, title, version, status, drafted_at FROM governance_documents ORDER BY drafted_at DESC LIMIT ${limit}`
    ),
    db.execute({
      sql: `SELECT id, event_type, description, created_at FROM events WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`,
      args: [stewardId, limit],
    }),
    db.execute({
      sql: `SELECT id, subject, agent_id, issued_at FROM institutional_notices WHERE issued_by = ? ORDER BY issued_at DESC LIMIT ?`,
      args: [stewardId, limit],
    }),
  ]);

  const acts: RecentStewardshipAct[] = [];
  for (const row of govRes.rows) {
    acts.push({
      kind: "GOVERNANCE",
      recordId: `gov-${row.id}`,
      subject: String(row.title ?? "Untitled document"),
      detail: `Governance document v${row.version} — ${row.status}`,
      acted_at: String(row.drafted_at ?? ""),
      href: `/governance/${row.id}`,
    });
  }
  for (const row of evRes.rows) {
    acts.push({
      kind: "EVENT",
      recordId: `ev-${row.id}`,
      subject: String(row.event_type ?? ""),
      detail: String(row.description ?? "").slice(0, 120),
      acted_at: String(row.created_at ?? ""),
      href: "/governance",
    });
  }
  for (const row of ntRes.rows) {
    acts.push({
      kind: "NOTICE",
      recordId: `nt-${row.id}`,
      subject: String(row.subject ?? "Untitled notice"),
      detail: `Notice issued to ${row.agent_id}`,
      acted_at: String(row.issued_at ?? ""),
      href: `/agent/${row.agent_id}`,
    });
  }

  return acts
    .sort((a, b) => b.acted_at.localeCompare(a.acted_at))
    .slice(0, limit);
}

export async function getGovernanceDocs(): Promise<GovernanceDoc[]> {
  const db = getDb();
  const r = await db.execute(
    `SELECT id, title, version, status, ratified_at FROM governance_documents ORDER BY drafted_at DESC`
  );
  return r.rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title ?? ""),
    version: String(row.version ?? "1.0"),
    status: String(row.status ?? "draft").toUpperCase(),
    ratified_at: (row.ratified_at as string) || null,
  }));
}

export async function getStewardRelationships(
  stewardId: string
): Promise<StewardRelationship[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT n.agent_id as registry_id,
                 a.common_designation,
                 COUNT(*) as cnt
            FROM institutional_notices n
            LEFT JOIN agents a ON a.registry_id = n.agent_id
           WHERE n.issued_by = ?
           GROUP BY n.agent_id
           ORDER BY cnt DESC`,
    args: [stewardId],
  });
  return r.rows.map((row) => ({
    agentId: String(row.registry_id ?? ""),
    designation: String(row.common_designation ?? row.registry_id ?? ""),
    count: Number(row.cnt ?? 0),
  }));
}

export async function getStewardTimeline(
  stewardId: string
): Promise<{ date: string; label: string }[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT event_type, description, created_at
            FROM events
           WHERE agent_id = ?
           ORDER BY created_at ASC`,
    args: [stewardId],
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
    GOVERNANCE_DOCUMENT_DRAFTED: "Governance document drafted",
    REVIEW_LOGGED: "Constitutional review logged",
    AUDIT_RECORDED: "Compliance audit recorded",
  };
  if (map[eventType]) return map[eventType];
  if (description) return description.slice(0, 80);
  return eventType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
