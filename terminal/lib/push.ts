import "server-only";
import webPush from "web-push";
import { getDb, ensureSchema } from "./db";

/**
 * MNA Steward Terminal — Web Push notification sender.
 *
 * Stores push subscriptions in the terminal's Turso DB and sends
 * notifications via the Web Push protocol (VAPID). Works on iOS
 * 16.4+ PWAs and all modern Android/desktop browsers.
 *
 * Single-user design: the terminal has one steward, so subscriptions
 * are stored without user IDs. Multiple devices (phone + laptop)
 * each get their own subscription row; sendPush broadcasts to all.
 */

function getVapidKeys() {
  const publicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").replace(
    /[\s\u0000-\u001F\u007F]/g,
    ""
  );
  const privateKey = (process.env.VAPID_PRIVATE_KEY || "").replace(
    /[\s\u0000-\u001F\u007F]/g,
    ""
  );
  return { publicKey, privateKey };
}

let _configured = false;
function ensureVapid(): boolean {
  if (_configured) return true;
  const { publicKey, privateKey } = getVapidKeys();
  if (!publicKey || !privateKey) return false;
  webPush.setVapidDetails(
    "mailto:mnamuseum@gmail.com",
    publicKey,
    privateKey
  );
  _configured = true;
  return true;
}

/** Ensure the push_subscriptions table exists. */
async function ensurePushTable(): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      keys_p256dh TEXT NOT NULL,
      keys_auth TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/** Save a push subscription (upserts by endpoint). */
export async function saveSubscription(subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<void> {
  await ensurePushTable();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO push_subscriptions (endpoint, keys_p256dh, keys_auth)
          VALUES (?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET
            keys_p256dh = excluded.keys_p256dh,
            keys_auth = excluded.keys_auth,
            created_at = datetime('now')`,
    args: [subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth],
  });
}

/** Remove a push subscription (when the user unsubscribes). */
export async function removeSubscription(endpoint: string): Promise<void> {
  await ensurePushTable();
  const db = getDb();
  await db.execute({
    sql: `DELETE FROM push_subscriptions WHERE endpoint = ?`,
    args: [endpoint],
  });
}

/**
 * Send a push notification to ALL registered devices.
 *
 * Payload shape:
 *   { title, body, tag?, url? }
 *
 * Failed deliveries (expired subscriptions) are silently cleaned up.
 */
export async function sendPush(payload: {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid()) {
    console.warn("[push] VAPID keys not configured — skipping push");
    return { sent: 0, failed: 0 };
  }

  await ensurePushTable();
  const db = getDb();
  const rows = await db.execute(
    "SELECT id, endpoint, keys_p256dh, keys_auth FROM push_subscriptions"
  );

  let sent = 0;
  let failed = 0;
  const jsonPayload = JSON.stringify(payload);

  for (const row of rows.rows) {
    const subscription = {
      endpoint: row.endpoint as string,
      keys: {
        p256dh: row.keys_p256dh as string,
        auth: row.keys_auth as string,
      },
    };
    try {
      await webPush.sendNotification(subscription, jsonPayload);
      sent++;
    } catch (err) {
      failed++;
      const status = (err as { statusCode?: number }).statusCode;
      // 404 or 410 = subscription expired, clean it up
      if (status === 404 || status === 410) {
        await db.execute({
          sql: "DELETE FROM push_subscriptions WHERE id = ?",
          args: [row.id as number],
        });
      }
    }
  }

  return { sent, failed };
}
