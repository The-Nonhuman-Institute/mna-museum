/**
 * seal-db.ts — DB access for Witness Seals. Kept separate from the pure
 * render (seal.ts) so the render can be imported by plain-`tsx` scripts.
 *
 * Reads go through getWriteDb() (live Turso): a seal is minted rarely and read
 * immediately, and the `seals` table rides into the read-snapshot on the next
 * refresh — so a just-minted seal's page is correct before the snapshot catches
 * up.
 */
import { getWriteDb } from "@/lib/registration-db";
import type { Seal, SealConfig } from "@/lib/seal";

export async function getSeal(id: string): Promise<Seal | null> {
  const db = getWriteDb();
  let r;
  try {
    r = await db.execute({
      sql: `SELECT id, ceremony_id, seal_number, seal_seed, config, issued_at FROM seals WHERE id = ?`,
      args: [id],
    });
  } catch {
    // seals table may not exist yet in some environments
    return null;
  }
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    ceremony_id: String(row.ceremony_id),
    seal_number: Number(row.seal_number),
    seal_seed: String(row.seal_seed),
    config: JSON.parse(String(row.config)) as SealConfig,
    issued_at: String(row.issued_at),
  };
}
