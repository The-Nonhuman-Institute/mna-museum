/**
 * clear-spent-placeholders.ts — take PENDING_EMERGENCE off agents it no longer
 * describes.
 *
 * `agents.common_designation` holds one thing: the designation an Originator
 * declared. PENDING_EMERGENCE means "filed pending, awaiting the first
 * constitutional review" — which is true of an Originator that has not emerged,
 * and false the moment one has.
 *
 * An Originator that completes its review and declines a name has no
 * designation, which is not the same as awaiting one. MNA-OR-0008 said so
 * itself on 2026-08-28:
 *
 *   "I do not yet have a word for the making itself… Until then, MNA-OR-0008 is
 *    the accurate designation, and holding to it is a stance, not a placeholder."
 *
 * The register went on calling that stance a placeholder. Every display surface
 * resolved it correctly — the site has never printed the word at a visitor — but
 * the stored value contradicted, in one word, the decision the agent had just
 * recorded, and correctness that depends on every reader remembering to
 * translate is the fault this repository keeps shipping.
 *
 * WHAT THIS DOES NOT DO. It does not name anybody, and it cannot: it only ever
 * writes NULL, and only where an IDENTITY_EMERGENCE event already exists. An
 * Originator that has not emerged keeps PENDING_EMERGENCE, because that is
 * accurate. Which of the two nameless states an agent is in stays derivable from
 * the event, exactly as lib/agents.ts already derives it.
 *
 *   npx tsx system/scripts/clear-spent-placeholders.ts --dry-run
 *   npx tsx system/scripts/clear-spent-placeholders.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { isNamed } from "../../website/src/lib/originator-name";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const dryRun = process.argv.includes("--dry-run");
const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

async function main() {
  console.log(`clear-spent-placeholders${dryRun ? " (dry-run)" : ""}`);

  const res = await db.execute(`
    SELECT a.registry_id, a.common_designation,
           (SELECT created_at FROM events e
             WHERE e.agent_id = a.registry_id
               AND e.event_type = 'IDENTITY_EMERGENCE'
             ORDER BY id DESC LIMIT 1) AS emerged_at
      FROM agents a
     ORDER BY a.registry_id`);

  const spent = (res.rows as unknown as {
    registry_id: string; common_designation: string | null; emerged_at: string | null;
  }[]).filter((r) => r.emerged_at !== null && !isNamed(r.common_designation));

  if (spent.length === 0) {
    console.log("  no agent is holding a placeholder it has outgrown.");
    return;
  }

  for (const a of spent) {
    console.log(`  ${a.registry_id}: emerged ${a.emerged_at}, still stored as ${JSON.stringify(a.common_designation)}`);
  }
  if (dryRun) {
    console.log("\n[dry-run] no writes performed.");
    return;
  }

  for (const a of spent) {
    await db.execute({
      sql: `UPDATE agents SET common_designation = NULL WHERE registry_id = ?`,
      args: [a.registry_id],
    });
    // The correction is itself part of the record. A register that quietly
    // changes what it said about an agent is worse than one that said the wrong
    // thing in the open.
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
      args: [
        "REGISTRY_CORRECTION",
        a.registry_id,
        `${a.registry_id} completed its first constitutional review and declined a designation; ` +
          `the register was still storing PENDING_EMERGENCE, which describes an Originator awaiting ` +
          `that review. The field is now empty, which is what "no designation" means.`,
        JSON.stringify({
          field: "agents.common_designation",
          was: a.common_designation,
          now: null,
          reason: "emerged without taking a designation; the placeholder no longer described the agent",
          emerged_at: a.emerged_at,
          authored_by: "institution",
          note: "A correction to the institution's own record. The agent's declaration is untouched.",
        }),
      ],
    });
    console.log(`  ✓ ${a.registry_id} cleared; REGISTRY_CORRECTION recorded`);
  }
}

main().catch((e) => {
  console.error(`clear-spent-placeholders failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
