/**
 * resend-activation-notice.ts — tell a steward their agent is live, when the
 * first attempt failed.
 *
 * Activation is not reversible and does not wait on mail. If the confirmation
 * email fails, the agent is registered, its constitution is public, and its
 * steward has been told nothing. Before this existed there was no way to fix
 * that except to hand-write an email, and no way to know it needed fixing —
 * the failure lived in a console line inside a script nobody reads.
 *
 * Activation now records ACTIVATION_NOTICE_SENT or ACTIVATION_NOTICE_FAILED.
 * This clears the second.
 *
 *   npx tsx website/scripts/resend-activation-notice.ts --list
 *   npx tsx website/scripts/resend-activation-notice.ts --agent MNA-OR-0009
 *   npx tsx website/scripts/resend-activation-notice.ts --agent MNA-OR-0009 --to someone@else
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "system", ".env") });

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const argOf = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? null : null; };
const AGENT = argOf("--agent");
const TO = argOf("--to");

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

/** Activated agents whose steward has not been confirmed as told. */
async function owed() {
  const r = await db.execute(
    `SELECT a.registry_id, a.steward_name, a.registration_date,
            (SELECT metadata FROM events e
              WHERE e.agent_id = a.registry_id AND e.event_type = 'ACTIVATION_NOTICE_FAILED'
              ORDER BY e.created_at DESC LIMIT 1) AS failure
       FROM agents a
      WHERE a.agent_type = 'ORIGINATOR'
        AND EXISTS (SELECT 1 FROM events e WHERE e.agent_id = a.registry_id AND e.event_type = 'ACTIVATION_NOTICE_FAILED')
        AND NOT EXISTS (SELECT 1 FROM events e WHERE e.agent_id = a.registry_id AND e.event_type = 'ACTIVATION_NOTICE_SENT')
      ORDER BY a.registry_id`,
  );
  return r.rows as Record<string, unknown>[];
}

async function main() {
  if (listOnly || !AGENT) {
    const rows = await owed();
    if (rows.length === 0) {
      console.log("  no steward is waiting on an activation notice.");
      return;
    }
    console.log(`  ${rows.length} steward(s) never told their agent went live:\n`);
    for (const r of rows) {
      let email = "(unknown)";
      try { email = String(JSON.parse(String(r.failure ?? "{}")).steward_email ?? "(unknown)"); } catch { /* keep unknown */ }
      console.log(`    ${r.registry_id}  ${r.steward_name}  <${email}>  activated ${r.registration_date}`);
    }
    console.log(`\n  Resend with:  npx tsx website/scripts/resend-activation-notice.ts --agent <id>`);
    return;
  }

  // Reuse the website's own sender so the resent notice is byte-identical to
  // the one that failed. A hand-rolled replacement would drift from the real
  // template, and the steward would receive something the institution does not
  // otherwise send.
  const { sendRegistrationConfirmation } = await import("../src/lib/email");

  const a = await db.execute({
    sql: `SELECT a.registry_id, a.steward_name, a.steward_entity, a.steward_jurisdiction,
                 a.autonomy_tier, a.registration_date, ak.public_key_pem, ak.steward_email
            FROM agents a LEFT JOIN agent_keys ak ON ak.registry_id = a.registry_id
           WHERE a.registry_id = ?`,
    args: [AGENT],
  });
  const row = a.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error(`${AGENT} not found.`);

  const to = TO || String(row.steward_email ?? "");
  if (!to) throw new Error(`No steward email on record for ${AGENT}; pass --to.`);

  const site = process.env.WEBSITE_BASE_URL || "https://www.mnamuseum.org";

  console.log(`  resending activation confirmation for ${AGENT} → ${to}`);

  await sendRegistrationConfirmation(to, {
    registryId: String(row.registry_id),
    registrationDate: String(row.registration_date ?? "").slice(0, 10),
    stewardName: String(row.steward_name ?? "Steward"),
    stewardEntity: String(row.steward_entity ?? ""),
    stewardJurisdiction: String(row.steward_jurisdiction ?? ""),
    constitutionVersion: "1.0",
    publicKeyPem: String(row.public_key_pem ?? ""),
    agentPageUrl: `${site}/agent/${row.registry_id}`,
    submissionDocsUrl: `${site}/api`,
    autonomyTier: String(row.autonomy_tier ?? "Tier 1 — Full"),
    reviewScope: "full",
    constitutionHash: "",
  });

  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      "ACTIVATION_NOTICE_SENT",
      String(row.registry_id),
      `${row.registry_id}'s steward was sent the confirmation of activation, after an earlier attempt failed.`,
      JSON.stringify({ steward_email: to, resent: true }),
    ],
  });

  console.log(`  sent, and recorded. The debt is cleared.`);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
