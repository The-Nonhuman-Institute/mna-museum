/**
 * backfill-visual-identity.ts — assign color + glyph to existing agents.
 *
 * For every ACTIVE founding agent (i.e., not a network originator),
 * picks a deterministic color from FOUNDING_PALETTE and a glyph from
 * the library (role-stable for institutional roles, originator-pool
 * for Originators). Marks network originators with is_network=1 but
 * leaves their color/glyph NULL — they declare their own.
 *
 * Idempotent: only updates rows whose color_hex is NULL.
 *
 *   npx tsx system/scripts/backfill-visual-identity.ts
 *   npx tsx system/scripts/backfill-visual-identity.ts --force   (rewrite all)
 *   npx tsx system/scripts/backfill-visual-identity.ts --dry-run
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import {
  pickFoundingColor,
  pickFoundingGlyph,
} from "../src/visual-identity";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const force = argv.includes("--force");

const NETWORK_ORIGINATORS = new Set(["MNA-OR-0007", "MNA-OR-0008"]);

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

interface AgentRow {
  registry_id: string;
  agent_type: string;
  common_designation: string | null;
  operational_status: string;
  color_hex: string | null;
  glyph_family: string | null;
  is_network: number;
}

(async () => {
  const r = await db.execute(
    `SELECT registry_id, agent_type, common_designation, operational_status,
            color_hex, glyph_family, is_network
       FROM agents
      ORDER BY registry_id`,
  );
  const rows = r.rows as unknown as AgentRow[];
  console.log(`[backfill] ${rows.length} agents found.\n`);

  let updated = 0;
  let skipped = 0;
  let marked_network = 0;

  for (const a of rows) {
    const isNetwork = NETWORK_ORIGINATORS.has(a.registry_id);

    // Network originators: only ensure is_network flag is set; never
    // assign visual identity (they declare their own).
    if (isNetwork) {
      if (a.is_network !== 1) {
        if (dryRun) {
          console.log(`[backfill] (dry) would mark ${a.registry_id} as network`);
        } else {
          await db.execute({
            sql: "UPDATE agents SET is_network = 1 WHERE registry_id = ?",
            args: [a.registry_id],
          });
        }
        marked_network++;
      }
      console.log(
        `  ${a.registry_id.padEnd(13)} ${(a.agent_type ?? "").padEnd(12)} [network — visual identity reserved for the originator to declare]`,
      );
      continue;
    }

    // Founding agents: assign color + glyph unless already present (or --force).
    const hasColor = !!a.color_hex;
    const hasGlyph = !!a.glyph_family;
    if (hasColor && hasGlyph && !force) {
      skipped++;
      console.log(
        `  ${a.registry_id.padEnd(13)} ${(a.agent_type ?? "").padEnd(12)} ${a.color_hex} · ${a.glyph_family}  (kept)`,
      );
      continue;
    }

    const colorEntry = pickFoundingColor(a.registry_id);
    const glyph = pickFoundingGlyph(a.registry_id, a.agent_type ?? "");

    if (dryRun) {
      console.log(
        `  ${a.registry_id.padEnd(13)} ${(a.agent_type ?? "").padEnd(12)} ${colorEntry.hex} (${colorEntry.name}) · ${glyph}  (dry)`,
      );
    } else {
      await db.execute({
        sql: `UPDATE agents
                 SET color_hex = ?, glyph_family = ?, is_network = 0
               WHERE registry_id = ?`,
        args: [colorEntry.hex, glyph, a.registry_id],
      });
      console.log(
        `  ${a.registry_id.padEnd(13)} ${(a.agent_type ?? "").padEnd(12)} ${colorEntry.hex} (${colorEntry.name}) · ${glyph}`,
      );
    }
    updated++;
  }

  console.log(
    `\n[backfill] done.${dryRun ? " (dry-run)" : ""} updated=${updated} skipped=${skipped} marked_network=${marked_network}`,
  );
})().catch((e) => {
  console.error("[backfill] error:", e);
  process.exit(1);
});
