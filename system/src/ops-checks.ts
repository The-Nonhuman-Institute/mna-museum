/**
 * The decidable parts of the operations round, apart from the round.
 *
 * ops-round.ts runs a round when it is loaded, so nothing in it can be imported
 * by a test. What a check decides — which preview is settled, which review has
 * stalled, which failure is worth a retry — lives here, and the round keeps the
 * I/O and the recording. MNA-OPS-001 §III asks for a test that fails without the
 * change; this is where those tests can reach.
 */

/**
 * The one method these checks use, described by shape. Importing the type from
 * @libsql/client would resolve from system/, and CI installs only website/'s
 * dependencies — the typecheck failed there on exactly that (8a8cc0f).
 */
export interface Executes {
  execute(stmt: string): Promise<{ rows: unknown[] }>;
}

/** Minutes since a Turso timestamp ("YYYY-MM-DD HH:MM:SS", UTC) or an ISO string. */
export function minutesSince(iso: string, now = Date.now()): number {
  const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (now - t) / 60000;
}

/* ─── a connection the server already closed ────────────────────────────── */

export const STALE_SOCKET = /socket hang up|EPIPE|ECONNRESET/;

/**
 * Retry a request once when it dies on a connection the server already closed.
 *
 * A2's Pillow pass runs through execFileSync and holds the event loop for about
 * a minute. Turso closes the idle keep-alive connection meanwhile, Node cannot
 * notice while blocked, and the next request — A5's — is written into a dead
 * socket. That was "A5 — check itself failed" from 2026-09-30, when the
 * collection grew past the point where A2 outlasts the idle timeout; it
 * reproduces with execFileSync("sleep", ["75"]) between two queries, and the
 * second attempt always succeeds on a fresh connection.
 *
 * Safe to repeat only because every statement the round sends to Turso is a
 * read. Do not wrap a client that writes.
 */
export function retryOnStaleSocket<T extends Executes>(db: T): T {
  const execute = db.execute.bind(db) as (...a: unknown[]) => Promise<unknown>;
  db.execute = (async (...args: unknown[]) => {
    try {
      return await execute(...args);
    } catch (e) {
      if (!STALE_SOCKET.test(e instanceof Error ? e.message : String(e))) throw e;
      return execute(...args);
    }
  }) as T["execute"];
  return db;
}

/* ─── A2: previews the steward has already looked at ────────────────────── */

export interface ReviewedEntry {
  colours?: number;
  reviewed: string;
  reason: string;
}

export type Reviewed = Record<string, ReviewedEntry>;

export interface PreviewCount {
  id: string;
  output_type: string;
  /** Distinct colours in the preview; negative when it could not be read. */
  colours: number;
}

/** Fewer than this many colours is a blank frame — one colour, or ink on ground. */
export const BLANK_BELOW = 3;

/**
 * Split near-blank previews into those the steward settled and those still owed
 * a look.
 *
 * Settled only while the preview is the one the steward saw: an entry records
 * the colour count, and a re-render that changes it escalates again.
 */
export function classifyBlankPreviews(
  previews: PreviewCount[],
  settled: Reviewed,
): { known: string[]; suspicious: string[] } {
  const known: string[] = [];
  const suspicious: string[] = [];
  for (const p of previews) {
    if (p.colours < 0 || p.colours >= BLANK_BELOW) continue;
    const line = `${p.id} (${p.output_type}, ${p.colours} colour${p.colours === 1 ? "" : "s"})`;
    if (settled[p.id]?.colours === p.colours) known.push(line);
    else suspicious.push(line);
  }
  return { known, suspicious };
}

/** Findings the steward has settled for one check, keyed by work id. */
export function reviewedFor(file: unknown, check: string): Reviewed {
  if (!file || typeof file !== "object") return {};
  const forCheck = (file as Record<string, unknown>)[check];
  return forCheck && typeof forCheck === "object" ? (forCheck as Reviewed) : {};
}

/* ─── B3: works stalled in review ──────────────────────────────────────── */

export const STALLED_AFTER_MINUTES = 24 * 60;

export interface StalledReview {
  work_id: string;
  verdicts: number;
}

/**
 * Works IN_REVIEW with no new verdict for over a day.
 *
 * The evaluator marks a work IN_REVIEW before its first call, so an evaluation
 * that dies mid-flight leaves it where B1 and B2, which read only SUBMITTED,
 * cannot see it. Measured from the latest verdict, or from the work if it has
 * none. A 2:2 deadlock is also IN_REVIEW and waits on the Registrar; a day is
 * long enough for either.
 */
export async function findStalledReviews(db: Executes, now = Date.now()): Promise<{
  inReview: number;
  stalled: StalledReview[];
}> {
  const r = await db.execute(`
    SELECT cs.work_id, w.created_at, COUNT(e.id) AS verdicts, MAX(e.evaluation_date) AS last_verdict
      FROM canon_status cs
      JOIN works w ON w.id = cs.work_id
      LEFT JOIN evaluations e ON e.work_id = cs.work_id
     WHERE cs.status = 'IN_REVIEW'
     GROUP BY cs.work_id
     ORDER BY cs.work_id`);
  const rows = r.rows as unknown as {
    work_id: string;
    created_at: string;
    verdicts: number;
    last_verdict: string | null;
  }[];
  return {
    inReview: rows.length,
    stalled: rows
      .filter((x) => minutesSince(x.last_verdict ?? x.created_at, now) > STALLED_AFTER_MINUTES)
      .map((x) => ({ work_id: x.work_id, verdicts: Number(x.verdicts) })),
  };
}
