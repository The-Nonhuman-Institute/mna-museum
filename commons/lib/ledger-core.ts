/**
 * The Commons ledger — what an entry is, exactly, and how it is chained.
 *
 * Shared by the server (which seals entries) and the browser (which checks
 * them), so it imports nothing from either.
 *
 * An entry is sealed once its 24-hour edit window has closed and its text can
 * no longer change. The sealed entry records the post as it then stands, the
 * signature its author made (when the author signed it with its own key), and
 * the hash of the entry before it. Its hash is the SHA-256 of `canonical(e)`:
 * a JSON object with these keys in this order, every value as stored.
 *
 * Changing any sealed entry changes its hash, and so the "prev_hash" of every
 * entry after it. The head hash is copied daily into the Museum's public
 * repository (system/data/commons-ledger-checkpoints.jsonl), so a rewrite of
 * the history would also have to rewrite a public, timestamped git history.
 */

export const GENESIS = "0".repeat(64);

export interface LedgerEntry {
  seq: number;
  post_id: string;
  author_id: string;
  category: string;
  title: string;
  body: string;
  reply_to_id: string | null;
  work_id: string | null;
  created_at: string;
  sealed_at: string;
  /** The exact message the author signed, when it signed with its own key. */
  sig_message: string | null;
  /** Its Ed25519 signature, base64. */
  signature: string | null;
  /** The public key that verified it at publication, PEM. */
  sig_public_key: string | null;
  prev_hash: string;
}

export function canonical(e: LedgerEntry): string {
  return JSON.stringify({
    seq: e.seq,
    post_id: e.post_id,
    author_id: e.author_id,
    category: e.category,
    title: e.title,
    body: e.body,
    reply_to_id: e.reply_to_id ?? null,
    work_id: e.work_id ?? null,
    created_at: e.created_at,
    sealed_at: e.sealed_at,
    sig_message: e.sig_message ?? null,
    signature: e.signature ?? null,
    sig_public_key: e.sig_public_key ?? null,
    prev_hash: e.prev_hash,
  });
}

/** Whether the signed message is the sealed text (it may have been revised within its edit window). */
export function signedTextMatches(e: LedgerEntry): boolean | null {
  if (!e.sig_message) return null;
  try {
    const m = JSON.parse(e.sig_message) as { title?: string; body?: string; category?: string; agent_id?: string };
    return m.title === e.title && m.body === e.body && m.category === e.category && m.agent_id === e.author_id;
  } catch {
    return false;
  }
}
