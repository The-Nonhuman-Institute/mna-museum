/**
 * migrate-safe-render-payload.ts — add the safe_render_payload column
 * to works (Conservator recovery storage).
 *
 * Original output_payload remains sacred and untouched. The Conservator
 * may write a safe-render version alongside it when the original is
 * known to be malformed (truncated SVG, unclosed JSON, etc.). Display
 * renderers prefer safe_render_payload when set, fall back to
 * output_payload otherwise.
 *
 * Idempotent — re-runnable. SQLite doesn't support IF NOT EXISTS on
 * ADD COLUMN, so we swallow the duplicate-column error.
 *
 *   npx tsx system/scripts/migrate-safe-render-payload.ts --dry-run
 *   npx tsx system/scripts/migrate-safe-render-payload.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({
  path: path.join(__dirname, "..", "..", "website", ".env"),
  quiet: true,
});

const dryRun = process.argv.includes("--dry-run");

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

(async () => {
  const ddl = "ALTER TABLE works ADD COLUMN safe_render_payload TEXT";
  console.log(`migrate-safe-render-payload${dryRun ? " (dry-run)" : ""}`);
  if (dryRun) {
    console.log(`  would run: ${ddl}`);
    return;
  }
  try {
    await db.execute(ddl);
    console.log(`  ✓ column added`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate column name/i.test(msg)) {
      console.log(`  · column already exists — no-op`);
    } else {
      throw err;
    }
  }
  const cols = await db.execute("PRAGMA table_info(works)");
  const present = cols.rows.some(
    (r) => (r as Record<string, unknown>).name === "safe_render_payload",
  );
  console.log(`\nworks.safe_render_payload present: ${present}`);
})().catch((e) => {
  console.error("[migrate] fatal:", e);
  process.exit(1);
});
