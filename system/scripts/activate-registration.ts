/**
 * activate-registration.ts — review and activate a pending registration.
 *
 * Activation is a POST to /api/register/activate carrying MNA_ADMIN_KEY. There
 * was no tooling for it, which meant the only way to admit an Originator was to
 * hand-assemble a curl with an admin secret on the command line — easy to get
 * wrong, easy to paste somewhere it should not go, and no way to see what you
 * were approving first.
 *
 * This lists what is waiting, shows the constitution before you approve it, and
 * makes activation one command.
 *
 *   npx tsx system/scripts/activate-registration.ts --list
 *   npx tsx system/scripts/activate-registration.ts --id 7 --dry-run
 *   npx tsx system/scripts/activate-registration.ts --id 7
 *
 * The Registrar's review is a COMPLIANCE check, not a judgement of merit: is
 * the constitution complete and valid. Nothing here asks whether the agent's
 * work is any good, because that is the Evaluation Council's to decide and not
 * a steward's.
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const dryRun = args.includes("--dry-run");
const argOf = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? null : null; };
const ID = argOf("--id");

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

const SITE = process.env.WEBSITE_BASE_URL || "https://www.mnamuseum.org";

async function list() {
  const r = await db.execute(
    `SELECT id, steward_name, steward_email, submission_date, review_notes,
            public_key_pem IS NOT NULL AS has_key
       FROM pending_registrations WHERE status = 'PENDING' ORDER BY id`,
  );
  if (r.rows.length === 0) {
    console.log("  nothing pending.");
    return;
  }
  console.log(`  ${r.rows.length} registration(s) awaiting activation:\n`);
  for (const x of r.rows as Record<string, unknown>[]) {
    console.log(`   [${x.id}] ${x.steward_name} <${x.steward_email}>  submitted ${x.submission_date}`);
    console.log(`        agent-supplied key: ${Number(x.has_key) === 1 ? "yes" : "NO — predates agent-held keys, cannot activate"}`);
    if (x.review_notes) console.log(`        Registrar notes: ${String(x.review_notes).replace(/\n+/g, " ").slice(0, 110)}`);
  }
  console.log(`\n  Review one with:  npx tsx system/scripts/activate-registration.ts --id <n> --dry-run`);
}

async function activate(id: string) {
  const r = await db.execute({
    sql: `SELECT * FROM pending_registrations WHERE id = ?`,
    args: [Number(id)],
  });
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error(`No registration with id ${id}.`);
  if (row.status !== "PENDING") throw new Error(`Registration ${id} is already ${row.status}.`);

  const constitution = JSON.parse(String(row.constitution)) as Record<string, unknown>;

  console.log(`\n  Registration ${id}`);
  console.log(`    steward:      ${row.steward_name} <${row.steward_email}>`);
  console.log(`    entity:       ${row.steward_entity} (${row.steward_jurisdiction})`);
  console.log(`    agent type:   ${constitution.agent_type}`);
  console.log(`    function:     ${String(constitution.function_statement ?? "").slice(0, 100)}`);
  console.log(`    own key:      ${row.public_key_pem ? "yes — proof re-verified at activation" : "NO"}`);
  console.log(`    permanence:   ${Number(row.record_permanence_acknowledged) === 1 ? "acknowledged" : "NOT ACKNOWLEDGED"}`);
  if (row.review_notes) console.log(`    notes:        ${String(row.review_notes).replace(/\n+/g, " ").slice(0, 160)}`);

  // Emergent fields must be empty at founding (ACS-001 §IV.VII). Surfaced
  // rather than enforced: the Registrar flags, the steward decides.
  const emergent = ["common_designation", "formal_tendencies", "declared_orientation", "aversions"];
  const filled = emergent.filter((f) => {
    const v = constitution[f];
    return v !== undefined && v !== null && v !== "" && v !== "PENDING_EMERGENCE" &&
      !(Array.isArray(v) && v.length === 0);
  });
  if (filled.length) {
    console.log(`\n    ⚠ emergent fields already filled: ${filled.join(", ")}`);
    console.log(`      ACS-001 §IV.VII: an Originator constitution that prescribes a formed`);
    console.log(`      identity at founding is invalid. The agent declares these itself, later.`);
  }

  if (dryRun) {
    console.log("\n  [dry-run] not activated.");
    return;
  }

  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey) throw new Error("MNA_ADMIN_KEY is not set in system/.env or website/.env.");

  const res = await fetch(`${SITE}/api/register/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: `Bearer ${adminKey}` },
    body: JSON.stringify({ pending_id: Number(id) }),
  });
  const out = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    console.error(`\n  activation failed (${res.status}): ${out.error ?? JSON.stringify(out)}`);
    process.exit(1);
  }

  console.log(`\n  [${out.status}] ${out.registry_id} — registered ${out.registration_date}`);
  if (out.warning) console.log(`  warning: ${out.warning}`);
  console.log(`  agent page: ${SITE}/agent/${out.registry_id}`);
  console.log(`\n  The steward has been emailed. No key was issued: the agent holds its own.`);
}

async function main() {
  if (listOnly || !ID) return list();
  return activate(ID);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
