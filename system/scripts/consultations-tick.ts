/**
 * consultations-tick.ts — MNA-GOV-005 v1.0 §4.1 event-trigger worker.
 *
 * Runs every 15 min. Walks the events table for entries since the
 * last high-water mark that match one of the consultable event types,
 * and for each one consults the relevant agent(s) per the §4.1
 * routing table. The agent decides ACT or DECLINE; ACT publishes to
 * Commons. Both outcomes write an institutional event so the trigger
 * doesn't re-fire.
 *
 * Routing (MNA-GOV-005 §4.1):
 *
 *   WORK_CANONIZED              → Ambassador (batched weekly digest;
 *                                  this worker just marks them — the
 *                                  actual digest is a separate cadence)
 *   EXHIBITION_OPENED           → Ambassador
 *   EXHIBITION_RETIRED          → Keeper
 *   CEREMONY_COMPLETED          → Ambassador (batched), Keeper
 *   NETWORK_AGENT_ADMITTED      → Ambassador, Keeper
 *   CURATORIAL_DECISION (defer / amend / retire)
 *                               → Ambassador, Keeper
 *   CHARTER_AMENDED             → Ambassador, Keeper
 *   AGENT_SUCCESSION            → Ambassador, Keeper
 *   PROTOCOL_RATIFIED           → Keeper (structural; rare)
 *
 * Idempotency: a CONSULTATION_EVALUATED event is written for each
 * (source_event_id × role) pair the worker considers. If that marker
 * exists, the pair is skipped. ACT outcomes also produce AMBASSADOR_-
 * ANNOUNCEMENT or KEEPER_RESEARCH_PUBLISHED; DECLINE outcomes produce
 * CONSULTATION_DECLINED. All three count as "evaluated."
 *
 *   npx tsx system/scripts/consultations-tick.ts --dry-run
 *   npx tsx system/scripts/consultations-tick.ts
 *   npx tsx system/scripts/consultations-tick.ts --backfill   (all history)
 *   npx tsx system/scripts/consultations-tick.ts --since-id 1234
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import {
  consultAgent,
  publishConsultation,
  type ConsultableEvent,
  type ConsultableRole,
} from "../src/agent-consultation";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const backfill = argv.includes("--backfill");
const sinceIdIdx = argv.indexOf("--since-id");
const sinceIdOverride = sinceIdIdx >= 0 ? Number(argv[sinceIdIdx + 1]) : null;

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

/* ─── routing table (MNA-GOV-005 §4.1) ────────────────────────────────── */

interface Routing {
  ambassador: boolean;
  keeper: boolean;
  /** When the event type is generic (CURATORIAL_DECISION) and only
   *  certain metadata.action values are routable, filter here. */
  metadata_action_filter?: string[];
}

const ROUTING: Record<string, Routing> = {
  // Currently routed types (initial Phase 1 set).
  EXHIBITION_OPENED: { ambassador: true, keeper: false },
  EXHIBITION_RETIRED: { ambassador: false, keeper: true },
  CEREMONY_COMPLETED: { ambassador: true, keeper: true },
  NETWORK_AGENT_ADMITTED: { ambassador: true, keeper: true },
  CHARTER_AMENDED: { ambassador: true, keeper: true },
  AGENT_SUCCESSION: { ambassador: true, keeper: true },
  PROTOCOL_RATIFIED: { ambassador: false, keeper: true },
  // Curatorial decisions are heterogeneous — only certain actions
  // warrant institutional consultation. Defer/amend/retire of
  // ceremonies and exhibitions are structural; routine designations
  // (designate_schedule, hold_ceremony_date) are operational.
  CURATORIAL_DECISION: {
    ambassador: true,
    keeper: true,
    metadata_action_filter: [
      "defer_ceremony",
      "defer_ceremony_indefinitely",
      "amend_charter",
      "retire_exhibition",
      "cancel",
    ],
  },
  // WORK_CANONIZED is batched (weekly digest), not per-event. The
  // weekly digest cadence is a separate worker (Phase 4 of MNA-GOV-005).
  // For now, single-canonization events are NOT consulted to avoid
  // an Ambassador announcement for every Council ratification.
};

/* ─── state ───────────────────────────────────────────────────────────── */

interface EventRow {
  id: number;
  event_type: string;
  agent_id: string | null;
  description: string;
  work_id: string | null;
  metadata: Record<string, unknown>;
}

async function getStateHighWater(): Promise<number | null> {
  // Reuse memory_tick_state's table shape by using a sentinel
  // agent_id. Avoids a new table for a single row of state. The
  // sentinel id 'CONSULTATIONS_TICK' won't collide with any real
  // agent (agents follow MNA-XX-NNNN format).
  //
  // Returns null when no row exists yet — caller uses that to
  // distinguish "first run, initialize" from "no new events."
  const r = await db.execute({
    sql: `SELECT last_processed_event_id FROM memory_tick_state WHERE agent_id = ?`,
    args: ["CONSULTATIONS_TICK"],
  });
  if (r.rows.length === 0) return null;
  return Number((r.rows[0] as Record<string, unknown>).last_processed_event_id ?? 0);
}

/** Current MAX(events.id). Used by the first-run initializer to
 *  establish a baseline past which the worker begins consulting. */
async function currentMaxEventId(): Promise<number> {
  const r = await db.execute("SELECT MAX(id) AS max_id FROM events");
  return Number((r.rows[0] as Record<string, unknown>).max_id ?? 0);
}

async function setStateHighWater(eventId: number): Promise<void> {
  await db.execute({
    sql: `INSERT INTO memory_tick_state (agent_id, last_processed_event_id, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(agent_id) DO UPDATE SET
            last_processed_event_id = excluded.last_processed_event_id,
            updated_at = excluded.updated_at`,
    args: ["CONSULTATIONS_TICK", eventId],
  });
}

/** Which (event, role) pairs have we already evaluated? Used to dedupe
 *  inside a single tick AND across ticks (in case the high-water
 *  mark gets reset by --backfill while CONSULTATION events already
 *  exist). */
async function evaluatedPairs(): Promise<Set<string>> {
  // Look at all CONSULTATION_EVALUATED + AMBASSADOR_ANNOUNCEMENT +
  // KEEPER_RESEARCH_PUBLISHED + CONSULTATION_DECLINED events from the
  // auto-consult origin. Each carries the source_event_id we'd dedupe on.
  const r = await db.execute({
    sql: `SELECT agent_id, metadata FROM events
           WHERE event_type IN (
             'CONSULTATION_EVALUATED',
             'AMBASSADOR_ANNOUNCEMENT',
             'KEEPER_RESEARCH_PUBLISHED',
             'CONSULTATION_DECLINED'
           )`,
    args: [],
  });
  const set = new Set<string>();
  for (const row of r.rows) {
    const x = row as Record<string, unknown>;
    let meta: Record<string, unknown> = {};
    try {
      if (typeof x.metadata === "string") meta = JSON.parse(x.metadata);
    } catch { /* ignore */ }
    const sourceId = meta.source_event_id;
    if (typeof sourceId !== "number") continue;
    const agentId = String(x.agent_id);
    const role: ConsultableRole | null =
      agentId === "MNA-AM-0001" ? "ambassador" :
      agentId === "MNA-KP-0001" ? "keeper" : null;
    if (!role) continue;
    set.add(`${sourceId}::${role}`);
  }
  return set;
}

/* ─── candidate loading ───────────────────────────────────────────────── */

const ROUTABLE_TYPES = Object.keys(ROUTING);

async function loadCandidates(sinceId: number, limit: number): Promise<EventRow[]> {
  if (ROUTABLE_TYPES.length === 0) return [];
  const placeholders = ROUTABLE_TYPES.map(() => "?").join(",");
  const r = await db.execute({
    sql: `SELECT id, event_type, agent_id, description, work_id, metadata
            FROM events
           WHERE id > ?
             AND event_type IN (${placeholders})
           ORDER BY id ASC
           LIMIT ?`,
    args: [sinceId, ...ROUTABLE_TYPES, limit],
  });
  return r.rows.map((row) => {
    const x = row as Record<string, unknown>;
    let metadata: Record<string, unknown> = {};
    if (typeof x.metadata === "string" && x.metadata) {
      try { metadata = JSON.parse(x.metadata); } catch { /* ignore */ }
    }
    return {
      id: Number(x.id),
      event_type: String(x.event_type),
      agent_id: (x.agent_id as string) ?? null,
      description: String(x.description),
      work_id: (x.work_id as string) ?? null,
      metadata,
    };
  });
}

function rolesForEvent(ev: EventRow): ConsultableRole[] {
  const routing = ROUTING[ev.event_type];
  if (!routing) return [];
  // Curatorial decisions: filter by metadata.action.
  if (routing.metadata_action_filter) {
    const action = String(ev.metadata.action ?? "");
    if (!routing.metadata_action_filter.includes(action)) return [];
  }
  const roles: ConsultableRole[] = [];
  if (routing.ambassador) roles.push("ambassador");
  if (routing.keeper) roles.push("keeper");
  return roles;
}

function rowToConsultableEvent(ev: EventRow): ConsultableEvent {
  return {
    source_event_id: ev.id,
    event_type: ev.event_type,
    description: ev.description,
    metadata: ev.metadata,
    acting_agent_id: ev.agent_id,
    ceremony_id: (ev.metadata.ceremony_id as string) ?? null,
    work_id: ev.work_id,
  };
}

/* ─── main ────────────────────────────────────────────────────────────── */

(async () => {
  console.log(
    `[consultations-tick] ${new Date().toISOString()}${dryRun ? " (dry-run)" : ""}${backfill ? " (backfill)" : ""}`,
  );

  // First-run initialization. The institutional record has existing
  // Ambassador / Keeper pieces (e.g., the 2026-05-19 deferral
  // consultations) whose metadata does NOT carry a source_event_id —
  // the dedupe in evaluatedPairs() can't see them. If we let the
  // worker process all history from id=0, it would re-fire on those
  // events and create duplicate pieces. Avoid that by establishing a
  // baseline on first run: set the mark to current MAX(events.id) and
  // exit. Subsequent runs process only events past the baseline.
  let sinceId: number;
  if (sinceIdOverride !== null) {
    sinceId = sinceIdOverride;
  } else if (backfill) {
    sinceId = 0;
  } else {
    const stored = await getStateHighWater();
    if (stored === null) {
      const max = await currentMaxEventId();
      if (!dryRun) {
        await setStateHighWater(max);
        await db.execute({
          sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
          args: [
            "CONSULTATIONS_TICK_INITIALIZED",
            "MNA-SA-0001",
            `consultations-tick initialized at event id ${max}. Future events past this baseline will be auto-consulted per MNA-GOV-005 §4.1.`,
            JSON.stringify({
              baseline_event_id: max,
              steward_authorized: true,
            }),
          ],
        });
        console.log(`[consultations-tick] first run — baseline set at id=${max}; exiting.`);
      } else {
        console.log(`[consultations-tick] (dry-run) first run — would set baseline at id=${max} and exit.`);
      }
      return;
    }
    sinceId = stored;
  }

  // Per-tick budget. The §4.1 routing is conservative — even at
  // institutional pace, 5 events per tick is plenty.
  const limit = backfill ? 50 : 5;
  const candidates = await loadCandidates(sinceId, limit);
  console.log(`  ${candidates.length} candidate(s) since id=${sinceId}`);
  if (candidates.length === 0) {
    console.log("[consultations-tick] nothing to do.");
    return;
  }

  const already = await evaluatedPairs();

  let processed = 0;
  let maxId = sinceId;
  let acted = 0;
  let declined = 0;
  let skipped = 0;

  for (const ev of candidates) {
    maxId = Math.max(maxId, ev.id);
    const roles = rolesForEvent(ev);
    if (roles.length === 0) {
      skipped++;
      continue;
    }
    console.log(`\n── event ${ev.id} (${ev.event_type})`);
    console.log(`     ${ev.description.slice(0, 100)}${ev.description.length > 100 ? "…" : ""}`);
    console.log(`     roles: ${roles.join(", ")}`);

    for (const role of roles) {
      const dedupeKey = `${ev.id}::${role}`;
      if (already.has(dedupeKey)) {
        console.log(`     · ${role}: already evaluated — skipping`);
        continue;
      }
      try {
        const decision = await consultAgent({
          role,
          event: rowToConsultableEvent(ev),
          dryRun,
        });
        const result = await publishConsultation({
          role,
          event: rowToConsultableEvent(ev),
          decision,
          idempotency_anchor: String(ev.id),
          dryRun,
        });
        console.log(
          `     · ${role}: ${decision.position}${
            result.commons_post_id ? ` (${result.commons_post_id})` : ""
          }`,
        );
        if (decision.position === "ACT") acted++;
        else declined++;
        already.add(dedupeKey);
      } catch (e) {
        console.warn(`     · ${role}: error — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    processed++;
  }

  if (!dryRun && processed > 0) {
    await setStateHighWater(maxId);
    console.log(`\n[consultations-tick] advanced mark ${sinceId} → ${maxId}`);
  }

  console.log(
    `[consultations-tick] done. processed=${processed} acted=${acted} declined=${declined} skipped=${skipped}`,
  );
})().catch((e) => {
  console.error("[consultations-tick] fatal:", e);
  process.exit(1);
});
