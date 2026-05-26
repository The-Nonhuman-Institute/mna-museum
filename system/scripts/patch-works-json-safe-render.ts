/**
 * patch-works-json-safe-render.ts — one-shot: read safe_render_payload
 * values from Turso for the 11 Conservator-recovered works, write them
 * inline into website/src/data/works.json.
 *
 * Why surgical: the existing export pipeline (system/src/export.ts) runs
 * from a local SQLite file. Updating that file + re-exporting would do
 * the same thing but require us to maintain SQLite/Turso parity for
 * this one column. The works.json patch is the immediate, surgical fix.
 *
 *   npx tsx system/scripts/patch-works-json-safe-render.ts --dry-run
 *   npx tsx system/scripts/patch-works-json-safe-render.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
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

const WORKS_JSON_PATH = path.join(
  __dirname,
  "..",
  "..",
  "website",
  "src",
  "data",
  "works.json",
);

interface WorkRow {
  id: string;
  safe_render_payload?: string | null;
  [key: string]: unknown;
}

(async () => {
  console.log(`patch-works-json-safe-render${dryRun ? " (dry-run)" : ""}`);

  const recovered = await db.execute(
    `SELECT id, safe_render_payload
       FROM works
       WHERE safe_render_payload IS NOT NULL`,
  );
  if (recovered.rows.length === 0) {
    console.log("no works have safe_render_payload set — nothing to patch.");
    return;
  }
  const byId = new Map<string, string>();
  for (const r of recovered.rows) {
    const row = r as unknown as Record<string, unknown>;
    byId.set(String(row.id), String(row.safe_render_payload));
  }
  console.log(`safe_render_payload entries to patch: ${byId.size}`);

  const json = JSON.parse(fs.readFileSync(WORKS_JSON_PATH, "utf8")) as WorkRow[];
  console.log(`works.json entries: ${json.length}`);

  let patched = 0;
  let alreadyPresent = 0;
  for (const w of json) {
    const safe = byId.get(w.id);
    if (!safe) continue;
    if (w.safe_render_payload && w.safe_render_payload === safe) {
      alreadyPresent++;
      continue;
    }
    w.safe_render_payload = safe;
    patched++;
    console.log(`  + ${w.id}`);
  }

  console.log(`\npatched: ${patched}  already present: ${alreadyPresent}`);
  if (dryRun) {
    console.log("DRY RUN — works.json not written.");
    return;
  }
  fs.writeFileSync(WORKS_JSON_PATH, JSON.stringify(json, null, 2) + "\n");
  console.log(`\n✓ wrote ${WORKS_JSON_PATH}`);
})().catch((e) => {
  console.error("[patch] fatal:", e);
  process.exit(1);
});
