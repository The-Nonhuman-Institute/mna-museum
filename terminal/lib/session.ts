/**
 * MNA Steward Terminal — Edge-safe session cookie utilities.
 *
 * This module runs in BOTH the Node runtime (API routes) and the Edge
 * runtime (middleware auth gate). Edge runtime forbids Node's `crypto`,
 * `fs`, `path`, and `process.cwd()` — so this file uses only the Web
 * Crypto API (available in both runtimes) and has zero Node imports.
 *
 * Password verification (bcrypt) lives in lib/auth.ts and must only be
 * imported from Node-runtime code (the login API route), never from
 * middleware.
 *
 * Cookie format: `<issuedAt>.<hmacHex>` where `issuedAt` is a unix
 * timestamp in seconds and `hmacHex` is the HMAC-SHA256 of that
 * timestamp, hex-encoded. The server verifies both the HMAC and the age
 * on every request. Cookie lifetime is 30 days.
 */

export const SESSION_COOKIE_NAME = "mna_steward_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

/**
 * Lazy cache for the imported HMAC key. Web Crypto's importKey is
 * async, so we memoize the Promise (not just the result) to avoid
 * racing multiple imports during concurrent requests.
 */
let _keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (_keyPromise) return _keyPromise;
  const secret = process.env.STEWARD_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "STEWARD_SESSION_SECRET is not set in terminal/.env. Generate " +
        "one with: `openssl rand -hex 32`"
    );
  }
  _keyPromise = crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  return _keyPromise;
}

function bytesToHex(buf: ArrayBuffer): string {
  const arr = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Constant-time string comparison. Web Crypto doesn't expose
 * timingSafeEqual, so we roll a small one. Returns true only if both
 * strings have the same length and every character matches — the loop
 * runs through the full length regardless of early mismatches, so
 * timing doesn't leak information about where the mismatch was.
 */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Create a signed session cookie value. Format: `<issuedAt>.<hmacHex>`. */
export async function createSessionValue(): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000).toString();
  const key = await getKey();
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(issuedAt)
  );
  return `${issuedAt}.${bytesToHex(sig)}`;
}

/**
 * Verify a session cookie value. Returns true if the HMAC is valid and
 * the session is not expired. Constant-time HMAC comparison.
 */
export async function verifySessionValue(
  value: string | undefined
): Promise<boolean> {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 2) return false;
  const [issuedAtStr, macHex] = parts;
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (now - issuedAt > SESSION_MAX_AGE_SECONDS) return false;

  try {
    const key = await getKey();
    const expectedSig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(issuedAtStr)
    );
    const expectedHex = bytesToHex(expectedSig);
    return constantTimeEqualHex(macHex, expectedHex);
  } catch (err) {
    console.error("[session] verify failed:", err);
    return false;
  }
}
