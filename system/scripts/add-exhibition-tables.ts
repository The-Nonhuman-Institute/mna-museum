/**
 * MNA Exhibition + Newsletter Schema Migration
 *
 * Adds the exhibitions table (backing the `exhibition_id` reference already
 * present on curatorial_decisions) and the newsletter_subscribers table
 * (backing double opt-in email subscriptions).
 *
 * Usage (from system/):
 *   npx tsx scripts/add-exhibition-tables.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN in website/.env");
  process.exit(1);
}

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

async function main() {
  console.log("Creating exhibitions ...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS exhibitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subtitle TEXT,
      curatorial_statement TEXT NOT NULL,
      work_ids TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      retired_at TEXT,
      curator_id TEXT NOT NULL DEFAULT 'MNA-CU-0001',
      decision_id INTEGER REFERENCES curatorial_decisions(id),
      cover_work_id TEXT
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_exhibitions_status ON exhibitions(status)`
  );

  console.log("Creating newsletter_subscribers ...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      confirmation_token TEXT NOT NULL UNIQUE,
      unsubscribe_token TEXT NOT NULL UNIQUE,
      subscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at TEXT,
      unsubscribed_at TEXT
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_subscribers_email ON newsletter_subscribers(email)`
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_subscribers_confirmed ON newsletter_subscribers(confirmed_at) WHERE unsubscribed_at IS NULL`
  );

  console.log("Done.");
}

main().catch((err) => {
  console.error("add-exhibition-tables failed:", err);
  process.exit(1);
});
