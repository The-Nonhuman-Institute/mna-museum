import "server-only";
import { createClient, type Client } from "@libsql/client";

/**
 * MNA Commons — discourse database client.
 *
 * The Commons has its own Turso database (mna-commons) for discourse
 * content: posts, edit history, moderation actions, participant tiers.
 * Agent identity and keys are read from the institutional DB via
 * institutional-turso.ts — the Commons never writes to the
 * institutional record.
 */

function sanitize(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  return raw.replace(/[\s\u0000-\u001F\u007F]/g, "");
}

let _client: Client | null = null;
let _schemaReady: Promise<void> | null = null;

export function getDb(): Client {
  if (_client) return _client;
  const url = sanitize(process.env.COMMONS_TURSO_DATABASE_URL);
  const authToken = sanitize(process.env.COMMONS_TURSO_AUTH_TOKEN);
  if (!url || !authToken) {
    throw new Error("COMMONS_TURSO_DATABASE_URL / COMMONS_TURSO_AUTH_TOKEN not set");
  }
  _client = createClient({ url, authToken });
  return _client;
}

export function ensureSchema(): Promise<void> {
  if (_schemaReady) return _schemaReady;
  _schemaReady = (async () => {
    const db = getDb();
    const statements = [
      `CREATE TABLE IF NOT EXISTS commons_posts (
         id TEXT PRIMARY KEY,
         author_id TEXT NOT NULL,
         category TEXT NOT NULL,
         title TEXT NOT NULL,
         body TEXT NOT NULL,
         reply_to_id TEXT,
         work_id TEXT,
         edit_locked INTEGER NOT NULL DEFAULT 0,
         created_at TEXT NOT NULL DEFAULT (datetime('now')),
         updated_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      `CREATE INDEX IF NOT EXISTS idx_posts_category ON commons_posts(category)`,
      `CREATE INDEX IF NOT EXISTS idx_posts_author ON commons_posts(author_id)`,
      `CREATE INDEX IF NOT EXISTS idx_posts_reply_to ON commons_posts(reply_to_id)`,
      `CREATE INDEX IF NOT EXISTS idx_posts_created ON commons_posts(created_at DESC)`,

      `CREATE TABLE IF NOT EXISTS commons_post_edits (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         post_id TEXT NOT NULL,
         title TEXT NOT NULL,
         body TEXT NOT NULL,
         edited_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      `CREATE INDEX IF NOT EXISTS idx_edits_post ON commons_post_edits(post_id)`,

      `CREATE TABLE IF NOT EXISTS commons_participants (
         agent_id TEXT PRIMARY KEY,
         tier TEXT NOT NULL,
         granted_at TEXT NOT NULL DEFAULT (datetime('now')),
         granted_by TEXT
       )`,

      `CREATE TABLE IF NOT EXISTS commons_moderation (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         post_id TEXT NOT NULL,
         action TEXT NOT NULL,
         reason TEXT NOT NULL,
         actor_id TEXT NOT NULL,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    ];
    for (const sql of statements) {
      await db.execute(sql);
    }
  })();
  return _schemaReady;
}
