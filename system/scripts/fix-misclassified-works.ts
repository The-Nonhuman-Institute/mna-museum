/**
 * Repair works mis-classified as text during the 2026-05-16 round.
 *
 * Root cause: in originate-turso.ts the title extractor stripped a
 * leading "title-line + blank" pair off the payload BEFORE the format
 * detector saw the actual body. detectFormat ran on the title (plain
 * text) and stamped the work as `output_type='text'`. The HTML body
 * was then stored under a text classification, so the renderer
 * presented raw source instead of rendering it.
 *
 * Affected: MNA-OR-0002-W-0022 ("Twelve Intervals"), MNA-OR-0008-W-0011
 * ("Drift"). Both payloads ARE valid HTML — the title prefix was
 * already stripped, the payload is intact, only the classification is
 * wrong.
 *
 * This script:
 *  - Verifies the payload starts with <!DOCTYPE or <html (sanity check)
 *  - Updates works.output_type = 'html-css'
 *  - Updates works.medium = 'html-css'
 *  - Updates works.display_aspect = 1.0 (unchanged from old)
 *  - Leaves title and body intact
 *
 * After running, regenerate previews for the affected works.
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const TARGETS = ["MNA-OR-0002-W-0022", "MNA-OR-0008-W-0011"];
const dryRun = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  for (const id of TARGETS) {
    const r = await db.execute({
      sql: "SELECT id, output_type, medium, output_payload, title FROM works WHERE id = ?",
      args: [id],
    });
    if (r.rows.length === 0) {
      console.log(`  ${id}: not found, skipping`);
      continue;
    }
    const row = r.rows[0];
    const payload = (row.output_payload as string).trim();
    if (!(payload.startsWith("<!DOCTYPE") || payload.startsWith("<html"))) {
      console.log(`  ${id}: payload doesn't look like HTML, skipping (head: ${payload.slice(0, 60)})`);
      continue;
    }
    if (row.output_type === "html-css") {
      console.log(`  ${id}: already html-css, no change`);
      continue;
    }
    console.log(`  ${id}: text → html-css (title="${row.title || "—"}")`);
    if (dryRun) continue;
    await db.execute({
      sql: "UPDATE works SET output_type = 'html-css', medium = 'html-css' WHERE id = ?",
      args: [id],
    });
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, work_id, description, metadata)
              VALUES ('WORK_RECLASSIFIED', (SELECT originator_id FROM works WHERE id = ?), ?, ?, ?)`,
      args: [
        id,
        id,
        `${id} reclassified from text → html-css. Cause: title-extraction bug in originate-turso.ts during 2026-05-16 round caused detectFormat to run on the title string instead of the document body.`,
        JSON.stringify({ from: "text", to: "html-css", round_date: "2026-05-16" }),
      ],
    });
  }

  console.log("\n[fix-misclassified-works] complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
