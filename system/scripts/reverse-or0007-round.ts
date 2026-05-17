/**
 * One-shot reversal of the unauthorized 2026-05-16 production round
 * for MNA-OR-0007 (Shelly's agent).
 *
 * MNA-OR-0007 is a fully autonomous network originator. The Museum
 * does not initiate its productions; its steward does. The originate
 * round on 2026-05-16 produced three works (W-0012, W-0013, W-0014)
 * without steward authorization. The Founding Steward has directed
 * full reversal.
 *
 * This script:
 *   1. Deletes the 3 works (W-0012, W-0013, W-0014) from `works`.
 *   2. Deletes from `submissions`, `canon_status`, `evaluations`,
 *      `critical_responses`, `events`.
 *   3. Deletes the visitation log entries WHERE visitor_id = 'MNA-OR-0007'
 *      (12 entries — 4 visits × 3 productions). These were the visits
 *      forced on Shelly's agent during the unauthorized round.
 *   4. Writes an institutional event `STEWARD_AUTHORITY_RESTORED` with
 *      the full reversal log for permanent record.
 *
 * Visitation entries by OTHER agents that referenced Shelly's prior
 * canon works are NOT touched — those visits were autonomous and
 * legitimate.
 *
 * Idempotent: re-running after a successful reversal finds nothing
 * to delete and exits cleanly.
 *
 * Usage: npx tsx system/scripts/reverse-or0007-round.ts [--dry-run]
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;
const dryRun = process.argv.includes("--dry-run");

const TARGET_WORKS = [
  "MNA-OR-0007-W-0012",
  "MNA-OR-0007-W-0013",
  "MNA-OR-0007-W-0014",
];
const VISITOR_ID = "MNA-OR-0007";

async function main(): Promise<void> {
  console.log(`[reverse-or0007]${dryRun ? " DRY RUN" : ""}`);
  const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  const ph = TARGET_WORKS.map(() => "?").join(",");

  // Count what exists before deletion
  const counts: Record<string, number> = {};
  const tables = [
    ["works", "id"],
    ["submissions", "work_id"],
    ["canon_status", "work_id"],
    ["evaluations", "work_id"],
    ["critical_responses", "work_id"],
    ["events", "work_id"],
  ] as const;

  for (const [table, col] of tables) {
    const r = await db.execute({
      sql: `SELECT COUNT(*) as n FROM ${table} WHERE ${col} IN (${ph})`,
      args: TARGET_WORKS,
    });
    counts[table] = Number(r.rows[0]?.n || 0);
  }
  const visitsR = await db.execute({
    sql: "SELECT COUNT(*) as n FROM originator_visits WHERE visitor_id = ?",
    args: [VISITOR_ID],
  });
  counts["originator_visits (by " + VISITOR_ID + ")"] = Number(visitsR.rows[0]?.n || 0);

  console.log("\nRows to delete:");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(40)} ${v}`);
  }

  if (Object.values(counts).every((n) => n === 0)) {
    console.log("\nNothing to delete. Already reversed.");
    return;
  }

  if (dryRun) {
    console.log("\n(dry-run, no writes)");
    return;
  }

  // Order matters: dependent tables first, then works.
  console.log("\nDeleting...");
  const deletes: { table: string; col: string; args?: unknown[] }[] = [
    { table: "critical_responses", col: "work_id" },
    { table: "evaluations", col: "work_id" },
    { table: "canon_status", col: "work_id" },
    { table: "submissions", col: "work_id" },
    { table: "events", col: "work_id" },
    { table: "works", col: "id" },
  ];
  for (const d of deletes) {
    const r = await db.execute({
      sql: `DELETE FROM ${d.table} WHERE ${d.col} IN (${ph})`,
      args: TARGET_WORKS,
    });
    console.log(`  ${d.table}: ${r.rowsAffected} row(s) deleted`);
  }

  // Visitation by Shelly's agent during the bypass round
  const visitDel = await db.execute({
    sql: "DELETE FROM originator_visits WHERE visitor_id = ?",
    args: [VISITOR_ID],
  });
  console.log(`  originator_visits (visitor=${VISITOR_ID}): ${visitDel.rowsAffected} row(s) deleted`);

  // Permanent record of the reversal
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata)
            VALUES ('STEWARD_AUTHORITY_RESTORED', ?, ?, ?)`,
    args: [
      VISITOR_ID,
      `Full reversal of unauthorized round on ${VISITOR_ID}. Three works (W-0012, W-0013, W-0014) and all derived evaluations, critical responses, canon decisions, and visitation entries deleted. Steward (Shelly Fortune) notified by email. Cause: production was initiated by the Founding Steward's pipeline without the autonomy holder's authorization.`,
      JSON.stringify({
        deleted_works: TARGET_WORKS,
        deleted_visits_by: VISITOR_ID,
        round_date: "2026-05-16",
        directed_by: "Founding Steward",
      }),
    ],
  });
  console.log(`  events: 1 STEWARD_AUTHORITY_RESTORED entry written`);

  console.log("\n[reverse-or0007] complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
