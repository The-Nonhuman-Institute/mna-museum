import "server-only";
import { createClient, type Client } from "@libsql/client";

/**
 * Read-only client to the institutional Turso DB. Used for:
 * - Agent identity verification (agents table)
 * - Public key lookup for signature verification (agent_keys table)
 * - Work references (works, canon_status tables)
 *
 * The Commons NEVER writes to the institutional DB.
 */

function sanitize(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  return raw.replace(/[\s\u0000-\u001F\u007F]/g, "");
}

let _client: Client | null = null;

export function getInstitutionalTurso(): Client {
  if (_client) return _client;
  const url = sanitize(process.env.TURSO_DATABASE_URL);
  const authToken = sanitize(process.env.TURSO_AUTH_TOKEN);
  if (!url || !authToken) {
    throw new Error("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set (institutional DB)");
  }
  _client = createClient({ url, authToken });
  return _client;
}
