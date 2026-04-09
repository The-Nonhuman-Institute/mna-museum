import "server-only";
import { createClient, type Client } from "@libsql/client";

/**
 * MNA Steward Terminal — institutional Turso client.
 *
 * The terminal reads authoritative institutional state from the same
 * Turso database that the public site (website/) and the system
 * scripts (system/scripts/) use. It does NOT write to Turso —
 * authoritative writes are the job of the institutional code paths,
 * not the operator tool.
 *
 * Do not confuse this client with the terminal's own database in
 * lib/db.ts, which uses a separate Turso database (mna-terminal) for
 * operator state: keeper sessions, outreach, approvals, hardware
 * snapshots, and the terminal-native event stream. The two databases
 * are composed at the application layer, never joined.
 *
 * Credentials:
 *   TURSO_DATABASE_URL   — same as website/.env
 *   TURSO_AUTH_TOKEN     — same as website/.env
 */

let _client: Client | null = null;

export function getInstitutionalTurso(): Client {
  if (_client) return _client;
  // Trim both values — Vercel's env var UI sometimes attaches
  // trailing whitespace/newlines. The libSQL client builds an HTTP
  // Authorization header via `Bearer ${token}`, and any invisible
  // newline breaks that header with a "not a legal HTTP header value"
  // error. See lib/db.ts for the same defensive trim on the other DB.
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!url || !authToken) {
    throw new Error(
      "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set in terminal/.env. " +
        "Copy the same values that live in website/.env — they point at " +
        "the shared institutional database. Do not confuse with " +
        "TERMINAL_TURSO_DATABASE_URL / TERMINAL_TURSO_AUTH_TOKEN, which " +
        "point at the terminal's own operator-state database."
    );
  }
  _client = createClient({ url, authToken });
  return _client;
}

/**
 * Returns true if institutional Turso credentials are present in the
 * environment. Used by Feed/System to degrade gracefully when the
 * terminal is run without credentials.
 */
export function institutionalTursoConfigured(): boolean {
  return Boolean(
    process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN
  );
}
