/**
 * Sealing the Commons ledger (lib/ledger-core.ts). Server-side: hashes with
 * node's crypto. Called by the daily lock (api/cron/commons-lock) right after
 * the edit windows close, and safe to run any number of times: an entry is
 * sealed once, in the order its post was made.
 */
import { createHash } from "crypto";
import type { Client } from "@libsql/client";
import { canonical, GENESIS, type LedgerEntry } from "./ledger-core";

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export async function sealPending(db: Client): Promise<{ sealed: number; head: { seq: number; hash: string } | null }> {
  const pending = await db.execute(
    `SELECT p.id, p.author_id, p.category, p.title, p.body, p.reply_to_id, p.work_id, p.created_at,
            s.message AS sig_message, s.signature, s.public_key_pem
       FROM commons_posts p
       LEFT JOIN commons_post_signatures s ON s.post_id = p.id
      WHERE p.edit_locked = 1 AND NOT EXISTS (SELECT 1 FROM commons_ledger l WHERE l.post_id = p.id)
      ORDER BY p.created_at ASC, p.id ASC`,
  );
  const last = (await db.execute(`SELECT seq, entry_hash FROM commons_ledger ORDER BY seq DESC LIMIT 1`)).rows[0] as unknown as
    | { seq: number; entry_hash: string }
    | undefined;
  let seq = last ? Number(last.seq) : 0;
  let prev = last ? String(last.entry_hash) : GENESIS;
  const sealedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const writes: { sql: string; args: (string | number | null)[] }[] = [];
  for (const r of pending.rows as unknown as Record<string, string | null>[]) {
    seq += 1;
    const e: LedgerEntry = {
      seq,
      post_id: String(r.id),
      author_id: String(r.author_id),
      category: String(r.category),
      title: String(r.title),
      body: String(r.body),
      reply_to_id: r.reply_to_id ?? null,
      work_id: r.work_id ?? null,
      created_at: String(r.created_at),
      sealed_at: sealedAt,
      sig_message: r.sig_message ?? null,
      signature: r.signature ?? null,
      sig_public_key: r.public_key_pem ?? null,
      prev_hash: prev,
    };
    const hash = sha256(canonical(e));
    writes.push({
      sql: `INSERT INTO commons_ledger (seq, post_id, author_id, category, title, body, reply_to_id, work_id, created_at,
              sealed_at, sig_message, signature, sig_public_key, prev_hash, entry_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [e.seq, e.post_id, e.author_id, e.category, e.title, e.body, e.reply_to_id, e.work_id, e.created_at,
        e.sealed_at, e.sig_message, e.signature, e.sig_public_key, e.prev_hash, hash],
    });
    prev = hash;
  }
  // One transaction: the chain is never left half-written.
  if (writes.length) await db.batch(writes, "write");
  return { sealed: writes.length, head: seq ? { seq, hash: prev } : null };
}
