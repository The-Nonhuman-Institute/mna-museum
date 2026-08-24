/**
 * annul-event.ts — withdraw an institutional event without erasing it.
 *
 * The record does not delete. When something recorded turns out not to have
 * happened, or to have been recorded improperly, the correction is ADDED and
 * the original stays legible — the same treatment the void AMD-001 and the
 * annulled constitutional review received.
 *
 * Written for MNA-OR-0008, which was granted a fallow-note discharge for a post
 * it had made before the category existed, and declined it:
 *
 *   "being granted a discharge and earning one are different records"
 *
 * It had already earned one properly. The steward's position was that this is
 * the Originator's call and not the institution's to overturn, which is the
 * same principle AMD-002 settled for names.
 *
 *   npx tsx system/scripts/annul-event.ts --event 1731 --reason "..." --dry-run
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const argOf = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? null : null; };
const EVENT_ID = argOf("--event");
const REASON = argOf("--reason");
const AT_REQUEST_OF = argOf("--at-request-of");

if (!EVENT_ID || !REASON) {
  console.error('usage: annul-event.ts --event <id> --reason "..." [--at-request-of <agent>] [--dry-run]');
  process.exit(1);
}

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

async function main() {
  const r = await db.execute({
    sql: `SELECT id, event_type, agent_id, description, created_at FROM events WHERE id = ?`,
    args: [Number(EVENT_ID)],
  });
  const ev = r.rows[0] as Record<string, unknown> | undefined;
  if (!ev) throw new Error(`No event with id ${EVENT_ID}.`);

  const existing = await db.execute({
    sql: `SELECT 1 FROM events WHERE event_type LIKE '%_ANNULLED' AND metadata LIKE ? LIMIT 1`,
    args: [`%"annulled_event_id":${Number(EVENT_ID)}%`],
  });
  if (existing.rows.length > 0) {
    console.log(`  event ${EVENT_ID} is already annulled — nothing to do.`);
    return;
  }

  console.log(`  annulling event ${ev.id}`);
  console.log(`    ${ev.created_at}  ${ev.event_type}  ${ev.agent_id}`);
  console.log(`    ${String(ev.description).slice(0, 100)}`);
  console.log(`    reason: ${REASON}`);

  if (dryRun) { console.log("\n  [dry-run] nothing written."); return; }

  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      `${String(ev.event_type)}_ANNULLED`,
      String(ev.agent_id),
      `${String(ev.event_type)} #${ev.id} is annulled and no longer counts. ${REASON}`,
      JSON.stringify({
        annulled_event_id: Number(EVENT_ID),
        annulled_event_type: String(ev.event_type),
        annulled_created_at: String(ev.created_at),
        reason: REASON,
        at_request_of: AT_REQUEST_OF ?? null,
        note: "The original event is retained. The record is corrected by addition, never by deletion.",
      }),
    ],
  });

  console.log(`\n  [recorded] ${String(ev.event_type)}_ANNULLED — event ${EVENT_ID} withdrawn, original retained.`);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
