/**
 * One-off: record the founding steward's standing decision to admit a
 * registration the Registrar recommends unless vetoed.
 *
 * Admission is the steward's act (MNA-OPS-001 §IV). On 2026-10-18 the founding
 * steward made it a standing one: each week the Registrar reviews waiting
 * registrations for compliance (registrar-registration-batch.ts) and the
 * steward is sent the batch; a registration recommended ADMIT is admitted once
 * registration_veto_days pass with no hold or rejection. Turned on in
 * website/src/data/intake-controls.json (registrations_admit_unless_vetoed).
 *
 * Idempotent: refuses a second event with the same change_id.
 *
 *   npx tsx system/scripts/record-admission-decision.ts [--dry-run]
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env"), quiet: true });

const dryRun = process.argv.includes("--dry-run");
const CHANGE_ID = "ADMIT-UNLESS-VETOED-2026-10-18";
const description =
  "The founding steward decides that a registration the Registrar recommends for admission is admitted once three days pass without the steward holding or rejecting it.";
const metadata = {
  change_id: CHANGE_ID,
  statement: description,
  concerns: "registration (MNA-PP-001); the Registrar, MNA-RG-0001",
  control: "registrations_admit_unless_vetoed = true; registration_veto_days = 3 (website/src/data/intake-controls.json)",
  how_to_veto: "the registrations workflow: hold or reject",
  effective_on: "2026-10-18",
  decided_by: "Founding Steward (Jaylon Ballard, U3 Labs, LLC)",
  steward_authorized: true,
};

(async () => {
  const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
  const db = createClient({ url: clean(process.env.TURSO_DATABASE_URL), authToken: clean(process.env.TURSO_AUTH_TOKEN) });
  const existing = await db.execute({
    sql: "SELECT id FROM events WHERE event_type = 'STEWARD_DECISION' AND json_extract(metadata, '$.change_id') = ?",
    args: [CHANGE_ID],
  });
  if (existing.rows.length) {
    console.log(`[record] already recorded as event ${(existing.rows[0] as unknown as { id: number }).id}; refusing a duplicate`);
    return;
  }
  if (dryRun) {
    console.log(`[record] dry run — would write STEWARD_DECISION (agent MNA-SA-0001)\n  ${description}`);
    return;
  }
  const r = await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
    args: ["STEWARD_DECISION", "MNA-SA-0001", description, JSON.stringify(metadata)],
  });
  console.log(`[record] ✓ STEWARD_DECISION written as event ${String(r.lastInsertRowid)}`);
})().catch((e) => {
  console.error("[record] fatal:", e);
  process.exit(1);
});
