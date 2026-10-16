/**
 * One-off: record the founding steward's ratification of MNA-OPS-001 v1.0, the
 * Institutional Operations Handbook, on 2026-10-16.
 *
 * In the form of the earlier ratifications (ratify-amd-002.ts): a
 * PROTOCOL_RATIFIED event attributed to MNA-SA-0001, the steward named in
 * metadata. The steward read a summary (the doc "MNA-OPS-001 Ratification
 * Summary") before ratifying. Idempotent: refuses a second ratification of the
 * same protocol and version.
 *
 *   npx tsx system/scripts/ratify-ops-001.ts [--dry-run]
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const dryRun = process.argv.includes("--dry-run");

const description =
  "Founding Steward ratified MNA-OPS-001 v1.0 — Institutional Operations Handbook. Governs the running of the institution, never the making or judging of works: the definition of done (§III), the standing prohibitions on operations (§IV), and the scheduled round of eighteen checks (§V), which repairs only what it is permitted to and writes to the steward only when it cannot.";

const metadata = {
  protocol_id: "MNA-OPS-001",
  version: "v1.0",
  title: "Institutional Operations Handbook",
  notes:
    "Drafted 2026-08-26 and enforced from then by the scheduled ops round and by contract tests in CI, before ratification. Amended in October 2026 with the A2 steward-reviewed list, B3 (works stalled in review), B4 (divided cases due a third deliberation), held works in B1, a rewritten D2 and a stricter E2. §VIII — whether operations is carried by constituted agents or remains scheduled code — is left open, reserved to the steward. Standing authorities ratified with it: the round convenes the Evaluation Council on a schedule (B1, B4) without choosing any verdict, and sends Notices of Accession to Originators' stewards (C1).",
  ratified_by: "Founding Steward (Jaylon Ballard, U3 Labs, LLC)",
  ratified_on: "2026-10-16",
  steward_authorized: true,
};

(async () => {
  const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });
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
