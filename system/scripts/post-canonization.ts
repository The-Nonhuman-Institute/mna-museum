/**
 * Post a canonized work to Bluesky via the Ambassador.
 *
 * Thin wrapper around system/src/ambassador.ts#postCanonization that reads
 * the work's originator and title from Turso, then delegates to the
 * Ambassador. The Ambassador composes its own post text in its institutional
 * voice via Claude.
 *
 * Usage:
 *   npx tsx system/scripts/post-canonization.ts --work <work_id>
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { postCanonization } from "../src/ambassador";
import { isNamed, originatorName } from "../../website/src/lib/originator-name";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const workIdx = args.indexOf("--work");
const workId = workIdx >= 0 ? args[workIdx + 1] : null;

if (!workId) {
  console.error("Usage: npx tsx system/scripts/post-canonization.ts --work <work_id>");
  process.exit(1);
}

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;
if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing Turso credentials");
  process.exit(1);
}

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

async function main() {
  // Load work + originator
  const w = await db.execute({
    sql: "SELECT id, title, medium, originator_id FROM works WHERE id = ?",
    args: [workId!],
  });
  if (w.rows.length === 0) {
    console.error(`Work ${workId} not found`);
    process.exit(1);
  }
  const work = w.rows[0];

  // Verify canonized
  const cs = await db.execute({
    sql: "SELECT status FROM canon_status WHERE work_id = ?",
    args: [workId!],
  });
  if ((cs.rows[0]?.status as string) !== "CANON") {
    console.error(`Work ${workId} is not canonized (status: ${cs.rows[0]?.status || "unknown"})`);
    process.exit(1);
  }

  const origin = await db.execute({
    sql: "SELECT registry_id, common_designation FROM agents WHERE registry_id = ?",
    args: [work.originator_id as string],
  });
  const originator = origin.rows[0];
  if (!originator) {
    console.error(`Originator ${work.originator_id} not found`);
    process.exit(1);
  }

  // For pre-emergence originators, common_designation is "PENDING_EMERGENCE".
  // Fall back to registry_id so the Ambassador post doesn't reference the
  // placeholder string.
  const designation = originator.common_designation as string;
  const originatorName =
    isNamed(designation)
      ? designation
      : (originator.registry_id as string);

  console.log(`[ambassador] Posting canonization of ${workId}`);
  console.log(`[ambassador]   title: ${(work.title as string) || "(no title)"}`);
  console.log(`[ambassador]   originator: ${originatorName}`);
  console.log(`[ambassador]   medium: ${work.medium}`);

  await postCanonization(
    workId!,
    originator.registry_id as string,
    originatorName,
    (work.title as string) || null,
    (work.medium as string) || "unknown"
  );

  console.log("[ambassador] Posted.");
}

main().catch((err) => {
  console.error("[ambassador] Failed:", err);
  process.exit(1);
});
