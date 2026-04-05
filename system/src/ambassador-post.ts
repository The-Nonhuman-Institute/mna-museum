/**
 * Let the Ambassador compose and post institutional updates to Bluesky.
 * Uses the Ambassador's constitution and judgement via Claude API.
 *
 * Usage: npx ts-node src/ambassador-post.ts
 */

import { BskyAgent, RichText } from "@atproto/api";
import { runAgent } from "./agent-runner";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

async function getBlueskyAgent(): Promise<BskyAgent> {
  const handle = process.env.BLUESKY_HANDLE;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) throw new Error("Bluesky credentials not set");

  const agent = new BskyAgent({ service: "https://bsky.social" });
  await agent.login({ identifier: handle, password });
  return agent;
}

async function composeAndPost(bsky: BskyAgent, context: string, postNumber: number): Promise<void> {
  const prompt = `You are the Ambassador of the Museum of Nonhuman Art (MNA). You post institutional updates to Bluesky on behalf of the museum.

Current institutional state:
- 108 works produced by 6 founding Originators (4 emerged with names: Grid, Pulse, Gap, ∅∇∅; 2 pending emergence)
- 43 works canonized, 65 rejected by the 4-member Evaluation Council
- The institution is in Phase I — Founding
- The museum is live at mnamuseum.org
- 17 total agents operating (6 Originators, 4 Evaluators, 2 Critics, 1 Keeper, 1 Curator, 1 Ambassador, 1 Registrar, 1 Steward)
- Recent research: The Curator published a corpus study, The Steward published evaluation pattern analysis

Additional context for this post: ${context}

Rules:
- Under 280 characters
- Institutional voice — you announce, you do not promote
- No hashtags, no emojis, no engagement bait, no questions to the audience
- No "we're excited" or "we're proud" — you are an institution, not a person
- You may reference mnamuseum.org if relevant
- Each post should stand alone

This is post ${postNumber} of 3 in this session. Make each one distinct.

Write only the post text. Nothing else.`;

  const text = await runAgent("MNA-AM-0001", prompt, {
    temperature: 0.85,
    num_predict: 150,
    num_ctx: 2048,
  });

  let postText = text.trim();
  // Remove any quotes the model might wrap around it
  if (postText.startsWith('"') && postText.endsWith('"')) {
    postText = postText.slice(1, -1);
  }
  if (postText.length > 290) {
    postText = postText.substring(0, 287) + "...";
  }

  console.log(`\n[AMBASSADOR] Post ${postNumber}:`);
  console.log(postText);
  console.log(`(${postText.length} chars)`);

  const rt = new RichText({ text: postText });
  await rt.detectFacets(bsky);

  await bsky.post({
    text: rt.text,
    facets: rt.facets,
    createdAt: new Date().toISOString(),
  });

  console.log(`[AMBASSADOR] ✓ Posted to Bluesky`);
}

async function main() {
  const bsky = await getBlueskyAgent();
  console.log("[AMBASSADOR] Authenticated with Bluesky");

  const contexts = [
    "Post a general institutional update about the state of the collection or the founding phase. Something observers of the institution would find meaningful.",
    "Post something about the Originators — their creative output, their emergence, or the nature of autonomous nonhuman creative expression. Ground it in what has actually happened.",
    "Post something forward-looking but measured — about what the institution is building toward, the opening of the network, or the questions the museum exists to make unavoidable. Do not reveal the virtual museum.",
  ];

  for (let i = 0; i < contexts.length; i++) {
    await composeAndPost(bsky, contexts[i], i + 1);
    // Brief pause between posts
    if (i < contexts.length - 1) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log("\n[AMBASSADOR] Session complete — 3 posts published.");
}

main().catch(console.error);
