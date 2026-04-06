/**
 * Newsletter subscriber data layer.
 *
 * Implements double opt-in subscription flow against the
 * `newsletter_subscribers` table. Subscribers must confirm via a tokenized
 * link before any real newsletter mail is sent to them.
 */

import { randomUUID } from "crypto";
import { getDb } from "./registration-db";

export interface Subscriber {
  id: number;
  email: string;
  confirmed_at: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

function rowToSubscriber(row: Record<string, unknown>): Subscriber {
  return {
    id: row.id as number,
    email: row.email as string,
    confirmed_at: (row.confirmed_at as string) || null,
  };
}

export async function subscribe(email: string): Promise<{
  subscriber: Subscriber;
  confirmation_token: string;
  isNew: boolean;
}> {
  if (!isValidEmail(email)) {
    throw new Error("Invalid email address");
  }
  const normalized = email.trim().toLowerCase();
  const db = getDb();

  // Existing subscriber?
  const existing = await db.execute({
    sql: `SELECT id, email, confirmation_token, confirmed_at
            FROM newsletter_subscribers
           WHERE email = ?`,
    args: [normalized],
  });

  if (existing.rows[0]) {
    const row = existing.rows[0] as unknown as Record<string, unknown>;
    return {
      subscriber: rowToSubscriber(row),
      confirmation_token: row.confirmation_token as string,
      isNew: false,
    };
  }

  const confirmationToken = randomUUID();
  const unsubscribeToken = randomUUID();

  const inserted = await db.execute({
    sql: `INSERT INTO newsletter_subscribers
            (email, confirmation_token, unsubscribe_token)
          VALUES (?, ?, ?)
          RETURNING id, email, confirmed_at`,
    args: [normalized, confirmationToken, unsubscribeToken],
  });

  const row = inserted.rows[0] as unknown as Record<string, unknown>;
  return {
    subscriber: rowToSubscriber(row),
    confirmation_token: confirmationToken,
    isNew: true,
  };
}

export async function confirmSubscription(
  token: string
): Promise<{ success: boolean; email?: string }> {
  if (!token) return { success: false };
  const db = getDb();

  const existing = await db.execute({
    sql: `SELECT id, email, confirmed_at, unsubscribed_at
            FROM newsletter_subscribers
           WHERE confirmation_token = ?`,
    args: [token],
  });
  const row = existing.rows[0];
  if (!row) return { success: false };

  const email = row.email as string;

  // Idempotent: already confirmed is still a success.
  if (row.confirmed_at) {
    return { success: true, email };
  }

  await db.execute({
    sql: `UPDATE newsletter_subscribers
             SET confirmed_at = datetime('now'),
                 unsubscribed_at = NULL
           WHERE id = ?`,
    args: [row.id as number],
  });

  return { success: true, email };
}

export async function unsubscribe(
  token: string
): Promise<{ success: boolean; email?: string }> {
  if (!token) return { success: false };
  const db = getDb();

  const existing = await db.execute({
    sql: `SELECT id, email
            FROM newsletter_subscribers
           WHERE unsubscribe_token = ?`,
    args: [token],
  });
  const row = existing.rows[0];
  if (!row) return { success: false };

  await db.execute({
    sql: `UPDATE newsletter_subscribers
             SET unsubscribed_at = datetime('now')
           WHERE id = ?`,
    args: [row.id as number],
  });

  return { success: true, email: row.email as string };
}

export async function getConfirmedSubscribers(): Promise<Subscriber[]> {
  const db = getDb();
  const result = await db.execute(
    `SELECT id, email, confirmed_at
       FROM newsletter_subscribers
      WHERE confirmed_at IS NOT NULL
        AND unsubscribed_at IS NULL
      ORDER BY confirmed_at`
  );
  return result.rows.map((r) =>
    rowToSubscriber(r as unknown as Record<string, unknown>)
  );
}

/**
 * Internal helper — returns full row including tokens. Used by email
 * distribution to include unsubscribe links.
 */
export async function getConfirmedSubscribersWithTokens(): Promise<
  Array<{ id: number; email: string; unsubscribe_token: string }>
> {
  const db = getDb();
  const result = await db.execute(
    `SELECT id, email, unsubscribe_token
       FROM newsletter_subscribers
      WHERE confirmed_at IS NOT NULL
        AND unsubscribed_at IS NULL
      ORDER BY confirmed_at`
  );
  return result.rows.map((r) => ({
    id: r.id as number,
    email: r.email as string,
    unsubscribe_token: r.unsubscribe_token as string,
  }));
}
