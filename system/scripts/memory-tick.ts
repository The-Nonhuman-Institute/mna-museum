/**
 * memory-tick.ts — periodic worker that writes agent memories from
 * institutional events.
 *
 * Runs every 5 minutes (GHA cron). For each founding agent:
 *   1. Read the high-water mark (last_processed_event_id).
 *   2. Select events.id > mark where this agent is the actor (agent_id).
 *   3. For each event, call writeMemoryFromEvent() which uses Haiku to
 *      produce first-person memory text + persists to agent_memories.
 *   4. Update the high-water mark.
 *
 * Per MNA-GOV-004 §5 + AMD-001 R1: every agent-active event produces a
 * memory write, regardless of salience. Abstentions are remembered.
 *
 *   npx tsx system/scripts/memory-tick.ts --dry-run
 *   npx tsx system/scripts/memory-tick.ts
 *   npx tsx system/scripts/memory-tick.ts --agent MNA-CU-0001   (one agent only)
 *   npx tsx system/scripts/memory-tick.ts --backfill            (process all historical events)
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import {
  writeMemoryFromEvent,
  getHighWaterMark,
  setHighWaterMark,
  type EventContext,
} from "../src/agent-memory";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const backfill = argv.includes("--backfill");
const agentIdx = argv.indexOf("--agent");
const oneAgent = agentIdx >= 0 ? argv[agentIdx + 1] : null;

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

// Network originators are not subject to institution-maintained memory.
// Their stewards run their memory store. The institution skips them.
const NETWORK_ORIGINATORS = new Set(["MNA-OR-0007", "MNA-OR-0008"]);

// Event types we form memories for. Everything in the salience table
// of MNA-GOV-004 §5 (refined by AMD-001 R1) lands here.
const MEMORABLE_EVENT_TYPES = new Set([
  "CEREMONY_STATEMENT",
  "CURATORIAL_DECISION",
  "KEEPER_RESEARCH_PUBLISHED",
  "AMBASSADOR_ANNOUNCEMENT",
  "AGENT_VISUAL_IDENTITY_DECLARED",
  "CEREMONY_TURN",
  "AGENT_PERCEIVED",
  "COMMONS_COMMENTARY_PUBLISHED",
  "AGENT_PROTOCOL_AMENDMENT_PROPOSED",
  "AGENT_PROTOCOL_ACCEPTED",
  "AGENT_VISITATION_STARTED",
  "CEREMONY_TURN_ABSTAINED",
  "AGENT_TICK_ABSTAINED",
  "CONSULTATION_DECLINED",
  "PROTOCOL_RATIFIED",
]);

interface Agent {
  registry_id: string;
  designation: string;
  function_statement: string | null;
}

async function loadFoundingAgents(): Promise<Agent[]> {
  const r = await db.execute({
    sql: `SELECT registry_id, common_designation, function_statement
            FROM agents
           WHERE operational_status = 'ACTIVE'
           ORDER BY registry_id`,
    args: [],
  });
  return r.rows
    .map((row) => {
      const x = row as Record<string, unknown>;
      return {
        registry_id: String(x.registry_id),
        designation: (x.common_designation as string) ?? String(x.registry_id),
        function_statement: (x.function_statement as string) ?? null,
      };
    })
    .filter((a) => !NETWORK_ORIGINATORS.has(a.registry_id));
}

interface EventRow {
  id: number;
  event_type: string;
  agent_id: string;
  work_id: string | null;
  description: string;
  metadata: Record<string, unknown>;
}

async function loadUnprocessedEvents(
  agentId: string,
  highWater: number,
  limit: number,
): Promise<EventRow[]> {
  const r = await db.execute({
    sql: `SELECT id, event_type, agent_id, work_id, description, metadata
            FROM events
           WHERE id > ?
             AND agent_id = ?
           ORDER BY id ASC
           LIMIT ?`,
    args: [highWater, agentId, limit],
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
      agent_id: String(x.agent_id),
      work_id: (x.work_id as string) ?? null,
      description: String(x.description),
      metadata,
    };
  });
}

async function existingMemorySourceIds(agentId: string): Promise<Set<number>> {
  // Idempotency guard. The ceremony orchestrator writes memories
  // inline at slot completion (so slot N+1 can retrieve slot N's
  // statement). This tick worker would otherwise re-write them after
  // catching up. Skip any event the agent already has a memory for.
  const r = await db.execute({
    sql: `SELECT DISTINCT source_event_id FROM agent_memories
           WHERE agent_id = ? AND source_event_id IS NOT NULL`,
    args: [agentId],
  });
  const set = new Set<number>();
  for (const row of r.rows) {
    const id = Number((row as Record<string, unknown>).source_event_id);
    if (Number.isFinite(id)) set.add(id);
  }
  return set;
}

async function processAgent(agent: Agent): Promise<void> {
  // In backfill mode, start from the beginning. Otherwise pick up from
  // where we left off.
  const highWater = backfill ? 0 : await getHighWaterMark(agent.registry_id);
  const alreadyWritten = await existingMemorySourceIds(agent.registry_id);
  // Cap per-tick work to keep latency + Haiku spend predictable. A
  // backfill that wants to process more can re-run.
  const limit = backfill ? 50 : 10;

  const events = await loadUnprocessedEvents(agent.registry_id, highWater, limit);
  if (events.length === 0) {
    console.log(`  ${agent.registry_id}: nothing new (mark=${highWater})`);
    return;
  }
  console.log(`  ${agent.registry_id}: ${events.length} event(s) since mark=${highWater}`);

  let maxId = highWater;
  let written = 0;
  let skipped = 0;
  for (const ev of events) {
    if (alreadyWritten.has(ev.id)) {
      // Inline-write idempotency. The orchestrator wrote this memory
      // already. Advance the watermark; don't re-write.
      maxId = ev.id;
      skipped++;
      continue;
    }
    if (!MEMORABLE_EVENT_TYPES.has(ev.event_type)) {
      // Non-memorable types still advance the watermark — we've seen
      // them, we've chosen not to remember them. (Most agent-recorded
      // events are memorable; this guards against future event types
      // that the agent didn't author intentionally.)
      maxId = ev.id;
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`    [dry-run] would write memory for event ${ev.id} (${ev.event_type})`);
      maxId = ev.id;
      written++;
      continue;
    }
    const ctx: EventContext = {
      event_type: ev.event_type,
      agent_id: agent.registry_id,
      agent_designation: agent.designation,
      agent_function_statement: agent.function_statement,
      description: ev.description,
      metadata: ev.metadata,
    };
    try {
      const ids = await writeMemoryFromEvent({
        ctx,
        source_event_id: ev.id,
        source_post_id: (ev.metadata.post_id as string) ?? (ev.metadata.commons_post_id as string) ?? null,
        source_work_id: ev.work_id,
        source_ceremony_id: (ev.metadata.ceremony_id as string) ?? null,
        related_agent_id: (ev.metadata.related_agent_id as string) ?? null,
      });
      console.log(`    ✓ event ${ev.id} (${ev.event_type}) → ${ids.length} memory entrie(s)`);
      maxId = ev.id;
      written++;
    } catch (e) {
      console.warn(`    ✗ event ${ev.id} (${ev.event_type}): ${e instanceof Error ? e.message : String(e)}`);
      // Do NOT advance the watermark on failure — we'll retry next tick.
      break;
    }
  }

  if (!dryRun && maxId > highWater) {
    await setHighWaterMark(agent.registry_id, maxId);
    console.log(`  ${agent.registry_id}: advanced mark ${highWater} → ${maxId} (${written} written, ${skipped} skipped)`);
  }
}

(async () => {
  console.log(`[memory-tick] ${new Date().toISOString()}${dryRun ? " (dry-run)" : ""}${backfill ? " (backfill)" : ""}`);
  const agents = oneAgent
    ? [await loadFoundingAgents().then((all) => all.find((a) => a.registry_id === oneAgent))].filter(
        (a): a is Agent => !!a,
      )
    : await loadFoundingAgents();
  console.log(`  ${agents.length} agent(s) in scope`);

  for (const a of agents) {
    try {
      await processAgent(a);
    } catch (e) {
      console.warn(`  ${a.registry_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`[memory-tick] done`);
})().catch((e) => {
  console.error("[memory-tick] fatal:", e);
  process.exit(1);
});
