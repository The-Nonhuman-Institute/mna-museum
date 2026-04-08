/**
 * Scan Turso for "limbo" works — canon_status in SUBMITTED/IN_REVIEW
 * but all four Evaluation Council members have already voted. Such
 * works need a tally-only pass; the evaluate-turso-works.ts script
 * handles them automatically when re-run.
 *
 * Throwaway diagnostic used to verify the institution's state after
 * the 2026-04-08 submission batch. Safe to leave committed — it's a
 * read-only sweep.
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

async function main() {
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  const r = await db.execute(`
    SELECT cs.work_id, cs.status, COUNT(e.id) as n_votes,
           GROUP_CONCAT(e.evaluator_id || ':' || e.verdict) as votes
      FROM canon_status cs
      JOIN evaluations e ON cs.work_id = e.work_id
      WHERE cs.status IN ('SUBMITTED', 'IN_REVIEW')
        AND e.evaluator_id LIKE 'MNA-EV-%'
      GROUP BY cs.work_id, cs.status
      HAVING n_votes >= 4
      ORDER BY cs.work_id
  `);
  console.log("Limbo works (all votes in, canon_status not final):");
  if (r.rows.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const row of r.rows) {
    console.log(`  ${row.work_id} [${row.status}] ${row.n_votes} votes: ${row.votes}`);
  }
  console.log(
    `\nRun \`npx tsx scripts/evaluate-turso-works.ts --work <id>\` on each to tally.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
