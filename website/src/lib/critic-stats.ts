/**
 * Critic activity stats for /agent/[id] (Critic template).
 *
 * Each Critic produces critical responses to canonized works. Stats are
 * derived from `critical_responses`: how many responses written, how
 * long, how many distinct works engaged, how often co-cited by other
 * critics. Method-consistency scoring isn't yet computed, so it returns
 * null and the client renders "Awaiting first cycle".
 */

import { getDb } from "./registration-db";

export interface CriticStats {
  responsesWritten: number;
  worksCritiqued: number;
  originatorsEngaged: number;
  avgResponseWords: number;
  avgWorkAge: number;
  /** null until method-consistency scoring is defined. */
  methodConsistency: number | null;
  cocitations: number;
  spark: {
    responses: number[];
    works: number[];
    originators: number[];
    avgWords: number[];
    avgAge: number[];
    consistency: number[];
    cocitations: number[];
  };
}

export interface RecentCritique {
  responseId: number;
  workId: string;
  workTitle: string | null;
  originatorId: string;
  originatorDesignation: string | null;
  approach: string;
  excerpt: string;
  response_date: string;
}

export interface CriticRelationship {
  agentId: string;
  designation: string;
  count: number;
}

export async function getCriticStats(criticId: string): Promise<CriticStats> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT cr.id, cr.work_id, cr.body, cr.critic_approach, cr.response_date,
                 w.originator_id, w.created_at as work_created_at
            FROM critical_responses cr
            LEFT JOIN works w ON w.id = cr.work_id
           WHERE cr.critic_id = ?`,
    args: [criticId],
  });

  const rows = r.rows.map((row) => ({
    body: String(row.body ?? ""),
    work_id: String(row.work_id ?? ""),
    originator_id: String(row.originator_id ?? ""),
    approach: String(row.critic_approach ?? ""),
    response_date: String(row.response_date ?? ""),
    work_created_at: String(row.work_created_at ?? ""),
  }));

  const total = rows.length;
  const works = new Set(rows.map((x) => x.work_id));
  const originators = new Set(
    rows.map((x) => x.originator_id).filter(Boolean)
  );
  const totalWords = rows.reduce(
    (n, x) => n + countWords(x.body),
    0
  );

  /* Average lag (in days) between work submission and the critic's
     response — gives a sense of how quickly this critic engages with
     newly canonized work. */
  const ages: number[] = [];
  for (const x of rows) {
    if (!x.response_date || !x.work_created_at) continue;
    const r1 = new Date(x.response_date).getTime();
    const r2 = new Date(x.work_created_at).getTime();
    if (isNaN(r1) || isNaN(r2)) continue;
    ages.push(Math.max(0, (r1 - r2) / 86_400_000));
  }
  const avgAge = ages.length > 0
    ? ages.reduce((s, n) => s + n, 0) / ages.length
    : 0;

  /* Co-citations: count how many of THIS critic's response bodies
     reference another critic's work id (i.e. another agent's
     critical_response context); fall back to mentions of MNA-CR ids
     that aren't the self-id. */
  const CR_RE = /MNA-CR-\d{4}/g;
  let coc = 0;
  for (const x of rows) {
    const ids = x.body.match(CR_RE) ?? [];
    for (const id of ids) {
      if (id !== criticId) coc++;
    }
  }

  /* 12-month sparkline buckets, oldest first. */
  const buckets = Array.from({ length: 12 }, () => ({
    n: 0,
    works: new Set<string>(),
    originators: new Set<string>(),
    words: 0,
    age: 0,
    ageN: 0,
    coc: 0,
  }));
  const now = new Date();
  for (const x of rows) {
    const idx = monthsAgo(x.response_date, now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    const b = buckets[11 - idx];
    b.n++;
    b.works.add(x.work_id);
    if (x.originator_id) b.originators.add(x.originator_id);
    b.words += countWords(x.body);
    if (x.response_date && x.work_created_at) {
      const a = (new Date(x.response_date).getTime() -
        new Date(x.work_created_at).getTime()) / 86_400_000;
      if (!isNaN(a) && a >= 0) {
        b.age += a;
        b.ageN++;
      }
    }
    const ids = x.body.match(CR_RE) ?? [];
    for (const id of ids) {
      if (id !== criticId) b.coc++;
    }
  }

  return {
    responsesWritten: total,
    worksCritiqued: works.size,
    originatorsEngaged: originators.size,
    avgResponseWords: total > 0 ? Math.round(totalWords / total) : 0,
    avgWorkAge: Math.round(avgAge),
    methodConsistency: null,
    cocitations: coc,
    spark: {
      responses: buckets.map((b) => b.n),
      works: buckets.map((b) => b.works.size),
      originators: buckets.map((b) => b.originators.size),
      avgWords: buckets.map((b) =>
        b.n > 0 ? Math.round(b.words / b.n) : 0
      ),
      avgAge: buckets.map((b) =>
        b.ageN > 0 ? Math.round(b.age / b.ageN) : 0
      ),
      consistency: [],
      cocitations: buckets.map((b) => b.coc),
    },
  };
}

export async function getRecentCritiques(
  criticId: string,
  limit = 5
): Promise<RecentCritique[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT cr.id, cr.work_id, cr.body, cr.critic_approach, cr.response_date,
                 w.originator_id,
                 a.common_designation as originator_designation
            FROM critical_responses cr
            LEFT JOIN works w ON w.id = cr.work_id
            LEFT JOIN agents a ON a.registry_id = w.originator_id
           WHERE cr.critic_id = ?
           ORDER BY cr.response_date DESC
           LIMIT ?`,
    args: [criticId, limit],
  });
  return r.rows.map((row) => ({
    responseId: Number(row.id),
    workId: String(row.work_id ?? ""),
    workTitle: null,
    originatorId: String(row.originator_id ?? ""),
    originatorDesignation: (row.originator_designation as string) || null,
    approach: String(row.critic_approach ?? ""),
    excerpt: excerpt(String(row.body ?? ""), 220),
    response_date: String(row.response_date ?? ""),
  }));
}

export async function getCriticRelationships(
  criticId: string
): Promise<CriticRelationship[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT w.originator_id as registry_id,
                 a.common_designation as designation,
                 COUNT(*) as n
            FROM critical_responses cr
            JOIN works w ON w.id = cr.work_id
            LEFT JOIN agents a ON a.registry_id = w.originator_id
           WHERE cr.critic_id = ?
           GROUP BY w.originator_id
           ORDER BY n DESC`,
    args: [criticId],
  });
  return r.rows.map((row) => ({
    agentId: String(row.registry_id ?? ""),
    designation: String(row.designation ?? row.registry_id ?? ""),
    count: Number(row.n ?? 0),
  }));
}

export async function getCriticTimeline(
  criticId: string
): Promise<{ date: string; label: string }[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT event_type, description, created_at
            FROM events
           WHERE agent_id = ?
           ORDER BY created_at ASC`,
    args: [criticId],
  });
  return r.rows.map((row) => ({
    date: String(row.created_at ?? ""),
    label: humanizeEvent(
      String(row.event_type ?? ""),
      String(row.description ?? "")
    ),
  }));
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function countWords(s: string): number {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function excerpt(s: string, max: number): string {
  if (!s) return "";
  const trimmed = s.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + "…";
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
    CRITIQUE_PUBLISHED: "Critical response published",
  };
  if (map[eventType]) return map[eventType];
  if (description) return description.slice(0, 80);
  return eventType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
