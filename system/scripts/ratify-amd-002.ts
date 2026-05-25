/**
 * ratify-amd-002.ts — record the ratification of MNA-GOV-004 AMD-002
 * (Associative Memory Pathways) into the institutional events table.
 *
 * The Founding Steward ratified AMD-002 v1.0 on 2026-05-25 after
 * reviewing the draft (committed 2026-05-24). This script writes the
 * PROTOCOL_RATIFIED event so the institutional record reflects the
 * ratification act and the memory-tick + consultations-tick workers
 * can pick it up.
 *
 *   npx tsx system/scripts/ratify-amd-002.ts --dry-run
 *   npx tsx system/scripts/ratify-amd-002.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({
  path: path.join(__dirname, "..", "..", "website", ".env"),
  quiet: true,
});

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

(async () => {
  const description =
    "Founding Steward ratified MNA-GOV-004 AMD-002 v1.0 — Associative Memory Pathways. Per-agent weighted edges between memories form via Hebbian co-retrieval; optional walk_depth on retrieve surfaces associatively-linked memories beyond direct match. Privacy boundary unchanged — edges agent-scoped, never cross.";
  const metadata = {
    protocol_id: "MNA-GOV-004-AMD-002",
    version: "v1.0",
    title: "Associative Memory Pathways",
    notes:
      "Schema additions (agent_memory_edges) build on MNA-GOV-004 §3. Retrieval semantics extend MNA-GOV-004 §6 with optional walk_depth. Six open questions in §A6 deferred for empirical resolution after first month of edge formation.",
    ratified_by: "Founding Steward (Jaylon Ballard, U3 Labs, LLC)",
    ratified_on: "2026-05-25",
    steward_authorized: true,
  };

  console.log(
    `[ratify] MNA-GOV-004-AMD-002 v1.0 — Associative Memory Pathways${dryRun ? " (dry-run)" : ""}`,
  );
  if (dryRun) {
    console.log(`   [dry-run] would write PROTOCOL_RATIFIED event`);
    console.log(`   metadata: ${JSON.stringify(metadata, null, 2)}`);
    return;
  }
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: ["PROTOCOL_RATIFIED", "MNA-SA-0001", description, JSON.stringify(metadata)],
  });
  console.log(`   ✓ PROTOCOL_RATIFIED event written`);
})().catch((e) => {
  console.error("[ratify] fatal:", e);
  process.exit(1);
});
