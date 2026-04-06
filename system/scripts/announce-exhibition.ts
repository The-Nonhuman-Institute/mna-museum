/**
 * MNA Exhibition Announcement CLI
 *
 * Manually sends an exhibition announcement to all confirmed newsletter
 * subscribers. For testing/manual triggers — eventually the Curator's
 * exhibition creation flow will call this automatically.
 *
 * Usage (from system/):
 *   npx tsx scripts/announce-exhibition.ts <exhibition_id>
 */

import { postExhibitionToSubscribers } from "../src/ambassador";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npx tsx scripts/announce-exhibition.ts <exhibition_id>");
    process.exit(1);
  }
  const id = Number(arg);
  if (!Number.isFinite(id) || id <= 0) {
    console.error(`Invalid exhibition id: ${arg}`);
    process.exit(1);
  }

  const result = await postExhibitionToSubscribers(id);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("announce-exhibition failed:", err);
  process.exit(1);
});
