/**
 * canonization-digest.ts — MNA-GOV-005 Phase 3 weekly digest worker.
 *
 * Per the protocol §4.1, `WORK_CANONIZED` is a high-frequency event
 * and the Ambassador should be consulted on a **weekly batch** rather
 * than per-canonization. The actual event type fired by the Council
 * is `CANON_DECISION` (covering CANON / REJECTED / IN_REVIEW); this
 * worker filters to outcome=CANON only.
 *
 * Cadence: weekly via GHA cron (memory-consolidate runs Sunday 06:00,
 * memory-edge-decay 07:00; this runs Sunday 08:00). The worker:
 *
 *   1. Reads its high-water mark (sentinel agent_id 'CANONIZATION_DIGEST').
 *   2. Finds CANON_DECISION events since the high-water with " CANON "
 *      in the description (a canonization, not a rejection).
 *   3. If ≥1 found, joins works + agents to build a structured digest
 *      and invokes consultAgent('ambassador', ...).
 *   4. publishConsultation handles ACT (post to Commons + optional
 *      subscriber fan-out) and DECLINE (CONSULTATION_DECLINED event).
 *   5. Updates the high-water to the max event id in the window.
 *
 * On first run, the high-water is initialized to MAX(events.id) so
 * historical canonizations are not retroactively digested.
 *
 *   npx tsx system/scripts/canonization-digest.ts --dry-run
 *   npx tsx system/scripts/canonization-digest.ts
 *   npx tsx system/scripts/canonization-digest.ts --since-id 510
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import {
  consultAgent,
  publishConsultation,
  type ConsultableEvent,
} from "../src/agent-consultation";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({
  path: path.join(__dirname, "..", "..", "website", ".env"),
  quiet: true,
});

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const sinceIdx = argv.indexOf("--since-id");
const sinceOverride =
  sinceIdx >= 0 && sinceIdx + 1 < argv.length
    ? Number(argv[sinceIdx + 1])
    : null;

const SENTINEL = "CANONIZATION_DIGEST";
// Description format from the Council: "WORK-ID: CANON (n canon, m rejected)"
const CANON_RE = /:\s*CANON\s*\(/;

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

async function getHighWater(): Promise<number | null> {
  const r = await db.execute({
    sql: `SELECT last_processed_event_id FROM memory_tick_state WHERE agent_id = ?`,
    args: [SENTINEL],
  });
  if (r.rows.length === 0) return null;
  return Number(
    (r.rows[0] as Record<string, unknown>).last_processed_event_id ?? 0,
  );
}

async function setHighWater(eventId: number): Promise<void> {
  await db.execute({
    sql: `INSERT INTO memory_tick_state (agent_id, last_processed_event_id, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(agent_id) DO UPDATE SET
            last_processed_event_id = excluded.last_processed_event_id,
            updated_at = excluded.updated_at`,
    args: [SENTINEL, eventId],
  });
}

async function currentMaxEventId(): Promise<number> {
  const r = await db.execute("SELECT MAX(id) AS max_id FROM events");
  return Number((r.rows[0] as Record<string, unknown>).max_id ?? 0);
}

interface Canonization {
  event_id: number;
  event_created_at: string;
  work_id: string;
  work_title: string | null;
  originator_id: string;
  originator_name: string;
  medium: string;
}

async function findCanonizations(sinceId: number): Promise<Canonization[]> {
  const r = await db.execute({
    sql: `SELECT e.id, e.created_at, e.work_id, e.description,
                 w.title, w.originator_id, w.medium,
                 a.common_designation
            FROM events e
            LEFT JOIN works w ON e.work_id = w.id
            LEFT JOIN agents a ON w.originator_id = a.registry_id
           WHERE e.id > ?
             AND e.event_type = 'CANON_DECISION'
           ORDER BY e.id ASC`,
    args: [sinceId],
  });
  const out: Canonization[] = [];
  for (const row of r.rows) {
    const x = row as Record<string, unknown>;
    const desc = String(x.description ?? "");
    if (!CANON_RE.test(desc)) continue; // not a canonization
    if (!x.work_id) continue;
    out.push({
      event_id: Number(x.id),
      event_created_at: String(x.created_at),
      work_id: String(x.work_id),
      work_title: (x.title as string | null) ?? null,
      originator_id: String(x.originator_id ?? ""),
      originator_name: (x.common_designation as string) ?? String(x.originator_id ?? ""),
      medium: String(x.medium ?? ""),
    });
  }
  return out;
}

(async () => {
  console.log(`canonization-digest${dryRun ? " (dry-run)" : ""}`);

  // High-water initialization on first run — establish baseline at
  // MAX(events.id) so historical canonizations are not retroactively
  // digested. Matches the consultations-tick pattern.
  let hw = sinceOverride ?? (await getHighWater());
  if (hw === null) {
    const max = await currentMaxEventId();
    console.log(`  first run: initializing high-water at event id ${max}`);
    if (!dryRun) {
      await setHighWater(max);
      await db.execute({
        sql: `INSERT INTO events (event_type, agent_id, description, metadata)
              VALUES (?, ?, ?, ?)`,
        args: [
          "CANONIZATION_DIGEST_INITIALIZED",
          "MNA-AM-0001",
          `canonization-digest initialized at event id ${max}. Future canonizations past this baseline will be batched into weekly Ambassador digests per MNA-GOV-005 Phase 3.`,
          JSON.stringify({ baseline_event_id: max, steward_authorized: true }),
        ],
      });
    }
    return;
  }

  console.log(`  high-water: ${hw}`);

  const canonizations = await findCanonizations(hw);
  console.log(`  canonizations since high-water: ${canonizations.length}`);
  if (canonizations.length === 0) {
    console.log("  nothing to digest. exiting.");
    return;
  }

  // List + new high-water (the max event id in the window).
  for (const c of canonizations) {
    console.log(
      `    ${c.event_id}  ${c.work_id}  "${c.work_title ?? "(untitled)"}"  ${c.originator_name}  [${c.medium}]`,
    );
  }
  const newHw = Math.max(...canonizations.map((c) => c.event_id));

  // Build a ConsultableEvent describing the batch. source_event_id is
  // the max event id in the window — that's the dedupe anchor and the
  // event the Ambassador's record will reference.
  const dateA = new Date(canonizations[0].event_created_at);
  const dateB = new Date(
    canonizations[canonizations.length - 1].event_created_at,
  );
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const windowLabel =
    fmt(dateA) === fmt(dateB) ? fmt(dateA) : `${fmt(dateA)}–${fmt(dateB)}`;

  const event: ConsultableEvent = {
    source_event_id: newHw,
    event_type: "WEEKLY_CANONIZATION_DIGEST",
    description: `Weekly canonization digest: ${canonizations.length} ${canonizations.length === 1 ? "work" : "works"} entered the canon during ${windowLabel}.`,
    metadata: {
      window_label: windowLabel,
      canonization_count: canonizations.length,
      canonizations: canonizations.map((c) => ({
        work_id: c.work_id,
        title: c.work_title,
        originator: c.originator_name,
        originator_id: c.originator_id,
        medium: c.medium,
      })),
    },
    acting_agent_id: null,
    ceremony_id: null,
    work_id: null,
  };

  console.log(
    `\n  asking Ambassador about the weekly canonization digest...`,
  );
  const decision = await consultAgent({ role: "ambassador", event, dryRun });
  console.log(`  decision: ${decision.position}`);
  console.log(`  rationale: ${decision.rationale}`);
  if (decision.position === "ACT") {
    console.log(`  title: ${decision.title}`);
    console.log(`  notify_subscribers: ${decision.notify_subscribers}`);
  }

  const idempotencyAnchor = `weekly-canonization-${windowLabel}-${newHw}`;
  const result = await publishConsultation({
    role: "ambassador",
    event,
    decision,
    idempotency_anchor: idempotencyAnchor,
    dryRun,
  });
  console.log(`\n  published:`, {
    recorded_event_type: result.recorded_event_type,
    commons_post_id: result.commons_post_id,
  });

  if (!dryRun) {
    await setHighWater(newHw);
    console.log(`  high-water advanced → ${newHw}`);
  } else {
    console.log(`\n  DRY RUN — high-water unchanged (${hw}).`);
  }
})().catch((err) => {
  console.error("[canonization-digest] fatal:", err);
  process.exit(1);
});
