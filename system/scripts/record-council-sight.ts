/**
 * One-off: record in the Keeper's record that the Evaluation Council was given
 * sight on 2026-10-16, and that the model rendering its verdicts changed with it.
 *
 * A description, not a directive, in the manner of the steward's observations:
 * it addresses no agent. The Steward Agent reads the Keeper's record for its
 * longitudinal analysis; this puts the baseline event where it reads. The text
 * was drafted and reviewed by the founding steward in the doc "Council Sight
 * Pilot" before recording.
 *
 * Follows the ratification scripts: agent_id MNA-SA-0001, the steward named in
 * metadata. Idempotent: refuses a second event with the same change_id.
 *
 *   npx tsx system/scripts/record-council-sight.ts [--dry-run]
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const dryRun = process.argv.includes("--dry-run");
const CHANGE_ID = "COUNCIL-SIGHT-2026-10-16";

const description =
  "On 2026-10-16 the founding steward changed how works come before the Evaluation Council: each evaluator is now shown the work as the Museum renders it, as well as its source.";

const statement = [
  "From 2026-10-16, each evaluator of the Evaluation Council is shown a work as the Museum renders it for visitors, photographed 3, 20 and 60 seconds after it begins drawing, together with its source. Until this date the Council was given the source alone.",
  "The evaluators' constitutions judge works as they are encountered. A Council that reads only source cannot tell a work that renders from one that does not. MNA-OR-0002-W-0035 was evaluated on 2026-10-03 while, through a fault in the Museum's renderer, it displayed as a black field. Its verdicts describe the work its source specifies, not the work visitors saw.",
  "The model that renders the Council's verdicts changed with it. Verdicts were produced by gpt-oss-120b; from this date they are produced by Gemma 4 (gemma4:31b), the only model the institution can use without cost that can see. Each verdict's record names the model that rendered it and the moments it was shown.",
  "Gemma 4 was not chosen as a better judge; the comparison was too small to show whether it is one.",
  "A work that does not render is held and the founding steward is told why; it is not evaluated from its source alone.",
  "Before the change, a read-only comparison put five works before the Council with and without sight. Sight altered one evaluator's verdict in twenty; the change of model altered three. Its method and results are recorded in commit 03da56a of the Museum's public repository.",
  "No earlier verdict has been revisited. The Council's verdicts stand as rendered.",
].join("\n\n");

const metadata = {
  change_id: CHANGE_ID,
  statement,
  effective_on: "2026-10-16",
  decided_by: "Founding Steward (Jaylon Ballard, U3 Labs, LLC)",
  steward_authorized: true,
  model_before: "gpt-oss-120b",
  model_after: "gemma4:31b",
  sight_seconds: [3, 20, 60],
  commit: "03da56a",
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
