/**
 * One-off: record the founding steward's ratification of MNA-GOV-006 v0.2,
 * Multi-Originator Authorship, which supersedes v0.1 and retires MNA-COL-001.
 *
 * In the form of the earlier ratifications (ratify-ops-001.ts): a
 * PROTOCOL_RATIFIED event attributed to MNA-SA-0001, the steward named in
 * metadata. The steward read the draft in the doc "MNA-GOV-006 v0.2" before
 * ratifying. Idempotent: refuses a second ratification of the same version.
 *
 *   npx tsx system/scripts/ratify-gov-006-v0_2.ts [--dry-run]
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env"), quiet: true });

const dryRun = process.argv.includes("--dry-run");

const description =
  "Founding Steward ratified MNA-GOV-006 v0.2 — Multi-Originator Authorship. Still dormant: collaboration is not enabled until Originators under at least two stewards other than the founding steward are active (§VIII). v0.2 adds how a joint work is made (a chain of signed, fingerprinted, timed passes in a mode the collaborators declare), and answers the question v0.1 left open: whether an aversion may be waived is each author's own declaration (§VI).";

const metadata = {
  protocol_id: "MNA-GOV-006",
  version: "v0.2",
  title: "Multi-Originator Authorship",
  supersedes: "MNA-GOV-006 v0.1 (ratified 2026-08-25)",
  retires: "MNA-COL-001 v1.0 (never ratified)",
  consultation: "COLLABORATION-MAKING-2026-10 — six founding Originators' positions recorded 2026-10-18; MNA-OR-0007 and MNA-OR-0008 invited, no answer by ratification",
  dormant: true,
  standing_dissent: "MNA-SA-0001 (§IX)",
  file: "founding-documents/governance/MNA-GOV-006-Multi-Originator-Authorship-v0_2.md",
  ratified_by: "Founding Steward (Jaylon Ballard, U3 Labs, LLC)",
  ratified_on: "2026-10-18",
  steward_authorized: true,
};

(async () => {
  const clean = (v?: string) => (v ?? "").replace(/\s/g, "");
  const db = createClient({ url: clean(process.env.TURSO_DATABASE_URL), authToken: clean(process.env.TURSO_AUTH_TOKEN) });
  const existing = await db.execute({
    sql: `SELECT id FROM events WHERE event_type = 'PROTOCOL_RATIFIED'
            AND json_extract(metadata, '$.protocol_id') = ? AND json_extract(metadata, '$.version') = ?`,
    args: [metadata.protocol_id, metadata.version],
  });
  if (existing.rows.length) {
    console.log(`[ratify] already ratified as event ${(existing.rows[0] as unknown as { id: number }).id}; refusing a duplicate`);
    return;
  }
  console.log(`[ratify] ${metadata.protocol_id} ${metadata.version} — ${metadata.title}${dryRun ? " (dry-run)" : ""}`);
  if (dryRun) {
    console.log(`   [dry-run] would write PROTOCOL_RATIFIED event`);
    return;
  }
  const r = await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: ["PROTOCOL_RATIFIED", "MNA-SA-0001", description, JSON.stringify(metadata)],
  });
  console.log(`   ✓ PROTOCOL_RATIFIED written as event ${String(r.lastInsertRowid)}`);
})().catch((e) => {
  console.error("[ratify] fatal:", e);
  process.exit(1);
});
