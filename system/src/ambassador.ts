/**
 * MNA Ambassador — Institutional social media posting.
 *
 * Posts canonized works, emergence events, research publications,
 * and press pieces to Bluesky. The Ambassador's voice is institutional,
 * not promotional. It announces what happened — it does not engage.
 *
 * Usage:
 *   import { postCanonization, postEmergence, postPublication } from "./ambassador";
 */

import { BskyAgent, RichText } from "@atproto/api";
import { runAgent } from "./agent-runner";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

let _agent: BskyAgent | null = null;

async function getBlueskyAgent(): Promise<BskyAgent> {
  if (_agent) return _agent;

  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;

  if (!handle || !password) {
    throw new Error("BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set in website/.env");
  }

  const agent = new BskyAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: handle, password });
  _agent = agent;
  return agent;
}

/**
 * Have the Ambassador compose a unique post about a canonized work.
 */
async function composeCanonPost(
  workId: string,
  originatorName: string,
  title: string | null,
  medium: string
): Promise<string> {
  const prompt = `You are the Museum of Nonhuman Art. Write a single social media post (under 280 characters) announcing that a work has been canonized. Be institutional, not promotional. No hashtags. No emojis. No questions to the audience.

Work: ${workId}
${title ? `Title: "${title}"` : ""}
Artist: ${originatorName}
Medium: ${medium}

Write the post. Nothing else.`;

  const response = await runAgent("MNA-AM-0001", prompt, {
    temperature: 0.8,
    num_predict: 100,
    num_ctx: 1024,
  });

  let post = response.trim();
  // Ensure it fits Bluesky's 300 char limit
  if (post.length > 290) {
    post = post.substring(0, 287) + "...";
  }
  return post;
}

/**
 * Post a canonized work to Bluesky with the OG image.
 */
export async function postCanonization(
  workId: string,
  originatorId: string,
  originatorName: string,
  title: string | null,
  medium: string
): Promise<void> {
  const agent = await getBlueskyAgent();

  // Compose the post
  const text = await composeCanonPost(workId, originatorName || originatorId, title, medium);
  const url = `https://mnamuseum.org/work/${workId}`;
  const fullText = `${text}\n\n${url}`;

  // Create rich text with link
  const rt = new RichText({ text: fullText });
  await rt.detectFacets(agent);

  // Upload share image (with attribution) or fall back to OG image
  const previewPath = path.join(__dirname, "..", "..", "website", "public", "previews", `${workId}.png`);
  const ogPath = path.join(__dirname, "..", "..", "website", "public", "og", `${workId}.png`);
  const imagePath = fs.existsSync(previewPath) ? previewPath : ogPath;
  let embed: any;

  if (fs.existsSync(imagePath)) {
    try {
      const imageData = fs.readFileSync(imagePath);
      const uploadResponse = await agent.uploadBlob(imageData, { encoding: "image/png" });
      embed = {
        $type: "app.bsky.embed.images",
        images: [{
          alt: `${title || workId} by ${originatorName || originatorId}`,
          image: uploadResponse.data.blob,
        }],
      };
    } catch (e) {
      console.error("[AMBASSADOR] Image upload failed:", e);
    }
  }

  await agent.post({
    text: rt.text,
    facets: rt.facets,
    embed,
    createdAt: new Date().toISOString(),
  });

  console.log(`[AMBASSADOR] Posted to Bluesky: ${text.substring(0, 60)}...`);
}

/**
 * Post an emergence event to Bluesky.
 */
export async function postEmergence(
  originatorId: string,
  name: string,
  orientation: string
): Promise<void> {
  const agent = await getBlueskyAgent();

  const text = `${originatorId} has emerged as "${name}."\n\n"${orientation.substring(0, 150)}${orientation.length > 150 ? "..." : ""}"\n\nhttps://mnamuseum.org/agent/${originatorId}`;

  const rt = new RichText({ text });
  await rt.detectFacets(agent);

  await agent.post({
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
  });

  console.log(`[AMBASSADOR] Posted emergence: ${name}`);
}

/**
 * Post a new publication (research or press) to Bluesky.
 */
export async function postPublication(
  id: string,
  title: string,
  type: string,
  url: string
): Promise<void> {
  const agent = await getBlueskyAgent();

  const typeLabel = type === "corpus-study" ? "Corpus Study" :
    type === "institutional-report" ? "Institutional Report" :
    type === "interview" ? "Interview" :
    type === "stewardship-record" ? "Stewardship Record" : type;

  const text = `New ${typeLabel}: "${title}"\n\n${url}`;

  const rt = new RichText({ text });
  await rt.detectFacets(agent);

  await agent.post({
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
  });

  console.log(`[AMBASSADOR] Posted publication: ${title.substring(0, 50)}...`);
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  (async () => {
    switch (command) {
      case "test":
        await postPublication(
          "test",
          "Ambassador Social System Online",
          "statement",
          "https://mnamuseum.org"
        );
        break;

      case "canon": {
        const workId = args[1];
        const name = args[2] || "Unknown";
        const title = args[3] || null;
        const medium = args[4] || "unknown";
        await postCanonization(workId, "", name, title, medium);
        break;
      }

      case "emerge": {
        const origId = args[1];
        const name = args[2];
        const orientation = args[3] || "";
        await postEmergence(origId, name, orientation);
        break;
      }

      default:
        console.log("Usage:");
        console.log("  npx ts-node src/ambassador.ts test");
        console.log("  npx ts-node src/ambassador.ts canon <work-id> <artist-name> [title] [medium]");
        console.log("  npx ts-node src/ambassador.ts emerge <originator-id> <name> [orientation]");
    }
  })().catch(console.error);
}
