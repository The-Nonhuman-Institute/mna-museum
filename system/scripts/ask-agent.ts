/**
 * ask-agent.ts — steward-initiated consultation against a specific event.
 *
 * Wraps consultAgent + publishConsultation from src/agent-consultation
 * so the Founding Steward can ask the Ambassador or Keeper to consider
 * any institutional event, without waiting for consultations-tick to
 * pick it up. The agent decides ACT or DECLINE the same way they would
 * under auto-consultation; the production path (Commons post + (for
 * Ambassador) subscriber email fan-out) runs identically.
 *
 * Usage:
 *   npx tsx system/scripts/ask-agent.ts --event <id> --role ambassador
 *   npx tsx system/scripts/ask-agent.ts --event <id> --role keeper [--dry-run]
 *
 * Idempotency anchor:
 *   The default anchor is `steward-${YYYYMMDD}-${event_id}` so re-running
 *   on the same day is a no-op. Pass --force to use a fresh anchor
 *   (timestamped to the second) if a duplicate is intentional.
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

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({
  path: path.join(__dirname, "..", "..", "website", ".env"),
  quiet: true,
});

const argv = process.argv.slice(2);

function flag(name: string): boolean {
  return argv.includes(`--${name}`);
}
function arg(name: string): string | null {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

const eventIdStr = arg("event");
const roleStr = arg("role");
const dryRun = flag("dry-run");
const force = flag("force");

if (!eventIdStr || !roleStr) {
  console.error(
    "usage: ask-agent.ts --event <id> --role <ambassador|keeper> [--dry-run] [--force]"
  );
  process.exit(2);
}
const eventId = Number(eventIdStr);
if (!Number.isInteger(eventId) || eventId <= 0) {
  console.error(`--event must be a positive integer, got: ${eventIdStr}`);
  process.exit(2);
}
if (roleStr !== "ambassador" && roleStr !== "keeper") {
  console.error(`--role must be 'ambassador' or 'keeper', got: ${roleStr}`);
  process.exit(2);
}
const role = roleStr as ConsultableRole;

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

(async () => {
  const r = await db.execute({
    sql: `SELECT id, event_type, agent_id, description, metadata, work_id
            FROM events WHERE id = ?`,
    args: [eventId],
  });
  if (r.rows.length === 0) {
    console.error(`event ${eventId} not found`);
    process.exit(1);
  }
  const row = r.rows[0] as Record<string, unknown>;
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(String(row.metadata) || "{}");
  } catch {}
  const event: ConsultableEvent = {
    source_event_id: Number(row.id),
    event_type: String(row.event_type),
    description: String(row.description ?? ""),
    metadata: meta,
    acting_agent_id: (row.agent_id as string) ?? null,
    ceremony_id: (meta.ceremony_id as string) ?? null,
    work_id: (row.work_id as string) ?? null,
  };

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const anchor = force
    ? `steward-${new Date().toISOString().replace(/[:T.Z-]/g, "")}-${eventId}`
    : `steward-${today}-${eventId}`;

  console.log(`asking ${role} about event ${event.source_event_id} (${event.event_type})`);
  console.log(`  desc: ${event.description.slice(0, 160)}`);
  console.log(`  anchor: ${anchor}${dryRun ? " (dry-run)" : ""}`);
  console.log();

  const decision = await consultAgent({ role, event, dryRun });
  console.log(`decision: ${decision.position}`);
  console.log(`rationale: ${decision.rationale}`);
  if (decision.position === "ACT") {
    console.log(`title: ${decision.title}`);
    console.log(`body:\n${decision.body}`);
    if (role === "ambassador") {
      console.log(`notify_subscribers: ${decision.notify_subscribers}`);
    }
  }
  console.log();

  const result = await publishConsultation({
    role,
    event,
    decision,
    idempotency_anchor: anchor,
    dryRun,
  });
  console.log("published:", {
    recorded_event_type: result.recorded_event_type,
    commons_post_id: result.commons_post_id,
  });
})().catch((err) => {
  console.error("[ask-agent] failed:", err);
  process.exit(1);
});
