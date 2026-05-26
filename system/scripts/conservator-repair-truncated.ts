/**
 * conservator-repair-truncated.ts — Conservator sweep for known
 * truncated work payloads.
 *
 * Scans the works table for canvas-json / audio-json / svg payloads
 * that are syntactically truncated; for each, computes a safe-render
 * version using bounded close-bracket / close-tag heuristics and
 * writes it to works.safe_render_payload. The original output_payload
 * is preserved untouched (Conservator constitutional rule).
 *
 * One CONSERVATOR_RECOVERY event is written per repaired work, so the
 * institutional record reflects the recovery act and /log surfaces it.
 *
 * Idempotent — works that already have safe_render_payload set are
 * skipped by default. Pass --rewrite to override.
 *
 *   npx tsx system/scripts/conservator-repair-truncated.ts --dry-run
 *   npx tsx system/scripts/conservator-repair-truncated.ts
 *   npx tsx system/scripts/conservator-repair-truncated.ts --rewrite
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import {
  repairPayload,
  isTruncated,
  type RepairFormat,
} from "../src/conservator-repair";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({
  path: path.join(__dirname, "..", "..", "website", ".env"),
  quiet: true,
});

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const rewrite = argv.includes("--rewrite");

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

const REPAIRABLE_TYPES: RepairFormat[] = ["canvas-json", "audio-json", "svg"];

interface WorkRow {
  id: string;
  output_type: string;
  output_payload: string;
  safe_render_payload: string | null;
}

(async () => {
  console.log(
    `conservator-repair-truncated — mode: ${dryRun ? "DRY RUN" : "WRITE"}${rewrite ? " (rewrite)" : ""}`,
  );

  const all = await db.execute({
    sql: `SELECT id, output_type, output_payload, safe_render_payload
            FROM works
           WHERE output_type IN ('canvas-json', 'audio-json', 'svg')`,
  });

  const targets: WorkRow[] = [];
  for (const r of all.rows) {
    const row = r as unknown as Record<string, unknown>;
    const work: WorkRow = {
      id: String(row.id),
      output_type: String(row.output_type),
      output_payload: String(row.output_payload),
      safe_render_payload: (row.safe_render_payload as string | null) ?? null,
    };
    if (!isTruncated(work.output_payload, work.output_type as RepairFormat)) continue;
    if (work.safe_render_payload && !rewrite) continue;
    targets.push(work);
  }

  console.log(`\nfound ${targets.length} works needing repair`);
  if (targets.length === 0) {
    console.log("nothing to do.");
    return;
  }

  let repaired = 0;
  let failed = 0;
  for (const w of targets) {
    const fmt = w.output_type as RepairFormat;
    const result = repairPayload(w.output_payload, fmt);
    console.log(
      `\n${w.id} [${fmt}] ${result.ok ? "✓" : "✗"} ${result.diagnostic}`,
    );
    if (!result.ok) {
      failed++;
      continue;
    }
    console.log(`   bytes_delta: ${result.bytes_delta >= 0 ? "+" : ""}${result.bytes_delta}`);
    if (dryRun) {
      console.log(`   (dry-run, not persisting)`);
      continue;
    }
    await db.execute({
      sql: `UPDATE works SET safe_render_payload = ? WHERE id = ?`,
      args: [result.repaired, w.id],
    });
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, work_id, description, metadata)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        "CONSERVATOR_RECOVERY",
        "MNA-CV-0001",
        w.id,
        `Conservator wrote a safe-render representation for ${w.id} — original payload preserved, rendering now uses bounded recovery.`,
        JSON.stringify({
          work_id: w.id,
          output_type: fmt,
          repair_diagnostic: result.diagnostic,
          bytes_delta: result.bytes_delta,
          original_length: w.output_payload.length,
          safe_render_length: result.repaired.length,
          steward_authorized: true,
        }),
      ],
    });
    repaired++;
    console.log(`   ✓ safe_render_payload stored; CONSERVATOR_RECOVERY event written`);
  }

  console.log(`\n─── summary ───────────────────────────────────────────────`);
  console.log(`  repaired: ${repaired}`);
  console.log(`  failed:   ${failed}`);
  if (dryRun) console.log(`\nDRY RUN — no writes. Re-run without --dry-run.`);
})().catch((e) => {
  console.error("[conservator-repair] fatal:", e);
  process.exit(1);
});
