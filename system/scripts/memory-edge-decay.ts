/**
 * memory-edge-decay.ts — weekly edge maintenance (MNA-GOV-004 AMD-002 §A2).
 *
 * Decays edge weights based on time since last strengthening:
 *
 *     w' = w × exp(-days_since_last_strengthened / 180)
 *
 * 180-day half-life-ish (true half-life is 180 × ln(2) ≈ 125 days).
 * Edges that haven't been reinforced fade. Anything below 0.05 is
 * deleted — the table stays bounded and the strong pathways
 * dominate retrieval.
 *
 * Idempotent at the day level: running twice in the same week applies
 * decay twice based on each row's last_strengthened_at, which doesn't
 * change unless a retrieve strengthens it. So extra runs slightly
 * over-decay edges that aren't being reinforced — acceptable, but the
 * GHA workflow schedules this once a week.
 *
 *   npx tsx system/scripts/memory-edge-decay.ts --dry-run
 *   npx tsx system/scripts/memory-edge-decay.ts
 *   npx tsx system/scripts/memory-edge-decay.ts --prune-only
 *   npx tsx system/scripts/memory-edge-decay.ts --tau-days 90
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
function flag(name: string): boolean {
  return argv.includes(`--${name}`);
}
function arg(name: string): string | null {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

const dryRun = flag("dry-run");
const pruneOnly = flag("prune-only");
const tauDaysStr = arg("tau-days");
const TAU_DAYS = tauDaysStr ? Number(tauDaysStr) : 180;
const PRUNE_THRESHOLD = 0.05;

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

(async () => {
  console.log(
    `memory-edge-decay — mode: ${dryRun ? "DRY RUN" : "WRITE"}, tau=${TAU_DAYS}d, prune<${PRUNE_THRESHOLD}`,
  );

  // Pre-state
  const pre = await db.execute(
    `SELECT COUNT(*) AS total,
            AVG(weight) AS mean_w,
            MAX(weight) AS max_w,
            MIN(weight) AS min_w
       FROM agent_memory_edges`,
  );
  const preRow = pre.rows[0] as Record<string, unknown>;
  console.log(
    `pre:  total=${preRow.total}  mean_w=${Number(preRow.mean_w ?? 0).toFixed(4)}  range=[${Number(preRow.min_w ?? 0).toFixed(4)}, ${Number(preRow.max_w ?? 0).toFixed(4)}]`,
  );

  if (!pruneOnly) {
    // Apply decay in-place. SQLite supports exp/ln via the math
    // functions extension; libsql does. Use julianday for date arith.
    const sql = `
      UPDATE agent_memory_edges
         SET weight = weight * exp(-((julianday('now') - julianday(last_strengthened_at)) / ?))
    `;
    if (dryRun) {
      console.log("[decay] dry-run — would apply decay UPDATE to all rows");
    } else {
      await db.execute({ sql, args: [TAU_DAYS] });
    }
  }

  // Prune
  if (dryRun) {
    const r = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM agent_memory_edges
              WHERE weight * exp(-((julianday('now') - julianday(last_strengthened_at)) / ?)) < ?`,
      args: [TAU_DAYS, PRUNE_THRESHOLD],
    });
    console.log(`[prune] dry-run — would delete ${r.rows[0].n} rows below ${PRUNE_THRESHOLD}`);
  } else {
    const r = await db.execute({
      sql: `DELETE FROM agent_memory_edges WHERE weight < ?`,
      args: [PRUNE_THRESHOLD],
    });
    console.log(`[prune] deleted ${r.rowsAffected} rows below ${PRUNE_THRESHOLD}`);
  }

  // Post-state
  const post = await db.execute(
    `SELECT COUNT(*) AS total,
            AVG(weight) AS mean_w,
            MAX(weight) AS max_w,
            MIN(weight) AS min_w
       FROM agent_memory_edges`,
  );
  const postRow = post.rows[0] as Record<string, unknown>;
  console.log(
    `post: total=${postRow.total}  mean_w=${Number(postRow.mean_w ?? 0).toFixed(4)}  range=[${Number(postRow.min_w ?? 0).toFixed(4)}, ${Number(postRow.max_w ?? 0).toFixed(4)}]`,
  );
  if (dryRun) console.log("\nDRY RUN — no writes. Re-run without --dry-run.");
})().catch((e) => {
  console.error("[memory-edge-decay] fatal:", e);
  process.exit(1);
});
