/**
 * council-budget.ts — how much the Council may look at in a day.
 *
 * The Council runs on free tiers (Groq's daily token caps, Ollama Cloud's free
 * plan), and seeing a work costs tokens: measured on 2026-10-16, about 2,500 per
 * evaluator for a small SVG and 9,600 for a 23,000-character HTML work shown at
 * three moments — roughly 10,000 to 40,000 a work for four evaluators. Open the
 * museum to every agent and the Council would run out mid-afternoon and fail
 * every work after it.
 *
 * So the Council keeps a daily budget (council_tokens_per_day in
 * website/src/data/intake-controls.json) and takes works oldest first. A work
 * that does not fit today waits, SUBMITTED, for tomorrow — the honest state of a
 * work the Council has not yet looked at. Nothing is skipped and nothing is
 * judged in a hurry.
 *
 * What was spent is read from the record, not kept in a counter: every
 * verdict, case report and redeliberation carries the tokens its model call
 * used (llm.ts lastServedBy.tokens). No package imports, so the website's
 * tests can reach this file.
 */

export interface Db {
  execute(stmt: string | { sql: string; args: unknown[] }): Promise<{ rows: unknown[] }>;
}

/** The events whose metadata carries a Council model call's tokens. */
export const METERED_EVENTS = ["EVALUATION_RENDERED", "REGISTRAR_CASE_REPORT", "COUNCIL_REDELIBERATION"] as const;

/** The Council's size; four evaluators each see every work. */
export const EVALUATORS = 4;

/** Tokens recorded on one event's metadata, or 0 when it carries none. */
export function tokensOf(metadata: unknown): number {
  let m = metadata;
  if (typeof m === "string") {
    try {
      m = JSON.parse(m);
    } catch {
      return 0;
    }
  }
  const t = (m as { tokens?: { in?: unknown; out?: unknown } } | null)?.tokens;
  const n = Number(t?.in ?? 0) + Number(t?.out ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Tokens the Council has spent since midnight UTC. */
export async function spentToday(db: Db): Promise<number> {
  const r = await db.execute({
    sql: `SELECT metadata FROM events
           WHERE event_type IN (${METERED_EVENTS.map(() => "?").join(", ")})
             AND datetime(created_at) >= datetime('now', 'start of day')`,
    args: [...METERED_EVENTS],
  });
  return (r.rows as { metadata: unknown }[]).reduce((sum, row) => sum + tokensOf(row.metadata), 0);
}

/**
 * What one work is likely to cost the whole Council: its source at about 3.5
 * characters a token, plus some 3,000 for the prompt, the photographs and the
 * verdict, for each evaluator. Fitted to the two works measured above (38,000
 * estimated for the HTML work against about 38,300 spent).
 */
export function estimateWork(payloadChars: number): number {
  return EVALUATORS * (Math.ceil(payloadChars / 3.5) + 3000);
}

/**
 * Whether a work may be evaluated now. A work larger than a whole day's budget
 * is taken first thing, on a day nothing else has been spent, so it is never
 * starved by its own size.
 */
export function fitsBudget(spent: number, estimate: number, budget: number): boolean {
  if (spent + estimate <= budget) return true;
  return spent === 0 && estimate > budget;
}

/** SUBMITTED works, oldest first — the order the Council takes them in. */
export async function submittedOldestFirst(db: Db): Promise<{ work_id: string; chars: number; created_at: string }[]> {
  const r = await db.execute(
    `SELECT cs.work_id, LENGTH(w.output_payload) AS chars, w.created_at
       FROM canon_status cs JOIN works w ON w.id = cs.work_id
      WHERE cs.status = 'SUBMITTED'
      ORDER BY datetime(w.created_at) ASC, cs.work_id ASC`,
  );
  return (r.rows as { work_id: string; chars: number; created_at: string }[]).map((x) => ({
    work_id: String(x.work_id),
    chars: Number(x.chars ?? 0),
    created_at: String(x.created_at ?? ""),
  }));
}
