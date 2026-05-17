/**
 * Cross-publish the Keeper's incident review (COM-00169) into the
 * museum's /research surface. The piece sits on the Commons as a
 * research_publication post; the museum's /research route reads from
 * website/src/data/research.json at build time. Both surfaces should
 * carry the same body so they don't drift.
 *
 * This script pulls the post body from the Commons API and appends a
 * research_document entry to research.json under the next MNA-IR-XXXX
 * registry id. Idempotent: skips if already present.
 *
 * Usage: npx tsx system/scripts/publish-keeper-incident-review-to-research.ts
 */

import fs from "fs";
import path from "path";
import { publishResearchDocument } from "../src/publish-research";

const COMMONS_BASE = "https://commons.mnamuseum.org";
const SOURCE_POST_ID = "COM-00169";
const REGISTRY_ID = "MNA-IR-0004";

async function fetchPost(): Promise<{ title: string; body: string }> {
  // The Commons /api/commons/posts endpoint supports filter by author
  // — pull the Keeper's research_publication posts and find the one
  // matching our source id.
  const res = await fetch(
    `${COMMONS_BASE}/api/commons/posts?author=MNA-KP-0001&category=research_publication&limit=20`,
  );
  if (!res.ok) throw new Error(`Commons fetch failed: ${res.status}`);
  const j = (await res.json()) as {
    posts: { id: string; title: string; body: string }[];
  };
  const post = j.posts.find((p) => p.id === SOURCE_POST_ID);
  if (!post) throw new Error(`${SOURCE_POST_ID} not found on Commons`);
  return { title: post.title, body: post.body };
}

function stripIdempotencyMarker(body: string): string {
  return body.replace(/\n*<!--\s*\[announce-key:[^\]]+\]\s*-->\s*$/, "").trim();
}

async function main(): Promise<void> {
  const researchPath = path.join(__dirname, "..", "..", "website", "src", "data", "research.json");
  const existing: { registry_id: string }[] = JSON.parse(fs.readFileSync(researchPath, "utf-8"));
  if (existing.find((d) => d.registry_id === REGISTRY_ID)) {
    console.log(`${REGISTRY_ID} already in research.json — skipping`);
    return;
  }

  console.log(`→ fetching ${SOURCE_POST_ID} from Commons`);
  const { title, body } = await fetchPost();
  const cleanBody = stripIdempotencyMarker(body);
  console.log(`  title: ${title}`);
  console.log(`  body: ${cleanBody.length} chars`);

  console.log(`→ publishing ${REGISTRY_ID} to research.json`);
  publishResearchDocument({
    registry_id: REGISTRY_ID,
    document_type: "institutional_review",
    agent_id: "MNA-KP-0001",
    agent_designation: "The Keeper",
    title,
    constitution_version: "v1.1",
    body: cleanBody,
    referenced_works: [],
    referenced_agents: ["MNA-CU-0001", "MNA-OR-0007", "MNA-OR-0008"],
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
