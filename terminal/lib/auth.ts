import "server-only";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

/**
 * MNA Steward Terminal — Node-only password verification.
 *
 * This module uses Node.js built-ins (`fs`, `path`) and `bcryptjs`. It
 * MUST only be imported from Node-runtime code — specifically the
 * /api/login route. Do not import this from middleware (which runs in
 * Edge runtime) or from any React Server Component that might be
 * prerendered in a non-Node context. Session cookie signing lives in
 * lib/session.ts, which is Edge-safe.
 *
 * Password hash storage: the bcrypt hash lives in a file
 * (data/steward.hash), not in .env. Reason: bcrypt hashes contain $
 * characters that trigger variable expansion inside dotenv-expand (used
 * by @next/env), which silently corrupts the stored value. File-based
 * storage sidesteps this entirely and follows the systemd/Docker
 * secrets pattern. The file is created by `npm run hash-password` with
 * mode 0600 (owner-only read/write).
 */

/** Absolute path to the steward password hash file. */
export const STEWARD_HASH_PATH = path.join(
  process.cwd(),
  "data",
  "steward.hash"
);

function readStewardHash(): string | null {
  try {
    if (!fs.existsSync(STEWARD_HASH_PATH)) return null;
    const raw = fs.readFileSync(STEWARD_HASH_PATH, "utf-8").trim();
    if (!raw) return null;
    return raw;
  } catch (err) {
    console.error("[auth] failed to read steward hash file:", err);
    return null;
  }
}

/**
 * Check a steward password attempt against the bcrypt hash on disk.
 * Returns true on match. Uses bcrypt.compare which is constant-time.
 */
export async function verifyPassword(attempt: string): Promise<boolean> {
  const hash = readStewardHash();
  if (!hash) {
    console.error(
      `[auth] steward hash file is missing at ${STEWARD_HASH_PATH}. ` +
        "Run `npm run hash-password` to create it."
    );
    return false;
  }
  try {
    return await bcrypt.compare(attempt, hash);
  } catch (err) {
    console.error("[auth] bcrypt.compare failed:", err);
    return false;
  }
}
