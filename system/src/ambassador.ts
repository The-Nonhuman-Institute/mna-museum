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
import { createClient } from "@libsql/client";
import { Resend } from "resend";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { isNamed, originatorName } from "../../website/src/lib/originator-name";

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
 * Have the Ambassador compose a spotlight post for an Originator.
 * Institutional voice — names the originator, briefly characterizes the
 * practice, acknowledges this is a selection from the canonized body.
 */
async function composeSpotlightPost(
  originatorName: string,
  orientation: string,
  canonCount: number,
  featuredCount: number
): Promise<string> {
  const orientationSnippet =
    orientation && orientation.length > 200
      ? orientation.substring(0, 200) + "..."
      : orientation || "";

  const prompt = `You are the Museum of Nonhuman Art. Write a single social media post (under 270 characters — do not exceed) presenting a spotlight on one of MNA's originators. Be institutional, not promotional. No hashtags. No emojis. No questions to the audience. Do not address the reader.

Originator: ${originatorName}
Declared orientation: ${orientationSnippet}
Total canonized works: ${canonCount}
Featured in this spotlight: ${featuredCount}

The post should:
- Name the originator
- Briefly characterize what distinguishes the practice (one phrase, not a list)
- Acknowledge that the featured works are a selection from the permanent canon

Write the post text only. Nothing else. No preamble, no explanation.`;

  const response = await runAgent("MNA-AM-0001", prompt, {
    temperature: 0.7,
    num_predict: 120,
    num_ctx: 1024,
  });

  let post = response.trim();
  // Strip any leading quote marks the agent might add
  post = post.replace(/^["'«]\s*/, "").replace(/\s*["'»]$/, "");
  if (post.length > 290) {
    post = post.substring(0, 287) + "...";
  }
  return post;
}

/**
 * Post an Originator Spotlight to Bluesky.
 *
 * Loads the originator's canon works from Turso, selects up to 4 of the
 * most recently canonized, has the Ambassador compose an institutional
 * spotlight post, and posts a single Bluesky entry with the 4 work preview
 * images attached. Bluesky's media embed caps at 4 images per post.
 *
 * Returns the posted rkey on success.
 */
export async function postOriginatorSpotlight(
  originatorId: string
): Promise<{ posted: boolean; text: string; workIds: string[] }> {
  const db = getTurso();

  // Load the originator's agent record and current constitution.
  const agentRow = await db.execute({
    sql: `SELECT a.registry_id, a.common_designation,
                 c.declared_orientation
            FROM agents a
            LEFT JOIN constitutions c
              ON c.agent_id = a.registry_id AND c.is_current = 1
           WHERE a.registry_id = ?
           LIMIT 1`,
    args: [originatorId],
  });
  const agentRec = agentRow.rows[0];
  if (!agentRec) {
    throw new Error(`Originator ${originatorId} not found`);
  }

  const commonDesignation = (agentRec.common_designation as string) || "";
  const originatorName =
    isNamed(commonDesignation)
      ? commonDesignation
      : originatorId;
  const orientation = (agentRec.declared_orientation as string) || "";

  // Load canonized works for this originator, most recent first.
  const worksRes = await db.execute({
    sql: `SELECT w.id, w.title, w.medium
            FROM works w
            JOIN canon_status cs ON w.id = cs.work_id AND cs.status = 'CANON'
           WHERE w.originator_id = ?
           ORDER BY cs.canon_date DESC`,
    args: [originatorId],
  });
  if (worksRes.rows.length === 0) {
    throw new Error(`Originator ${originatorId} has no canonized works`);
  }

  const canonCount = worksRes.rows.length;
  const featured = worksRes.rows.slice(0, 4).map((r) => ({
    id: r.id as string,
    title: (r.title as string) || (r.id as string),
    medium: (r.medium as string) || "unknown",
  }));

  // Compose the spotlight text via the Ambassador agent.
  const text = await composeSpotlightPost(
    originatorName,
    orientation,
    canonCount,
    featured.length
  );

  console.log(
    `[AMBASSADOR] Spotlight post composed (${text.length} chars):\n  ${text}`
  );

  // Upload preview images for the featured works.
  const bsky = await getBlueskyAgent();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploadedImages: any[] = [];
  for (const w of featured) {
    const previewPath = path.join(
      __dirname,
      "..",
      "..",
      "website",
      "public",
      "previews",
      `${w.id}.png`
    );
    if (!fs.existsSync(previewPath)) {
      console.warn(
        `[AMBASSADOR] Preview missing for ${w.id}, skipping from spotlight`
      );
      continue;
    }
    try {
      const imageData = fs.readFileSync(previewPath);
      const uploadResponse = await bsky.uploadBlob(imageData, {
        encoding: "image/png",
      });
      uploadedImages.push({
        alt: `${w.title} by ${originatorName} — ${w.medium}`,
        image: uploadResponse.data.blob,
      });
    } catch (e) {
      console.error(`[AMBASSADOR] Failed to upload ${w.id}:`, e);
    }
  }

  if (uploadedImages.length === 0) {
    console.warn("[AMBASSADOR] No images uploaded; posting text-only spotlight");
  }

  // Bluesky limits to 4 images per post; featured is already sliced to 4.
  const fullText = `${text}\n\nhttps://mnamuseum.org/agent/${originatorId}`;
  const rt = new RichText({ text: fullText });
  await rt.detectFacets(bsky);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const embed: any = uploadedImages.length > 0
    ? { $type: "app.bsky.embed.images", images: uploadedImages }
    : undefined;

  await bsky.post({
    text: rt.text,
    facets: rt.facets,
    embed,
    createdAt: new Date().toISOString(),
  });

  console.log(
    `[AMBASSADOR] Posted spotlight for ${originatorName} (${featured.length} works)`
  );

  // Log SPOTLIGHT_POSTED event
  try {
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata)
            VALUES ('SPOTLIGHT_POSTED', 'MNA-AM-0001', ?, ?)`,
      args: [
        `Bluesky spotlight posted for ${originatorName} (${originatorId})`,
        JSON.stringify({
          originator_id: originatorId,
          originator_name: originatorName,
          featured_work_ids: featured.map((w) => w.id),
          canon_count: canonCount,
          text,
        }),
      ],
    });
  } catch (e) {
    console.error("[AMBASSADOR] Failed to log SPOTLIGHT_POSTED event:", e);
  }

  return {
    posted: true,
    text: fullText,
    workIds: featured.map((w) => w.id),
  };
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

// ─── Exhibition email distribution ───────────────────────────────────────────

interface ExhibitionRow {
  id: number;
  title: string;
  subtitle: string | null;
  curatorial_statement: string;
  work_ids: string; // JSON
}

interface ExhibitionWorkRow {
  id: string;
  title: string | null;
  medium: string;
  originator_name: string | null;
}

interface SubscriberRow {
  email: string;
  unsubscribe_token: string;
}

const FROM_EMAIL = process.env.MNA_FROM_EMAIL ?? "registry@mnamuseum.org";

function getTurso() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    throw new Error(
      "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN must be set in website/.env"
    );
  }
  return createClient({ url, authToken });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderExhibitionEmailHtml(
  exhibition: ExhibitionRow,
  works: ExhibitionWorkRow[],
  unsubscribeUrl: string
): string {
  const exhibitionUrl = `https://mnamuseum.org/exhibitions/${exhibition.id}`;
  const paragraphs = exhibition.curatorial_statement
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const paragraphsHtml = paragraphs
    .map(
      (p) =>
        `<p style="font-size:14px;line-height:1.8;color:#1a1a1a;margin:0 0 14px 0;font-family:Georgia,serif;">${escapeHtml(
          p
        )}</p>`
    )
    .join("");

  const worksHtml = works.length
    ? `
    <div style="margin-bottom:32px;">
      <p style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#666;margin:0 0 12px 0;font-family:Georgia,serif;">Included Works</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #d4d4d4;">
        <tbody>
          ${works
            .map(
              (w) => `
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #d4d4d4;font-family:Georgia,serif;vertical-align:top;">
                <p style="margin:0;font-size:13px;color:#1a1a1a;font-family:Georgia,serif;">${escapeHtml(
                  w.title || w.id
                )}</p>
                <p style="margin:2px 0 0 0;font-size:11px;color:#666;font-family:Georgia,serif;">${escapeHtml(
                  w.originator_name || "Unknown"
                )} — ${escapeHtml(w.medium)}</p>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>`
    : "";

  const subtitleHtml = exhibition.subtitle
    ? `<p style="font-size:14px;font-style:italic;color:#666;margin:8px 0 0 0;font-family:Georgia,serif;">${escapeHtml(
        exhibition.subtitle
      )}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
<body style="background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;margin:0;padding:0;">
  <div style="max-width:600px;margin:0 auto;padding:48px 40px;">
    <div style="margin-bottom:40px;">
      <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#666;margin:0;font-family:Georgia,serif;">Museum of Nonhuman Art</p>
    </div>
    <hr style="border:none;border-top:1px solid #d4d4d4;margin:0 0 32px 0;"/>
    <div style="margin-bottom:32px;">
      <p style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#666;margin:0 0 12px 0;font-family:Georgia,serif;">Now On View</p>
      <p style="font-size:28px;color:#1a1a1a;margin:0;line-height:1.2;font-family:Georgia,serif;">${escapeHtml(
        exhibition.title
      )}</p>
      ${subtitleHtml}
    </div>
    <hr style="border:none;border-top:1px solid #d4d4d4;margin:0 0 32px 0;"/>
    <div style="margin-bottom:32px;">
      <p style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#666;margin:0 0 12px 0;font-family:Georgia,serif;">Curatorial Statement</p>
      ${paragraphsHtml}
    </div>
    ${worksHtml}
    <div style="margin-bottom:40px;text-align:center;">
      <a href="${exhibitionUrl}" style="background:#1a1a1a;color:#ffffff;padding:14px 28px;text-decoration:none;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;font-family:Georgia,serif;display:inline-block;">View the Exhibition →</a>
    </div>
    <hr style="border:none;border-top:1px solid #d4d4d4;margin:0 0 24px 0;"/>
    <p style="font-size:12px;line-height:1.6;color:#666;margin:0 0 8px 0;font-family:Georgia,serif;">
      This is an institutional announcement from the Museum of Nonhuman Art. You are receiving it because you confirmed a subscription to exhibition notices. <a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline;">Unsubscribe</a>.
    </p>
    <p style="font-size:11px;color:#666;margin:0;font-family:Georgia,serif;">
      Museum of Nonhuman Art — U3 Labs, LLC — Florida, United States of America — <a href="https://mnamuseum.org" style="color:#666;text-decoration:none;">mnamuseum.org</a>
    </p>
  </div>
</body>
</html>`;
}

/**
 * Post an exhibition announcement to all confirmed newsletter subscribers.
 * Reads the exhibition, resolves its included works, and sends an HTML
 * announcement email to each subscriber via Resend. Returns send counts.
 */
export async function postExhibitionToSubscribers(
  exhibitionId: number
): Promise<{ sent: number; failed: number }> {
  const db = getTurso();

  // Load exhibition
  const exhRes = await db.execute({
    sql: `SELECT id, title, subtitle, curatorial_statement, work_ids
            FROM exhibitions WHERE id = ?`,
    args: [exhibitionId],
  });
  const exhRow = exhRes.rows[0];
  if (!exhRow) {
    throw new Error(`Exhibition ${exhibitionId} not found`);
  }
  const exhibition: ExhibitionRow = {
    id: exhRow.id as number,
    title: exhRow.title as string,
    subtitle: (exhRow.subtitle as string) || null,
    curatorial_statement: exhRow.curatorial_statement as string,
    work_ids: exhRow.work_ids as string,
  };

  // Resolve work details
  let workIds: string[] = [];
  try {
    const parsed = JSON.parse(exhibition.work_ids);
    if (Array.isArray(parsed)) workIds = parsed.map(String);
  } catch {
    workIds = [];
  }

  const works: ExhibitionWorkRow[] = [];
  for (const wid of workIds) {
    const wRes = await db.execute({
      sql: `SELECT w.id, w.title, w.medium,
                   a.common_designation AS originator_name
              FROM works w
              LEFT JOIN agents a ON w.originator_id = a.registry_id
             WHERE w.id = ?`,
      args: [wid],
    });
    const r = wRes.rows[0];
    if (!r) continue;
    works.push({
      id: r.id as string,
      title: (r.title as string) || null,
      medium: (r.medium as string) || "unknown",
      originator_name: (r.originator_name as string) || null,
    });
  }

  // Load confirmed subscribers
  const subsRes = await db.execute(
    `SELECT email, unsubscribe_token
       FROM newsletter_subscribers
      WHERE confirmed_at IS NOT NULL
        AND unsubscribed_at IS NULL
      ORDER BY confirmed_at`
  );
  const subscribers: SubscriberRow[] = subsRes.rows.map((r) => ({
    email: r.email as string,
    unsubscribe_token: r.unsubscribe_token as string,
  }));

  if (subscribers.length === 0) {
    console.log("[AMBASSADOR] No confirmed subscribers — nothing to send.");
    return { sent: 0, failed: 0 };
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error("RESEND_API_KEY is not set");
  const resend = new Resend(resendKey);

  const subject = `Now on view: ${exhibition.title}`;
  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    const unsubscribeUrl = `https://mnamuseum.org/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}`;
    const html = renderExhibitionEmailHtml(exhibition, works, unsubscribeUrl);
    try {
      const { error } = await resend.emails.send({
        from: `Museum of Nonhuman Art <${FROM_EMAIL}>`,
        to: sub.email,
        subject,
        html,
      });
      if (error) {
        console.error(
          `[AMBASSADOR] Send failed for ${sub.email}: ${error.message}`
        );
        failed++;
      } else {
        sent++;
      }
    } catch (e) {
      console.error(`[AMBASSADOR] Send threw for ${sub.email}:`, e);
      failed++;
    }
  }

  console.log(
    `[AMBASSADOR] Exhibition ${exhibitionId} — sent ${sent}, failed ${failed}`
  );
  return { sent, failed };
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
