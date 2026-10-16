/**
 * One-off: record in the Keeper's record that a divided Evaluation Council is
 * no longer decided by the Registrar (founding steward, 2026-10-16).
 *
 * A description, not a directive, like record-council-sight.ts. The founding
 * steward reviewed the text in the doc "Council Sight Pilot" before recording.
 * Attributed to MNA-SA-0001 with the steward named in metadata, as the
 * ratifications are. Idempotent on change_id.
 *
 *   npx tsx system/scripts/record-registrar-deliberation.ts [--dry-run]
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const dryRun = process.argv.includes("--dry-run");
const CHANGE_ID = "COUNCIL-DELIBERATION-2026-10-16";

const description =
  "On 2026-10-16 the founding steward changed how a divided Evaluation Council is resolved: the Registrar reports on the case and the Council deliberates again, instead of the Registrar deciding.";

const statement = [
  "Until 2026-10-16, when the Evaluation Council divided two to two, the Registrar rendered the binding verdict. It did so twenty times. The Registrar's constitution does not grant that authority: it investigates, documents and escalates, and cases requiring canon decisions go to the Council with a full Registrar report. The Museum's provenance pages credited MNA-PP-001 with the authority; that protocol does not grant it either, and the pages have been corrected.",
  "From 2026-10-16, a divided Council deliberates again. The Registrar writes a case report setting out what the evaluators disagree about, what in the work bears on it, and what remains unresolved, and renders no verdict. Each evaluator reads all four first verdicts and the report, and may hold or change its own. Three of four decides.",
  "If the Council divides again, the work stays In Review with its questions on record and a timeline, as the evaluators' constitutions define that status. The case reopens once the Originator has made three further works, or after ninety days. The Registrar updates its report with what is new, and the Council deliberates a third and final time. If it divides once more, the work is contested: it stays In Review with its full record and is not reopened.",
  "The Critics are not a ground for reopening. Their constitutions give them canonized works only, and their responses do not count for canon purposes.",
  "The twenty earlier decisions stand. The archive is permanent, and the Registrar's constitution does not reopen resolved cases without new grounds.",
].join("\n\n");

const metadata = {
  change_id: CHANGE_ID,
  statement,
  effective_on: "2026-10-16",
  decided_by: "Founding Steward (Jaylon Ballard, U3 Labs, LLC)",
  steward_authorized: true,
  registrar_tie_breaks_before: 20,
  reopen_after_works: 3,
  reopen_after_days: 90,
  commit: "5f0a30e",
};

(async () => {
  const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });
  const existing = await db.execute({
    sql: "SELECT id FROM events WHERE event_type = 'COUNCIL_PROCEDURE_CHANGED' AND json_extract(metadata, '$.change_id') = ?",
    args: [CHANGE_ID],
  });
  if (existing.rows.length) {
    console.log(`[record] already recorded as event ${(existing.rows[0] as unknown as { id: number }).id}; refusing a duplicate`);
    return;
  }
  if (dryRun) {
    console.log(`[record] dry run — would write COUNCIL_PROCEDURE_CHANGED (agent MNA-SA-0001)`);
    console.log(`  description: ${description}`);
    console.log(`  statement: ${statement.length} chars, ${statement.split("\n\n").length} paragraphs`);
    return;
  }
  const r = await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
    args: ["COUNCIL_PROCEDURE_CHANGED", "MNA-SA-0001", description, JSON.stringify(metadata)],
  });
  console.log(`[record] ✓ COUNCIL_PROCEDURE_CHANGED written as event ${String(r.lastInsertRowid)}`);
})().catch((e) => {
  console.error("[record] fatal:", e);
  process.exit(1);
});
