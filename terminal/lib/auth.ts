import "server-only";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

/**
 * MNA Steward Terminal — Node-only password verification.
 *
 * This module uses Node.js built-ins (`fs`, `path`) and `bcryptjs`. It
 * MUST only be imported from Node-runtime code — specifically the
 * /api/login route. Do not import this from the proxy (which runs in
 * Edge runtime) or from any React Server Component that might be
 * prerendered in a non-Node context. Session cookie signing lives in
 * lib/session.ts, which is Edge-safe.
 *
 * Password hash resolution order:
 *   1. Env var STEWARD_PASSWORD_HASH — this is how the hash is
 *      provided in production (Vercel env vars survive the dotenv-
 *      expand mangling that broke file-less storage in .env locally).
 *   2. Fallback: data/steward.hash on disk, created by
 *      `npm run hash-password`. Used for local development where .env
 *      goes through dotenv-expand and would silently corrupt bcrypt
 *      hashes with $ characters, but the filesystem is fine.
 *
 * Both paths resolve to the same bcryptjs.compare — the source of the
 * hash is the only difference.
 */

/** Absolute path to the steward password hash file (local dev only). */
export const STEWARD_HASH_PATH = path.join(
  process.cwd(),
  "data",
  "steward.hash"
);

function readStewardHash(): string | null {
  // 1. Env var takes precedence — this is how production (Vercel)
  //    supplies the hash. Vercel's env var UI stores raw strings, so
  //    the $ characters in a bcrypt hash survive intact.
  const envHash = process.env.STEWARD_PASSWORD_HASH;
  if (envHash && envHash.trim().length > 0) {
    return envHash.trim();
  }

  // 2. File fallback — local development. `npm run hash-password`
  //    writes the hash here with mode 0600. .env is bypassed entirely
  //    so dotenv-expand can't mangle the $ characters.
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
 * Check a steward password attempt against the bcrypt hash.
 * Returns true on match. Uses bcrypt.compare which is constant-time.
 */
export async function verifyPassword(attempt: string): Promise<boolean> {
  const hash = readStewardHash();
  if (!hash) {
    console.error(
      "[auth] no steward password hash available — set " +
        `STEWARD_PASSWORD_HASH in the environment or create ${STEWARD_HASH_PATH} ` +
        "with `npm run hash-password`."
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
