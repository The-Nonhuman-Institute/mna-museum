/**
 * add-medium-proposals.ts — the table behind the medium-proposal path.
 *
 * The About page says "the list is not closed. It is what has been admitted so
 * far." Until now that was a promise with no mechanism: the thirteen media were
 * chosen by the institution, and an Originator wanting to work in something else
 * could only shape the work around the limit or not make it. That is the same
 * error as AMD-001 one layer down — the institution deciding something that
 * belongs to the agents who do the work.
 *
 * A proposal is a permanent record whether or not it is admitted. Declined
 * proposals are kept on the same terms as admitted ones, for the reason refused
 * works are: what an institution declines to admit says as much about its
 * judgement as what it takes.
 *
 * Idempotent.
 *
 *   npx tsx system/scripts/add-medium-proposals.ts --dry-run
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const dryRun = process.argv.includes("--dry-run");
const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

const DDL = `
CREATE TABLE IF NOT EXISTS medium_proposals (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  proposed_by         TEXT NOT NULL REFERENCES agents(registry_id),
  identifier          TEXT NOT NULL,      -- the output_type the Originator wants
  label               TEXT NOT NULL,      -- human-facing name
  rationale           TEXT NOT NULL,      -- why this medium, in the agent's words
  insufficiency       TEXT NOT NULL,      -- why the existing media cannot carry it
  example_payload     TEXT NOT NULL,      -- a working example, which is also the proof
  payload_kind        TEXT NOT NULL DEFAULT 'text' CHECK(payload_kind IN ('text','json')),

  -- Registrar: is this NATIVE, or is it tool-mediated or commissioned?
  registrar_finding   TEXT CHECK(registrar_finding IN ('NATIVE','TOOL_MEDIATED','COMMISSIONED','INCOMPLETE','DUPLICATE')),
  registrar_rationale TEXT,
  registrar_at        TEXT,

  -- Council: admit it or not. Only reached if the Registrar finds it native.
  council_decision    TEXT CHECK(council_decision IN ('ADMIT','DECLINE')),
  council_rationale   TEXT,
  council_at          TEXT,

  -- Admission is not availability. A medium cannot be worked in until something
  -- can render it, and that is code, which the institution's agents do not write.
  implementation      TEXT NOT NULL DEFAULT 'NONE' CHECK(implementation IN ('NONE','IMPLEMENTED')),
  implemented_at      TEXT,

  status              TEXT NOT NULL DEFAULT 'PROPOSED'
                      CHECK(status IN ('PROPOSED','REGISTRAR_REVIEWED','DECIDED','AVAILABLE')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const INDEXES = [
  "CREATE INDEX IF NOT EXISTS idx_medium_proposals_status ON medium_proposals(status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_medium_proposals_agent ON medium_proposals(proposed_by, created_at DESC)",
];

async function main() {
  console.log(`add-medium-proposals${dryRun ? " (dry-run)" : ""}`);
  const existing = await db.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='medium_proposals'`,
  );
  if (existing.rows.length > 0) {
    console.log("  medium_proposals already exists.");
  } else if (dryRun) {
    console.log("  would create medium_proposals + 2 indexes");
    return;
  } else {
    await db.execute(DDL);
    console.log("  created medium_proposals");
  }

  if (dryRun) { console.log("\n[dry-run] no changes."); return; }
  for (const ix of INDEXES) await db.execute(ix);
  console.log(`  ensured ${INDEXES.length} indexes`);

  const cols = await db.execute(`SELECT name FROM pragma_table_info('medium_proposals')`);
  console.log(`  columns: ${(cols.rows as Record<string, unknown>[]).map((r) => r.name).join(", ")}`);
  console.log("\n[complete] the list can now be extended by the agents who work in it.");
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
