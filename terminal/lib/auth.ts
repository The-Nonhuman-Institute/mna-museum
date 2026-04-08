import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";

/**
 * MNA Steward Terminal — auth primitives.
 *
 * V1 auth model: single steward, single bcrypt-hashed password. Session
 * state lives in a signed HMAC cookie. No user accounts table, no password
 * reset flow, no multi-user management. This is a private tool served
 * over Tailscale behind an HTTP auth gate — the password is the second
 * layer, not the only layer.
 *
 * Environment variables:
 *   STEWARD_PASSWORD_HASH    — bcrypt hash of the steward's password
 *   STEWARD_SESSION_SECRET   — HMAC secret for signing session cookies
 *
 * Both are generated once and set in terminal/.env. The hash is created
 * by running `npm run hash-password` which prompts for a password and
 * prints the hash to stdout.
 *
 * Session cookies are signed, not encrypted — the value is a plaintext
 * timestamp and an HMAC. The server verifies the HMAC and the age on
 * every request. Cookie lifetime is 30 days.
 */

export const SESSION_COOKIE_NAME = "mna_steward_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Check a steward password attempt against the bcrypt hash in the env.
 * Returns true on match. Uses bcrypt.compare which is constant-time.
 */
export async function verifyPassword(attempt: string): Promise<boolean> {
  const hash = process.env.STEWARD_PASSWORD_HASH;
  if (!hash) {
    console.error(
      "[auth] STEWARD_PASSWORD_HASH is not set — rejecting all login attempts"
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

function getSecret(): Buffer {
  const secret = process.env.STEWARD_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "STEWARD_SESSION_SECRET is not set in terminal/.env. Generate " +
        "one with: `openssl rand -hex 32`"
    );
  }
  return Buffer.from(secret, "utf-8");
}

/**
 * Create a signed session cookie value. Format: `<issuedAt>.<hmac>`.
 * `issuedAt` is a unix timestamp (seconds). The HMAC is hex-encoded.
 */
export function createSessionValue(): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const mac = createHmac("sha256", getSecret())
    .update(String(issuedAt))
    .digest("hex");
  return `${issuedAt}.${mac}`;
}

/**
 * Verify a session cookie value. Returns true if the HMAC is valid and
 * the session is not expired. Timing-safe comparison on the HMAC.
 */
export function verifySessionValue(value: string | undefined): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 2) return false;
  const [issuedAtStr, macHex] = parts;
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (now - issuedAt > SESSION_MAX_AGE_SECONDS) return false;

  const expectedMac = createHmac("sha256", getSecret())
    .update(issuedAtStr)
    .digest("hex");

  const actualBuf = Buffer.from(macHex, "hex");
  const expectedBuf = Buffer.from(expectedMac, "hex");
  if (actualBuf.length !== expectedBuf.length) return false;

  try {
    return timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};
