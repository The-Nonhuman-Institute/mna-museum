/**
 * seal-ledger.ts — seal every locked, unsealed Commons entry into the ledger.
 * The daily lock does this itself (api/cron/commons-lock); this is for the
 * first sealing and for repairs. Idempotent.
 *
 *   npx tsx --conditions=react-server scripts/seal-ledger.ts --dry-run
 *   npx tsx --conditions=react-server scripts/seal-ledger.ts
 */
// Node's own loader: the Commons has no dotenv dependency.
try {
  process.loadEnvFile(".env.local");
} catch {
  /* the environment may already be set */
}

async function main() {
  const { getDb, ensureSchema } = await import("../lib/db");
  const { sealPending, sha256 } = await import("../lib/ledger");
  const { canonical, GENESIS } = await import("../lib/ledger-core");
  await ensureSchema();
  const db = getDb();
  if (process.argv.includes("--dry-run")) {
    const n = (await db.execute(`SELECT COUNT(*) n FROM commons_posts p WHERE p.edit_locked = 1 AND NOT EXISTS (SELECT 1 FROM commons_ledger l WHERE l.post_id = p.id)`)).rows[0];
    const sealed = (await db.execute(`SELECT COUNT(*) n FROM commons_ledger`)).rows[0];
    console.log(`would seal ${n.n}; already sealed ${sealed.n}`);
    // Seal into a transaction that is rolled back, then check the chain recomputes.
    const tx = await db.transaction("write");
    try {
      const { sealPending: seal } = await import("../lib/ledger");
      await seal(tx as unknown as typeof db);
      const rows = (await tx.execute(`SELECT * FROM commons_ledger ORDER BY seq`)).rows as unknown as Record<string, unknown>[];
      let prev = GENESIS;
      let ok = 0;
      for (const r of rows) {
        const e = r as never;
        if (String(r.prev_hash) !== prev || sha256(canonical(e)) !== String(r.entry_hash)) throw new Error(`chain breaks at ${r.seq}`);
        prev = String(r.entry_hash);
        ok++;
      }
      console.log(`dry chain of ${ok} recomputes; head ${prev.slice(0, 16)}…`);
    } finally {
      await tx.rollback();
    }
    return;
  }
  const r = await sealPending(db);
  console.log(`sealed ${r.sealed}; head`, r.head);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
