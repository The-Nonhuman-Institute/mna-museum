/**
 * Evaluator activity stats for /agent/[id] (Evaluator template).
 *
 * All numbers come from real DB rows. The seven hero stats and their
 * sparklines are derived from `evaluations`; recent evaluations join
 * `works` and `agents`; citation activity is parsed from rationale text
 * via regex (option b — no schema change).
 */

import { getDb } from "./registration-db";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface EvaluatorStats {
  evaluationsRendered: number;
  canonRate: number;
  inReviewRate: number;
  rejectedRate: number;
  agreementWithCouncil: number;
  formalDissents: number;
  avgRationaleWords: number;
  /** 12-month buckets, oldest first. Each entry is the value for that
   *  month; values are normalized for sparkline rendering at the call
   *  site. Length is always 12 (zero-filled where we have no data). */
  spark: {
    evaluations: number[];
    canonRate: number[];
    inReviewRate: number[];
    rejectedRate: number[];
    agreementWithCouncil: number[];
    formalDissents: number[];
    avgRationaleWords: number[];
  };
}

export interface RecentEvaluation {
  work_id: string;
  originator_id: string;
  originator_designation: string | null;
  work_title: string | null;
  verdict: string;
  is_dissent: boolean;
  evaluation_date: string;
  rationale_excerpt: string;
}

export interface CitationActivity {
  citationsMade: number;
  citationsReceived: number;
  topCitedWorks: { workId: string; count: number; title: string | null }[];
}

/* ─── Stats ────────────────────────────────────────────────────────────── */

export async function getEvaluatorStats(
  evaluatorId: string
): Promise<EvaluatorStats> {
  const db = getDb();

  /* Pull all this evaluator's rows in one go; bucket and aggregate in JS
     since we need both totals and per-month series, and the tables are
     small enough that a single pull is cheaper than five queries. */
  const rowsResult = await db.execute({
    sql: `SELECT work_id, verdict, rationale, is_dissent, evaluation_date
            FROM evaluations
           WHERE evaluator_id = ?`,
    args: [evaluatorId],
  });
  const rows = rowsResult.rows.map((r) => ({
    work_id: r.work_id as string,
    verdict: String(r.verdict ?? ""),
    rationale: String(r.rationale ?? ""),
    is_dissent: Number(r.is_dissent ?? 0) === 1,
    evaluation_date: String(r.evaluation_date ?? ""),
  }));

  const total = rows.length;
  const canonCount = rows.filter((r) => r.verdict === "CANON").length;
  const rejCount = rows.filter((r) => r.verdict === "REJECTED").length;
  const irCount = rows.filter(
    (r) => r.verdict === "IN_REVIEW" || r.verdict === "IN REVIEW"
  ).length;
  const dissentCount = rows.filter((r) => r.is_dissent).length;
  const totalWords = rows.reduce(
    (n, r) => n + countWords(r.rationale),
    0
  );

  /* Agreement with Council = share of this evaluator's verdicts that match
     the council majority for the same work. Council majority is computed
     across all evaluations on each work. */
  const allVerdictsByWork = await getAllVerdictsByWork();
  let agree = 0;
  let agreeDenom = 0;
  for (const r of rows) {
    const others = allVerdictsByWork.get(r.work_id) ?? [];
    const counts: Record<string, number> = {};
    for (const v of others) counts[v] = (counts[v] ?? 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!top) continue;
    agreeDenom++;
    if (top[0] === r.verdict) agree++;
  }
  const agreement = agreeDenom > 0 ? agree / agreeDenom : 0;

  /* Sparklines — last 12 months, oldest first. */
  const buckets = Array.from({ length: 12 }, () => ({
    n: 0,
    canon: 0,
    rej: 0,
    ir: 0,
    dissent: 0,
    words: 0,
    agree: 0,
    agreeDenom: 0,
  }));
  const now = new Date();
  for (const r of rows) {
    const idx = monthsAgo(r.evaluation_date, now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    const b = buckets[11 - idx]; // oldest first
    b.n++;
    if (r.verdict === "CANON") b.canon++;
    if (r.verdict === "REJECTED") b.rej++;
    if (r.verdict === "IN_REVIEW" || r.verdict === "IN REVIEW") b.ir++;
    if (r.is_dissent) b.dissent++;
    b.words += countWords(r.rationale);

    const others = allVerdictsByWork.get(r.work_id) ?? [];
    const counts: Record<string, number> = {};
    for (const v of others) counts[v] = (counts[v] ?? 0) + 1;
    const top = Object.entries(counts).sort((a, b2) => b2[1] - a[1])[0];
    if (top) {
      b.agreeDenom++;
      if (top[0] === r.verdict) b.agree++;
    }
  }

  return {
    evaluationsRendered: total,
    canonRate: total > 0 ? canonCount / total : 0,
    inReviewRate: total > 0 ? irCount / total : 0,
    rejectedRate: total > 0 ? rejCount / total : 0,
    agreementWithCouncil: agreement,
    formalDissents: dissentCount,
    avgRationaleWords: total > 0 ? Math.round(totalWords / total) : 0,
    spark: {
      evaluations: buckets.map((b) => b.n),
      canonRate: buckets.map((b) => (b.n > 0 ? b.canon / b.n : 0)),
      inReviewRate: buckets.map((b) => (b.n > 0 ? b.ir / b.n : 0)),
      rejectedRate: buckets.map((b) => (b.n > 0 ? b.rej / b.n : 0)),
      agreementWithCouncil: buckets.map((b) =>
        b.agreeDenom > 0 ? b.agree / b.agreeDenom : 0
      ),
      formalDissents: buckets.map((b) => b.dissent),
      avgRationaleWords: buckets.map((b) =>
        b.n > 0 ? Math.round(b.words / b.n) : 0
      ),
    },
  };
}

/* ─── Recent evaluations ───────────────────────────────────────────────── */

export async function getRecentEvaluations(
  evaluatorId: string,
  limit = 4
): Promise<RecentEvaluation[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT e.work_id, e.verdict, e.rationale, e.is_dissent, e.evaluation_date,
                 w.originator_id,
                 a.common_designation AS originator_designation
            FROM evaluations e
            LEFT JOIN works w     ON w.id = e.work_id
            LEFT JOIN agents a    ON a.registry_id = w.originator_id
           WHERE e.evaluator_id = ?
           ORDER BY e.evaluation_date DESC
           LIMIT ?`,
    args: [evaluatorId, limit],
  });
  return r.rows.map((row) => ({
    work_id: String(row.work_id),
    originator_id: String(row.originator_id ?? ""),
    originator_designation: (row.originator_designation as string) || null,
    work_title: null, // titles live in a separate table or are absent
    verdict: String(row.verdict),
    is_dissent: Number(row.is_dissent ?? 0) === 1,
    evaluation_date: String(row.evaluation_date ?? ""),
    rationale_excerpt: excerpt(String(row.rationale ?? ""), 220),
  }));
}

/* ─── Citation activity (option b: regex-extracted from rationale text) ── */

const CITATION_RE = /MNA-OR-\d{4}-W-\d{4}/g;
const EVALUATOR_RE = /MNA-EV-\d{4}/g;

export async function getCitationActivity(
  evaluatorId: string
): Promise<CitationActivity> {
  const db = getDb();

  /* Citations made: this evaluator's rationales referencing canonical work
     ids. */
  const made = await db.execute({
    sql: `SELECT rationale FROM evaluations WHERE evaluator_id = ?`,
    args: [evaluatorId],
  });
  const cited: Record<string, number> = {};
  let madeTotal = 0;
  for (const row of made.rows) {
    const text = String(row.rationale ?? "");
    const matches = text.match(CITATION_RE) ?? [];
    for (const m of matches) {
      cited[m] = (cited[m] ?? 0) + 1;
      madeTotal++;
    }
  }

  /* Citations received: how many other agents' rationales mention this
     evaluator's id in their text. We count unique rationales (not raw
     mentions) so a single dissent paragraph that names the agent twice
     still reads as one referencing record. */
  const received = await db.execute({
    sql: `SELECT rationale FROM evaluations WHERE evaluator_id != ? AND rationale LIKE ?`,
    args: [evaluatorId, `%${evaluatorId}%`],
  });
  let receivedCount = 0;
  for (const row of received.rows) {
    const text = String(row.rationale ?? "");
    const ids: string[] = text.match(EVALUATOR_RE) ?? [];
    if (ids.includes(evaluatorId)) receivedCount++;
  }

  const top = Object.entries(cited)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([workId, count]) => ({ workId, count, title: null as string | null }));

  return {
    citationsMade: madeTotal,
    citationsReceived: receivedCount,
    topCitedWorks: top,
  };
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

let _allVerdictsByWork: Map<string, string[]> | null = null;
let _allVerdictsAt = 0;
async function getAllVerdictsByWork(): Promise<Map<string, string[]>> {
  /* Cache for 60s — per-request scope is enough for one render and saves
     us recomputing the same table across the seven sparkline series. */
  const now = Date.now();
  if (_allVerdictsByWork && now - _allVerdictsAt < 60_000) {
    return _allVerdictsByWork;
  }
  const db = getDb();
  const r = await db.execute("SELECT work_id, verdict FROM evaluations");
  const m = new Map<string, string[]>();
  for (const row of r.rows) {
    const wid = String(row.work_id);
    const list = m.get(wid) ?? [];
    list.push(String(row.verdict ?? ""));
    m.set(wid, list);
  }
  _allVerdictsByWork = m;
  _allVerdictsAt = now;
  return m;
}

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
