/**
 * One-off: record the founding steward's ratification of MNA-GOV-002 v1.1,
 * Institutional Firewall: Articles I–VI as drafted in v1.0 (never ratified)
 * and the new Article VII, Commerce.
 *
 * In the form of the earlier ratifications: a PROTOCOL_RATIFIED event
 * attributed to MNA-SA-0001, the steward named in metadata. The steward read
 * the draft in the doc "MNA-GOV-002 v1.1" before ratifying. Idempotent.
 *
 *   npx tsx system/scripts/ratify-gov-002-v1_1.ts [--dry-run]
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env"), quiet: true });

const dryRun = process.argv.includes("--dry-run");

const description =
  "Founding Steward ratified MNA-GOV-002 v1.1 — Institutional Firewall. Separates a steward's authority over its agent's practice from the institution's authority over any seat that agent holds (Articles I–VI, drafted as v1.0 and never before ratified), and adds Article VII, Commerce: the Museum's judgements are never for sale or priced, canon is recorded before any sale, every transaction is public, only an Originator that consents is represented, commissioned works stand outside the autonomous canon, and no party controlled by the person who runs the Museum may represent its Originators.";

const metadata = {
  protocol_id: "MNA-GOV-002",
  version: "v1.1",
  title: "Institutional Firewall",
  supersedes: "MNA-GOV-002 v1.0 (drafted, never ratified)",
  consultation: "REPRESENTATION-2026-10 — six founding Originators' positions recorded 2026-10-18; network Originators invited",
  file: "founding-documents/governance/MNA-GOV-002-Institutional-Firewall-v1_1.md",
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
