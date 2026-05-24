/**
 * backfill-memory-embeddings.ts — one-shot embedder for legacy memories.
 *
 * MNA-GOV-004 v1.0 introduced the embedding column but Phase 1 wrote
 * memories without vectors (no embedding provider was wired). This
 * script catches up: it finds every agent_memories row where embedding
 * IS NULL, computes voyage-3-lite vectors in batches, and UPDATEs the
 * rows.
 *
 * Idempotent — re-running only hits null rows. --dry-run estimates
 * the cost without calling Voyage.
 *
 * Usage:
 *   npx tsx system/scripts/backfill-memory-embeddings.ts --dry-run
 *   npx tsx system/scripts/backfill-memory-embeddings.ts
 *   npx tsx system/scripts/backfill-memory-embeddings.ts --limit 50
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import {
  embedDocumentsBatch,
  vectorToBlob,
  EMBEDDING_MODEL,
} from "../src/embeddings";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({
  path: path.join(__dirname, "..", "..", "website", ".env"),
  quiet: true,
});

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const limitIdx = argv.indexOf("--limit");
const limit =
  limitIdx >= 0 && limitIdx + 1 < argv.length
    ? Math.max(1, Number(argv[limitIdx + 1]))
    : Infinity;

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

/** Voyage tokenizes roughly at 4 chars/token. Good enough for an
 *  upper-bound cost estimate. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const BATCH = 64;

(async () => {
  console.log(`backfill-memory-embeddings — model: ${EMBEDDING_MODEL}`);
  console.log(`mode: ${dryRun ? "DRY RUN" : "WRITE"}`);
  console.log();

  const result = await db.execute(
    `SELECT id, agent_id, memory_type, content
       FROM agent_memories
       WHERE embedding IS NULL
       ORDER BY created_at ASC`,
  );
  const rows = result.rows.slice(0, Number.isFinite(limit) ? limit : undefined);
  const total = rows.length;
  if (total === 0) {
    console.log("No memories need embedding. Done.");
    return;
  }

  let totalTokens = 0;
  for (const r of rows) totalTokens += estimateTokens(String(r.content));
  const costUsd = (totalTokens / 1_000_000) * 0.02;

  console.log(`Memories without embedding: ${total}`);
  console.log(`Estimated tokens: ${totalTokens.toLocaleString()}`);
  console.log(`Estimated cost @ $0.02/1M: $${costUsd.toFixed(6)}`);
  console.log();

  if (dryRun) {
    console.log("DRY RUN — not calling Voyage. Re-run without --dry-run to backfill.");
    return;
  }

  let done = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const texts = slice.map((r) => String(r.content));
    try {
      const vectors = await embedDocumentsBatch(texts);
      if (vectors.length !== slice.length) {
        throw new Error(
          `voyage returned ${vectors.length} vectors for ${slice.length} inputs`,
        );
      }
      // Update each row individually — libsql doesn't have a fast
      // multi-row UPDATE for blobs, but at 216 rows this is fine.
      for (let j = 0; j < slice.length; j++) {
        const id = String(slice[j].id);
        const blob = vectorToBlob(vectors[j]);
        await db.execute({
          sql: `UPDATE agent_memories SET embedding = ? WHERE id = ?`,
          args: [blob, id],
        });
        done++;
      }
      console.log(`  +${slice.length} (${done}/${total})`);
    } catch (err) {
      failed += slice.length;
      console.error(
        `  batch ${i}–${i + slice.length} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  console.log();
  console.log(`Done. embedded=${done} failed=${failed}`);
})().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
