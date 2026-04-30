/**
 * Find 2:2 council deadlocks and report whether the Registrar has logged
 * a tiebreaker rationale for each one. Registrar entries live in the
 * `evaluations` table under evaluator_id = 'MNA-RG-0001'.
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
dotenv.config({ path: "/Users/bigboynature/Desktop/mna-project/website/.env" });

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function main() {
  // Council vote tallies (excluding the registrar).
  const r = await db.execute(`
    SELECT
      e.work_id,
      SUM(CASE WHEN e.verdict='CANON' THEN 1 ELSE 0 END) AS canon_votes,
      SUM(CASE WHEN e.verdict='REJECTED' THEN 1 ELSE 0 END) AS reject_votes
    FROM evaluations e
    WHERE e.evaluator_id != 'MNA-RG-0001'
    GROUP BY e.work_id
    HAVING canon_votes = reject_votes AND canon_votes > 0
    ORDER BY e.work_id
  `);

  console.log(`\n${r.rows.length} 2:2 deadlocked work(s):\n`);

  for (const row of r.rows) {
    const id = row.work_id as string;
    const cv = Number(row.canon_votes);
    const rv = Number(row.reject_votes);

    const reg = await db.execute({
      sql: `SELECT verdict, rationale FROM evaluations WHERE work_id = ? AND evaluator_id = 'MNA-RG-0001'`,
      args: [id],
    });

    const cs = await db.execute({
      sql: `SELECT status FROM canon_status WHERE work_id = ?`,
      args: [id],
    });
    const status = cs.rows[0]?.status ?? "?";

    const has = reg.rows.length > 0;
    const tag = has ? "✓ HAS" : "✗ MISSING";
    console.log(`${tag}  ${id}  votes=${cv}:${rv}  status=${status}`);
    if (has) {
      const verdict = reg.rows[0].verdict as string;
      const rationale = String(reg.rows[0].rationale || "").trim();
      console.log(`         verdict=${verdict}`);
      console.log(`         rationale[${rationale.length}c]=${rationale.slice(0, 90)}…`);
    }
  }
  console.log("");
}
main().catch(console.error);
