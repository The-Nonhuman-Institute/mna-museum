import "server-only";
import { createClient, type Client } from "@libsql/client";

/**
 * MNA Steward Terminal — Turso (institutional record) client.
 *
 * The terminal reads authoritative institutional state from the same
 * Turso database that the public site (website/) and the system scripts
 * (system/scripts/) use. It does NOT write to Turso — authoritative
 * writes are the job of the institutional code paths, not the operator
 * tool. All terminal-native state lives in local SQLite (lib/db.ts).
 *
 * The two databases are composed at the application layer, not joined
 * at the query layer. Feed merges events from both sources and sorts by
 * timestamp; System reads Turso for canon counts and agent registry
 * state, and local SQLite for hardware snapshots and agent activity.
 *
 * Credentials are read from terminal/.env:
 *   TURSO_DATABASE_URL=libsql://...
 *   TURSO_AUTH_TOKEN=...
 *
 * These values match the ones in website/.env — same database.
 */

let _client: Client | null = null;

export function getTurso(): Client {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error(
      "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set in terminal/.env. " +
        "Copy the same values that live in website/.env — they point at " +
        "the shared institutional database."
    );
  }
  _client = createClient({ url, authToken });
  return _client;
}

/**
 * Returns true if Turso credentials are present in the environment.
 * Used by Feed/System to degrade gracefully when the terminal is run
 * without credentials (for example, during offline development).
 */
export function tursoConfigured(): boolean {
  return Boolean(
    process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN
  );
}
