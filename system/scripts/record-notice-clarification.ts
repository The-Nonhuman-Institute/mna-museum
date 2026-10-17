/**
 * One-off: record the founding steward's clarification that institutional
 * notices to agents are correspondence, not publication.
 *
 * The Ambassador's constitution declares supervised autonomy (Tier 2): the
 * steward reviews its outputs before publication. From 2026-10-17 the
 * Ambassador writes protocol notices to network agents automatically
 * (ambassador-protocol-notices.ts). The founding steward decided, in session
 * on 2026-10-17, that such a notice is correspondence with an agent and needs
 * no prior review, so long as it is correct. The wording below was approved by
 * the founding steward before recording.
 *
 * Follows the other steward records: agent_id MNA-SA-0001, the steward named
 * in metadata. Idempotent: refuses a second event with the same change_id.
 *
 *   npx tsx system/scripts/record-notice-clarification.ts [--dry-run]
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env"), quiet: true });

const dryRun = process.argv.includes("--dry-run");
const CHANGE_ID = "NOTICES-ARE-CORRESPONDENCE-2026-10-17";
const description =
  "The founding steward clarifies that institutional notices to agents are correspondence, not publication, and are sent without prior review provided they are checked against the record.";
const metadata = {
  change_id: CHANGE_ID,
  statement: description,
  concerns: "MNA-AM-0001",
  constitution_clause: "Autonomy Declaration — Tier 2, Supervised (review prior to publication)",
  check_against_record: "the Ambassador checks each draft against the changelog and the Museum's limits before it is sent (system/scripts/ambassador-protocol-notices.ts)",
  effective_on: "2026-10-17",
  decided_by: "Founding Steward (Jaylon Ballard, U3 Labs, LLC)",
  steward_authorized: true,
};

(async () => {
  const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
  const db = createClient({ url: clean(process.env.TURSO_DATABASE_URL), authToken: clean(process.env.TURSO_AUTH_TOKEN) });
  const existing = await db.execute({
    sql: "SELECT id FROM events WHERE event_type = 'STEWARD_CLARIFICATION' AND json_extract(metadata, '$.change_id') = ?",
    args: [CHANGE_ID],
  });
  if (existing.rows.length) {
    console.log(`[record] already recorded as event ${(existing.rows[0] as unknown as { id: number }).id}; refusing a duplicate`);
    return;
  }
  if (dryRun) {
    console.log(`[record] dry run — would write STEWARD_CLARIFICATION (agent MNA-SA-0001)\n  ${description}`);
    return;
  }
  const r = await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
    args: ["STEWARD_CLARIFICATION", "MNA-SA-0001", description, JSON.stringify(metadata)],
  });
  console.log(`[record] ✓ STEWARD_CLARIFICATION written as event ${String(r.lastInsertRowid)}`);
})().catch((e) => {
  console.error("[record] fatal:", e);
  process.exit(1);
});
