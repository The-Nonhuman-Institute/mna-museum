/**
 * Conservator sweep — institutional entry point for MNA-CV-0001's render integrity check.
 *
 * The Conservator's function (per its constitution) is to ensure every canonized
 * work in the institution is rendered correctly and visible. This script
 * implements that function as a manual sweep until the Conservator agent's
 * reasoning loop is wired in.
 *
 * What it does:
 * 1. Queries Turso for ALL works (canon, rejected, submitted, in-review)
 * 2. Identifies works missing preview PNGs
 * 3. Renders the missing previews via Puppeteer
 * 4. Updates render_status records in Turso (when the table exists)
 * 5. Reports a summary of the integrity state
 *
 * Usage:
 *   npx tsx scripts/conservator-sweep.ts                    # full sweep
 *   npx tsx scripts/conservator-sweep.ts --force            # regenerate ALL previews
 *   npx tsx scripts/conservator-sweep.ts --work <id>        # single work
 *   npx tsx scripts/conservator-sweep.ts --report-only      # check, don't render
 *
 * After Mac Studio: this runs on a system cron / launchd job. For now: manual.
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import puppeteer from "puppeteer";
import { renderWork } from "./generate-work-previews";

dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const PREVIEW_DIR = path.join(__dirname, "..", "..", "website", "public", "previews");
const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing Turso credentials");
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const reportOnly = args.includes("--report-only");
const singleWorkIndex = args.indexOf("--work");
const singleWorkId = singleWorkIndex >= 0 ? args[singleWorkIndex + 1] : null;

interface WorkRow {
  id: string;
  output_type: string;
  status: string | null;
}

async function recordRenderStatus(
  db: ReturnType<typeof createClient>,
  workId: string,
  outputType: string,
  status: "OK" | "BROKEN",
  errorMessage?: string,
): Promise<void> {
  // Best-effort: update render_status table if it exists
  try {
    await db.execute({
      sql: `INSERT INTO render_status (work_id, output_type, status, error_message, recovery_applied, last_checked)
            VALUES (?, ?, ?, ?, NULL, datetime('now'))
            ON CONFLICT(work_id, output_type)
            DO UPDATE SET status = excluded.status, error_message = excluded.error_message, last_checked = datetime('now')`,
      args: [workId, outputType, status, errorMessage || null],
    });
  } catch {
    // render_status table may not exist in older databases — silently skip
  }
}

async function main() {
  console.log("[Conservator] Beginning render integrity sweep...");

  const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  // Query works
  let works: WorkRow[];
  if (singleWorkId) {
    const r = await db.execute({
      sql: `SELECT w.id, w.output_type, cs.status
            FROM works w
            LEFT JOIN canon_status cs ON w.id = cs.work_id
            WHERE w.id = ?`,
      args: [singleWorkId],
    });
    if (r.rows.length === 0) {
      console.error(`Work ${singleWorkId} not found`);
      process.exit(1);
    }
    works = r.rows.map((row) => ({
      id: row.id as string,
      output_type: row.output_type as string,
      status: (row.status as string) || null,
    }));
  } else {
    const r = await db.execute(
      `SELECT w.id, w.output_type, cs.status
       FROM works w
       LEFT JOIN canon_status cs ON w.id = cs.work_id
       ORDER BY w.id`
    );
    works = r.rows.map((row) => ({
      id: row.id as string,
      output_type: row.output_type as string,
      status: (row.status as string) || null,
    }));
  }

  // Identify which need rendering
  const existing = new Set(fs.readdirSync(PREVIEW_DIR));
  const missing = works.filter((w) => !existing.has(`${w.id}.png`));
  const present = works.filter((w) => existing.has(`${w.id}.png`));

  // Status summary
  const byStatus: Record<string, number> = {};
  for (const w of works) {
    const s = w.status || "SUBMITTED";
    byStatus[s] = (byStatus[s] || 0) + 1;
  }

  console.log(`\n[Conservator] Collection state:`);
  console.log(`  Total works in institutional record: ${works.length}`);
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`    ${status}: ${count}`);
  }
  console.log(`  Previews present: ${present.length}`);
  console.log(`  Previews missing: ${missing.length}`);

  if (reportOnly) {
    if (missing.length > 0) {
      console.log(`\n[Conservator] Missing previews:`);
      for (const w of missing) {
        console.log(`  - ${w.id} (${w.output_type}, ${w.status || "SUBMITTED"})`);
      }
    }
    console.log(`\n[Conservator] Report-only mode. No rendering performed.`);
    return;
  }

  const toRender = force ? works : missing;
  if (toRender.length === 0) {
    console.log(`\n[Conservator] All previews up to date. No action needed.`);
    return;
  }

  console.log(`\n[Conservator] Rendering ${toRender.length} preview(s)...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let success = 0;
  let failed = 0;

  for (const work of toRender) {
    const result = await renderWork(browser, work.id, work.output_type);
    if (result.ok) {
      success++;
      console.log(`  ✓ ${work.id} (${work.output_type})`);
      await recordRenderStatus(db, work.id, work.output_type, "OK");
    } else {
      failed++;
      console.error(`  ✗ ${work.id} (${work.output_type}): ${result.error}`);
      await recordRenderStatus(db, work.id, work.output_type, "BROKEN", result.error);
    }
  }

  await browser.close();

  console.log(`\n[Conservator] Sweep complete.`);
  console.log(`  Rendered: ${success}`);
  console.log(`  Failed:   ${failed}`);
  if (failed > 0) {
    console.log(`\n  ⚠ ${failed} works flagged BROKEN in render_status. Investigate via:`);
    console.log(`    GET https://mnamuseum.org/api/conservator/render-status?status=BROKEN`);
  }
}

main().catch((err) => {
  console.error("[Conservator] Fatal:", err);
  process.exit(1);
});
