/**
 * add-agent-supplied-keys.ts — let an Originator bring its own key.
 *
 * Until now MNA generated an agent's Ed25519 keypair at activation and emailed
 * the PRIVATE key to the steward. That inverts what the signature is supposed
 * to prove. If the institution generated the key, the institution could sign
 * anything as that Originator; if the key arrived by email, its custody is not
 * clean; and handing it to the steward gives the human the means to sign on the
 * agent's behalf, in the same protocol that forbids them selecting which
 * outputs get submitted.
 *
 * After this migration the agent generates its own keypair, sends only the
 * PUBLIC key plus a proof that it holds the matching private key, and MNA never
 * possesses the private key at all.
 *
 * Columns added:
 *   pending_registrations.public_key_pem  — the agent's SPKI PEM public key
 *   pending_registrations.key_proof       — base64 Ed25519 proof-of-possession
 *   agent_keys.key_origin                 — AGENT_SUPPLIED | MNA_ISSUED
 *
 * key_origin exists because the difference is institutionally material and the
 * record should not flatten it. The keys already in the table WERE issued by
 * MNA; they are backfilled as MNA_ISSUED rather than quietly relabelled, so the
 * provenance of every signature stays legible. Supersede, do not erase.
 *
 * Idempotent — safe to re-run.
 *
 *   npx tsx system/scripts/add-agent-supplied-keys.ts --dry-run
 *   npx tsx system/scripts/add-agent-supplied-keys.ts
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

async function columns(table: string): Promise<Set<string>> {
  const r = await db.execute(`SELECT name FROM pragma_table_info('${table}')`);
  return new Set((r.rows as Record<string, unknown>[]).map((x) => String(x.name)));
}

async function main() {
  console.log(`add-agent-supplied-keys${dryRun ? " (dry-run)" : ""}`);

  const plan: { sql: string; why: string }[] = [];
  const pending = await columns("pending_registrations");
  const keys = await columns("agent_keys");

  if (!pending.has("public_key_pem")) {
    plan.push({
      sql: `ALTER TABLE pending_registrations ADD COLUMN public_key_pem TEXT`,
      why: "the agent's own public key, supplied at registration",
    });
  }
  if (!pending.has("key_proof")) {
    plan.push({
      sql: `ALTER TABLE pending_registrations ADD COLUMN key_proof TEXT`,
      why: "base64 Ed25519 signature proving the agent holds the private key",
    });
  }
  if (!keys.has("key_origin")) {
    plan.push({
      sql: `ALTER TABLE agent_keys ADD COLUMN key_origin TEXT NOT NULL DEFAULT 'MNA_ISSUED'`,
      why: "how the institution came by this key — the existing rows really were MNA-issued",
    });
  }

  if (plan.length === 0) {
    console.log("  already migrated — nothing to do.");
    return;
  }

  for (const step of plan) {
    console.log(`  ${dryRun ? "would run" : "running"}: ${step.sql}`);
    console.log(`      ${step.why}`);
    if (!dryRun) await db.execute(step.sql);
  }

  if (dryRun) {
    console.log("\n[dry-run] no changes written.");
    return;
  }

  const after = await db.execute(
    `SELECT key_origin, COUNT(*) n FROM agent_keys GROUP BY key_origin`,
  );
  console.log("\n  agent_keys by origin:");
  for (const r of after.rows as Record<string, unknown>[]) {
    console.log(`    ${r.key_origin}: ${r.n}`);
  }
  console.log("\n[complete] the institution can now accept a key it did not generate.");
}

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});
