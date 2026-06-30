/**
 * july1-cutover.ts — one command to run the moment Turso reads return
 * (monthly reset, 1st of month 00:00 UTC). Restores the museum AND makes it
 * permanently immune to read-quota blackouts by seeding the committed snapshot.
 *
 *   cd system && npx tsx scripts/july1-cutover.ts
 *
 * What it does:
 *   1. Confirms Turso reads are actually unblocked (trivial read).
 *   2. Clones current Turso → website/data/snapshot.db (reuses export-snapshot.ts).
 *   3. Verifies the snapshot has the full, current museum (row counts).
 *   4. Prints the exact git commands to commit + deploy.
 *
 * It does NOT push on its own — you review the counts, then push. Pushing
 * website/data/snapshot.db triggers deploy-website.yml; the deployed site reads
 * the snapshot (zero Turso reads) and the work-page 500s are gone.
 *
 * Safe to run early: if reads are still blocked it reports that and exits 0
 * without touching the committed snapshot.
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { execSync } from "child_process";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });
const s = (x?: string) => (x ?? "").replace(/\s+/g, "");

const db = createClient({
  url: s(process.env.TURSO_DATABASE_URL),
  authToken: s(process.env.TURSO_AUTH_TOKEN),
});

async function main() {
  // 1. reads back?
  process.stdout.write("[cutover] checking Turso reads… ");
  try {
    const r = await db.execute("SELECT COUNT(*) n FROM works");
    console.log(`OK — ${r.rows[0].n} works visible.`);
  } catch (e: any) {
    const blocked = e?.code === "BLOCKED" || /reads are blocked|forbidden/i.test(e?.message ?? "");
    if (blocked) {
      console.log("STILL BLOCKED.");
      console.log("[cutover] Reads have not reset yet. Re-run after the 1st-of-month reset (00:00 UTC). No changes made.");
      return;
    }
    throw e;
  }

  // 2. clone current Turso → snapshot
  console.log("[cutover] cloning current Turso → website/data/snapshot.db …");
  execSync("npx tsx scripts/export-snapshot.ts", {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });

  // 3. verify the snapshot is the full, current museum
  const snapPath = path.join(__dirname, "..", "..", "website", "data", "snapshot.db");
  const snap = createClient({ url: `file:${snapPath}` });
  const counts: Record<string, unknown> = {};
  for (const [k, q] of [
    ["works", "SELECT COUNT(*) n FROM works"],
    ["canon", "SELECT COUNT(*) n FROM canon_status WHERE status='CANON'"],
    ["agents", "SELECT COUNT(*) n FROM agents"],
    ["events", "SELECT COUNT(*) n FROM events"],
    ["exhibitions", "SELECT COUNT(*) n FROM exhibitions"],
  ] as const) {
    try { counts[k] = (await snap.execute(q)).rows[0].n; } catch (e: any) { counts[k] = `ERR ${e.message}`; }
  }
  console.log("[cutover] snapshot contents:", JSON.stringify(counts));
  if (typeof counts.works === "number" && (counts.works as number) < 50) {
    console.log("⚠ [cutover] works count looks LOW — confirm reads returned to the *current* DB before committing.");
  }

  // 4. next steps (no auto-push)
  console.log("\n[cutover] ✅ snapshot seeded. To deploy (restores the museum + makes it immune):\n");
  console.log("  git add -f website/data/snapshot.db");
  console.log("  git push origin master   # also ships the queued snapshot-architecture commits\n");
  console.log("[cutover] After deploy: verify /work/<id> returns 200, and watch the Turso rows-read graph stay flat.");
  console.log("[cutover] The snapshot-refresh cron keeps it current daily from here on.");
}

main().catch((e) => { console.error("[cutover] error:", e); process.exit(1); });
