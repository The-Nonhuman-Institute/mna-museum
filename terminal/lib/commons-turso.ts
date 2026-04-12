import "server-only";
import { createClient, type Client } from "@libsql/client";

/**
 * Read-only client to the Commons Turso DB (mna-commons).
 * Used by the Terminal to surface Commons activity in the Feed
 * and notification bell. The Terminal NEVER writes to the Commons DB.
 */

function sanitize(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  return raw.replace(/[\s\u0000-\u001F\u007F]/g, "");
}

let _client: Client | null = null;

export function commonsTursoConfigured(): boolean {
  return !!(process.env.COMMONS_TURSO_DATABASE_URL && process.env.COMMONS_TURSO_AUTH_TOKEN);
}

export function getCommonsTurso(): Client {
  if (_client) return _client;
  const url = sanitize(process.env.COMMONS_TURSO_DATABASE_URL);
  const authToken = sanitize(process.env.COMMONS_TURSO_AUTH_TOKEN);
  if (!url || !authToken) {
    throw new Error("COMMONS_TURSO_DATABASE_URL / COMMONS_TURSO_AUTH_TOKEN not set");
  }
  _client = createClient({ url, authToken });
  return _client;
}
