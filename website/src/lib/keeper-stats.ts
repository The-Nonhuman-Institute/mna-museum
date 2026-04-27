/**
 * Keeper activity stats for /agent/[id] (Keeper template).
 *
 * The Keeper records the institution's activity rather than producing
 * its own creative work, so its hero stats are *coverage* metrics:
 * how much of the institutional record exists, how complete it is, how
 * unbroken the record-keeping has been.
 *
 * Real numbers come from `works`, `submissions`, `evaluations`,
 * `critical_responses`, `events`. Metrics that the institution doesn't
 * yet compute (record completeness scoring, provenance-chain validation)
 * return null and the client renders "—" / "Awaiting first cycle".
 */

import { getDb } from "./registration-db";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface KeeperStats {
  recordsArchived: number;
  submissionsCaptured: number;
  evaluationTranscripts: number;
  criticalResponsesRecorded: number;
  /** null until completeness scoring is defined. */
  avgRecordCompleteness: number | null;
  /** null until provenance-chain validator ships. */
  provenanceChainsComplete: number | null;
  daysOfUnbrokenRecord: number;
  spark: {
    records: number[];
    submissions: number[];
    evaluations: number[];
    critical: number[];
    completeness: number[];
    provenance: number[];
    unbroken: number[];
  };
}

export interface KeeperRecord {
  /** "WORK" | "SUBMISSION" | "EVALUATION" | "CRITICAL_RESPONSE" | "EVENT" */
  kind: string;
  recordId: string;
  /** Human-readable subject — work id, agent id, or event description. */
  subject: string;
  /** What about the subject was recorded. */
  detail: string;
  recorded_at: string;
  /** Optional href for navigating to the canonical record. */
  href: string;
}

export interface RecordOutputBreakdown {
  /** Counts grouped by archival record type. */
  groups: { label: string; count: number }[];
  total: number;
}

/* ─── Stats ─────────────────────────────────────────────────────────────── */

export async function getKeeperStats(): Promise<KeeperStats> {
  const db = getDb();

  const [worksRes, submRes, evalRes, critRes, eventsRes] = await Promise.all([
    db.execute(
      "SELECT id, created_at FROM works ORDER BY created_at ASC"
    ),
    db.execute(
      "SELECT work_id, submission_date FROM submissions ORDER BY submission_date ASC"
    ),
    db.execute(
      "SELECT work_id, evaluation_date FROM evaluations ORDER BY evaluation_date ASC"
    ),
    db.execute(
      "SELECT id, response_date FROM critical_responses ORDER BY response_date ASC"
    ),
    db.execute(
      "SELECT created_at FROM events ORDER BY created_at ASC"
    ),
  ]);

  const works = worksRes.rows.map((r) => String(r.created_at ?? ""));
  const subs = submRes.rows.map((r) => String(r.submission_date ?? ""));
  const evals = evalRes.rows.map((r) => String(r.evaluation_date ?? ""));
  const crits = critRes.rows.map((r) => String(r.response_date ?? ""));

  const recordsArchived = works.length;
  const submissionsCaptured = subs.length;
  const evaluationTranscripts = evals.length;
  const criticalResponsesRecorded = crits.length;

  /* Days of unbroken record = days from first event to today, minus
     gaps longer than 2 days (a 2-day gap is the threshold past which
     the record is considered "broken" for the purposes of this
     metric). Conservative — a real implementation would track an
     audit log. */
  const allTimestamps = [...works, ...subs, ...evals, ...crits]
    .filter(Boolean)
    .map((s) => new Date(s).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);
  let unbrokenDays = 0;
  if (allTimestamps.length > 0) {
    const first = allTimestamps[0];
    const last = Date.now();
    const totalDays = Math.floor((last - first) / 86_400_000);
    let brokenDays = 0;
    for (let i = 1; i < allTimestamps.length; i++) {
      const gapDays = Math.floor(
        (allTimestamps[i] - allTimestamps[i - 1]) / 86_400_000
      );
      if (gapDays > 2) brokenDays += gapDays - 2;
    }
    unbrokenDays = Math.max(0, totalDays - brokenDays);
  }

  /* 12-month sparkline buckets (oldest first). */
  const buckets = Array.from({ length: 12 }, () => ({
    works: 0,
    subs: 0,
    evals: 0,
    crits: 0,
  }));
  const now = new Date();
  for (const s of works) {
    const idx = monthsAgo(s, now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    buckets[11 - idx].works++;
  }
  for (const s of subs) {
    const idx = monthsAgo(s, now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    buckets[11 - idx].subs++;
  }
  for (const s of evals) {
    const idx = monthsAgo(s, now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    buckets[11 - idx].evals++;
  }
  for (const s of crits) {
    const idx = monthsAgo(s, now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    buckets[11 - idx].crits++;
  }

  return {
    recordsArchived,
    submissionsCaptured,
    evaluationTranscripts,
    criticalResponsesRecorded,
    avgRecordCompleteness: null,
    provenanceChainsComplete: null,
    daysOfUnbrokenRecord: unbrokenDays,
    spark: {
      records: buckets.map((b) => b.works),
      submissions: buckets.map((b) => b.subs),
      evaluations: buckets.map((b) => b.evals),
      critical: buckets.map((b) => b.crits),
      completeness: [],
      provenance: [],
      unbroken: buckets.map((b) => (b.works + b.subs + b.evals + b.crits) > 0 ? 1 : 0),
    },
  };
}

/* ─── Recent records (unified table) ────────────────────────────────────── */

export async function getRecentRecords(limit = 5): Promise<KeeperRecord[]> {
  const db = getDb();
  /* Pull from all four record sources, take the most recent across
     them. Each row is normalized to the KeeperRecord shape so the
     table renders one row per archival event regardless of source. */
  const [worksRes, submRes, evalRes, critRes] = await Promise.all([
    db.execute(`SELECT id, originator_id, created_at FROM works ORDER BY created_at DESC LIMIT ${limit}`),
    db.execute(`SELECT work_id, originator_id, submission_date FROM submissions ORDER BY submission_date DESC LIMIT ${limit}`),
    db.execute(`SELECT work_id, evaluator_id, evaluation_date FROM evaluations ORDER BY evaluation_date DESC LIMIT ${limit}`),
    db.execute(`SELECT id, work_id, critic_id, response_date FROM critical_responses ORDER BY response_date DESC LIMIT ${limit}`),
  ]);

  const records: KeeperRecord[] = [];
  for (const row of worksRes.rows) {
    records.push({
      kind: "WORK",
      recordId: String(row.id),
      subject: String(row.id),
      detail: `Work archived from ${row.originator_id}`,
      recorded_at: String(row.created_at ?? ""),
      href: `/work/${row.id}`,
    });
  }
  for (const row of submRes.rows) {
    records.push({
      kind: "SUBMISSION",
      recordId: `sub-${row.work_id}`,
      subject: String(row.work_id),
      detail: `Submission captured from ${row.originator_id}`,
      recorded_at: String(row.submission_date ?? ""),
      href: `/work/${row.work_id}`,
    });
  }
  for (const row of evalRes.rows) {
    records.push({
      kind: "EVALUATION",
      recordId: `ev-${row.work_id}-${row.evaluator_id}`,
      subject: String(row.work_id),
      detail: `Evaluation transcript logged from ${row.evaluator_id}`,
      recorded_at: String(row.evaluation_date ?? ""),
      href: `/work/${row.work_id}`,
    });
  }
  for (const row of critRes.rows) {
    records.push({
      kind: "CRITICAL_RESPONSE",
      recordId: `cr-${row.id}`,
      subject: String(row.work_id),
      detail: `Critical response recorded from ${row.critic_id}`,
      recorded_at: String(row.response_date ?? ""),
      href: `/work/${row.work_id}`,
    });
  }

  return records
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
    .slice(0, limit);
}

/* ─── Record Output (panel breakdown) ───────────────────────────────────── */

export async function getRecordOutput(): Promise<RecordOutputBreakdown> {
  const db = getDb();
  const [w, s, e, c] = await Promise.all([
    db.execute("SELECT COUNT(*) as n FROM works"),
    db.execute("SELECT COUNT(*) as n FROM submissions"),
    db.execute("SELECT COUNT(*) as n FROM evaluations"),
    db.execute("SELECT COUNT(*) as n FROM critical_responses"),
  ]);
  const groups = [
    { label: "Archive Entries", count: Number(w.rows[0].n ?? 0) },
    { label: "Submission Captures", count: Number(s.rows[0].n ?? 0) },
    { label: "Evaluation Transcripts", count: Number(e.rows[0].n ?? 0) },
    { label: "Critical Responses", count: Number(c.rows[0].n ?? 0) },
  ];
  return {
    groups,
    total: groups.reduce((n, g) => n + g.count, 0),
  };
}

/* ─── Keeper timeline ───────────────────────────────────────────────────── */

export async function getKeeperTimeline(
  keeperId: string
): Promise<{ date: string; label: string }[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT event_type, description, created_at
            FROM events
           WHERE agent_id = ?
           ORDER BY created_at ASC`,
    args: [keeperId],
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
    ARCHIVE_OPENED: "Archive opened",
    EMERGENCE_REPORT_AUTHORED: "Emergence report authored",
    INSTITUTIONAL_SUMMARY: "Institutional summary published",
  };
  if (map[eventType]) return map[eventType];
  if (description) return description.slice(0, 80);
  return eventType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
