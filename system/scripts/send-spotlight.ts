/**
 * MNA Originator Spotlight CLI
 *
 * Triggers the website's curator decision endpoint with a FEATURE_SPOTLIGHT
 * decision for a single Originator. The endpoint records the decision and
 * automatically composes & sends the Originator Spotlight email to all
 * confirmed subscribers.
 *
 * Usage (from system/):
 *   npx tsx scripts/send-spotlight.ts <originator-registry-id> [rationale]
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
  const registryId = process.argv[2];
  if (!registryId) {
    console.error(
      "Usage: npx tsx scripts/send-spotlight.ts <originator-registry-id> [rationale]"
    );
    process.exit(1);
  }
  const rationale =
    process.argv.slice(3).join(" ") ||
    "Spotlight feature triggered via CLI by the founding steward.";

  const origin = process.env.MNA_SITE_ORIGIN ?? "https://mnamuseum.org";
  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey) {
    console.error("MNA_ADMIN_KEY is not set in website/.env or system/.env");
    process.exit(1);
  }

  const url = `${origin}/api/curator/decision`;
  console.log(`[SPOTLIGHT] POST ${url} for ${registryId}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      decision_type: "FEATURE_SPOTLIGHT",
      work_ids: [registryId],
      rationale,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`[SPOTLIGHT] Failed (${response.status}): ${text}`);
    process.exit(1);
  }
  console.log(text);
}

main().catch((err) => {
  console.error("send-spotlight failed:", err);
  process.exit(1);
});
