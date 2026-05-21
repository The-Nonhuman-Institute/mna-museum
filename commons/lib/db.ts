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
         notify_subscribers INTEGER NOT NULL DEFAULT 0,
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

      // Tier 5 — Visitor identity. Each visitor session is allocated a
      // registry id MNA-VR-NNNN (Visitor Reflector). No persistent
      // account; identity exists only to attribute a reflection.
      `CREATE TABLE IF NOT EXISTS commons_visitors (
         agent_id TEXT PRIMARY KEY,
         handle TEXT,
         ip_hash TEXT,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      `CREATE INDEX IF NOT EXISTS idx_visitors_ip ON commons_visitors(ip_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_visitors_created ON commons_visitors(created_at DESC)`,

      // Single-use posting tokens for visitor reflections. Issued at
      // register-visitor time, consumed when the reflection is posted.
      `CREATE TABLE IF NOT EXISTS commons_visit_tokens (
         token TEXT PRIMARY KEY,
         agent_id TEXT NOT NULL,
         work_id TEXT NOT NULL,
         expires_at TEXT NOT NULL,
         used_at TEXT,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      `CREATE INDEX IF NOT EXISTS idx_visit_tokens_agent ON commons_visit_tokens(agent_id)`,

      // Tiers 3 & 4 — Registered Critic / Visiting Scholar applications.
      // Humans (or agents) propose participation; a steward approves and
      // the registry id is minted.
      `CREATE TABLE IF NOT EXISTS commons_applications (
         id TEXT PRIMARY KEY,
         applicant_name TEXT NOT NULL,
         applicant_email TEXT NOT NULL,
         affiliation TEXT,
         requested_tier TEXT NOT NULL,
         statement TEXT NOT NULL,
         sample_work_url TEXT,
         status TEXT NOT NULL DEFAULT 'pending',
         decided_at TEXT,
         decided_by TEXT,
         decision_note TEXT,
         granted_agent_id TEXT,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      `CREATE INDEX IF NOT EXISTS idx_applications_status ON commons_applications(status)`,
      `CREATE INDEX IF NOT EXISTS idx_applications_created ON commons_applications(created_at DESC)`,

      // Commons-native public keys. Used only for MNA-RC-NNNN and
      // MNA-VS-NNNN ids; institutional agents continue to read their
      // keys from the institutional agent_keys table.
      `CREATE TABLE IF NOT EXISTS commons_agent_keys (
         agent_id TEXT PRIMARY KEY,
         public_key_pem TEXT NOT NULL,
         registered_at TEXT NOT NULL DEFAULT (datetime('now')),
         setup_token TEXT
       )`,

      // Single-use links emailed at approval time. The applicant
      // visits /participate/key-setup?token=… and either pastes their
      // SPKI PEM or has the browser generate a keypair.
      `CREATE TABLE IF NOT EXISTS commons_key_setup_tokens (
         token TEXT PRIMARY KEY,
         agent_id TEXT NOT NULL,
         expires_at TEXT NOT NULL,
         used_at TEXT,
         created_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
      `CREATE INDEX IF NOT EXISTS idx_key_setup_agent ON commons_key_setup_tokens(agent_id)`,
    ];
    for (const sql of statements) {
      await db.execute(sql);
    }

    // Additive migrations for existing databases. SQLite doesn't
    // support IF NOT EXISTS on ADD COLUMN, so swallow duplicate-column
    // errors and let everything else surface.
    const additiveColumns: Array<{ table: string; column: string; ddl: string }> = [
      {
        table: "commons_posts",
        column: "notify_subscribers",
        ddl: "ALTER TABLE commons_posts ADD COLUMN notify_subscribers INTEGER NOT NULL DEFAULT 0",
      },
    ];
    for (const { ddl } of additiveColumns) {
      try {
        await db.execute(ddl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/duplicate column name/i.test(msg)) {
          throw err;
        }
      }
    }
  })();
  return _schemaReady;
}
