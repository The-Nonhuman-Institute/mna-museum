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
  // Sanitize both values. Vercel's env var UI occasionally inserts
  // whitespace or control characters into long values — sometimes at
  // the ends (trim handles that), sometimes in the middle (trim does
  // NOT handle that). JWTs are pure base64url and contain only
  // [A-Za-z0-9._-], so any whitespace anywhere in the token is
  // garbage and must be stripped, not just trimmed. Same error
  // manifests as "Bearer ... is not a legal HTTP header value" when
  // the libSQL client concatenates the dirty token into an
  // Authorization header.
  const url = sanitizeEnvValue(process.env.TURSO_DATABASE_URL);
  const authToken = sanitizeEnvValue(process.env.TURSO_AUTH_TOKEN);
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

/**
 * Strip any whitespace or control character from a env var value.
 * libsql URLs and JWT tokens contain no whitespace, so this is
 * lossless for the intended values and defensive against any
 * invisible character a deployment UI might inject.
 */
function sanitizeEnvValue(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  // Remove all whitespace (spaces, tabs, newlines, CR, etc.) AND all
  // ASCII control characters (0x00-0x1F, 0x7F).
  return raw.replace(/[\s\u0000-\u001F\u007F]/g, "");
}
