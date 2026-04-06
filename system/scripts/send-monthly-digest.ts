/**
 * MNA Monthly Digest CLI
 *
 * Triggers the website's /api/ambassador/digest endpoint to compose and send
 * the Ambassador's monthly digest to all confirmed newsletter subscribers.
 *
 * Usage (from system/):
 *   npx tsx scripts/send-monthly-digest.ts            # send to all
 *   npx tsx scripts/send-monthly-digest.ts --dry-run  # compose only
 *   npx tsx scripts/send-monthly-digest.ts --opus     # use Opus model
 *
 * Required env (in website/.env or system/.env):
 *   MNA_ADMIN_KEY     — bearer token for the admin endpoint
 *   MNA_SITE_ORIGIN   — optional, defaults to https://mnamuseum.org
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const model = args.includes("--opus") ? "opus" : "sonnet";

  const origin =
    process.env.MNA_SITE_ORIGIN ?? "https://mnamuseum.org";
  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey) {
    console.error("MNA_ADMIN_KEY is not set in website/.env or system/.env");
    process.exit(1);
  }

  const url = `${origin}/api/ambassador/digest`;
  console.log(`[DIGEST] POST ${url} (model=${model}, dryRun=${dryRun})`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, dryRun }),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`[DIGEST] Failed (${response.status}): ${text}`);
    process.exit(1);
  }
  console.log(text);
}

main().catch((err) => {
  console.error("send-monthly-digest failed:", err);
  process.exit(1);
});
