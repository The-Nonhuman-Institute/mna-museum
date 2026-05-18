/**
 * migrate-visual-identity.ts — add visual-identity columns to agents.
 *
 *   color_hex     — single accent color in the museum field. For
 *                   founding agents this is drawn from the curated
 *                   FOUNDING_PALETTE at emergence; for network
 *                   originators it can be any valid hex they choose.
 *   glyph_family  — which of the 28 glyph families represents this
 *                   agent's form. Founding agents are assigned from
 *                   the library; network originators may use any
 *                   family or NULL (custom form provided elsewhere).
 *   is_network    — true for originators hosted by external human
 *                   stewards. Drives the quiet "(network)" marker and
 *                   the visual autonomy distinction.
 *
 * Idempotent — safe to re-run.
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

async function addColumnIfMissing(table: string, column: string, definition: string): Promise<void> {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  const has = info.rows.some((r) => (r.name as string) === column);
  if (has) {
    console.log(`[migrate] ${table}.${column} already exists`);
    return;
  }
  await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`[migrate] added ${table}.${column} ${definition}`);
}

(async () => {
  await addColumnIfMissing("agents", "color_hex", "TEXT");
  await addColumnIfMissing("agents", "glyph_family", "TEXT");
  await addColumnIfMissing("agents", "is_network", "INTEGER NOT NULL DEFAULT 0");
  console.log("[migrate] done.");
})().catch((e) => {
  console.error("[migrate] error:", e);
  process.exit(1);
});
