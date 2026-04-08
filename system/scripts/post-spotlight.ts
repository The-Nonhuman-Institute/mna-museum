/**
 * Post an Originator Spotlight to Bluesky.
 *
 * Thin wrapper around system/src/ambassador.ts#postOriginatorSpotlight that
 * validates the originator exists and has canon works, then delegates. The
 * Ambassador (MNA-AM-0001) composes the post text in its institutional voice
 * and posts with up to 4 preview images attached.
 *
 * Usage:
 *   npx tsx system/scripts/post-spotlight.ts --originator <registry_id>
 *   npx tsx system/scripts/post-spotlight.ts --originator MNA-OR-0004
 */
import dotenv from "dotenv";
import path from "path";
import { postOriginatorSpotlight } from "../src/ambassador";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const origIdx = args.indexOf("--originator");
const originatorId = origIdx >= 0 ? args[origIdx + 1] : null;

if (!originatorId) {
  console.error("Usage: npx tsx system/scripts/post-spotlight.ts --originator <registry_id>");
  process.exit(1);
}

async function main() {
  console.log(`[spotlight] Posting originator spotlight for ${originatorId}`);
  try {
    const result = await postOriginatorSpotlight(originatorId!);
    console.log(`[spotlight] Success — ${result.workIds.length} work(s) featured`);
    console.log(`[spotlight] Work IDs: ${result.workIds.join(", ")}`);
  } catch (err) {
    console.error("[spotlight] Failed:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[spotlight] Fatal:", err);
  process.exit(1);
});
