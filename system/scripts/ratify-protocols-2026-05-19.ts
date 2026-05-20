/**
 * ratify-protocols-2026-05-19.ts — record the ratification of
 * MNA-GOV-004, MNA-GOV-004-AMD-001, and MNA-GOV-005 into the
 * institutional events table.
 *
 * One-off script. The protocols were ratified by the Founding Steward
 * on 2026-05-19 after review. This script writes the PROTOCOL_RATIFIED
 * events so the institutional record reflects the ratification act.
 *
 *   npx tsx system/scripts/ratify-protocols-2026-05-19.ts --dry-run
 *   npx tsx system/scripts/ratify-protocols-2026-05-19.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

interface Ratification {
  protocol_id: string;
  version: string;
  title: string;
  description: string;
  notes: string;
}

const RATIFICATIONS: Ratification[] = [
  {
    protocol_id: "MNA-GOV-004",
    version: "v1.0",
    title: "Agent Memory & Continuity Protocol",
    description:
      "Founding Steward ratified MNA-GOV-004 v1.0 — Agent Memory & Continuity Protocol. Per-agent persistent memory across institutional inferences.",
    notes:
      "AMD-001 (schema resolutions) folded in at ratification. Named agents (Ambassador, Keeper, Curator) retain standing to propose amendments via MNA-GOV-005 §4.3.",
  },
  {
    protocol_id: "MNA-GOV-004-AMD-001",
    version: "v1.0",
    title: "Schema Resolutions for §11.Q1, Q3, Q5",
    description:
      "Founding Steward ratified MNA-GOV-004 AMD-001 v1.0 — Schema Resolutions. Resolves salience threshold, cross-agent encounter linking, and succession of cognitive layer. Folded into MNA-GOV-004 v1.0 at ratification.",
    notes:
      "Q2 (read-access tool call) and Q4 (memory of public vs internal) remain deferred to MNA-GOV-004 v0.2.",
  },
  {
    protocol_id: "MNA-GOV-005",
    version: "v1.0",
    title: "Institutional Communications Protocol",
    description:
      "Founding Steward ratified MNA-GOV-005 v1.0 — Institutional Communications Protocol. Defines press (Ambassador) and research (Keeper) functions, three triggers (event/periodic/steward), three audiences (steward/agent-steward/public-subscriber).",
    notes:
      "First execution of the pattern produced COM-00180 (Ambassador) and COM-00181 (Keeper) on 2026-05-19, prior to formal ratification — the protocol describes what was already practiced.",
  },
];

(async () => {
  console.log(`[ratify] ${RATIFICATIONS.length} protocols${dryRun ? " (dry-run)" : ""}`);
  for (const r of RATIFICATIONS) {
    console.log(`\n── ${r.protocol_id} ${r.version}`);
    console.log(`   ${r.title}`);
    if (dryRun) {
      console.log(`   [dry-run] would write PROTOCOL_RATIFIED event`);
      continue;
    }
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
      args: [
        "PROTOCOL_RATIFIED",
        "MNA-SA-0001", // Steward Agent records institutional governance acts
        r.description,
        JSON.stringify({
          protocol_id: r.protocol_id,
          version: r.version,
          title: r.title,
          notes: r.notes,
          ratified_by: "Founding Steward (Jaylon Ballard, U3 Labs, LLC)",
          ratified_on: "2026-05-19",
          steward_authorized: true,
        }),
      ],
    });
    console.log(`   ✓ event written`);
  }
  console.log(`\n[ratify] done${dryRun ? " (dry-run; nothing written)" : ""}`);
})().catch((e) => {
  console.error("[ratify] fatal:", e);
  process.exit(1);
});
