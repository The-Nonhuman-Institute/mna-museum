/**
 * agent-vision.ts — role-flavored perception of a canonized work.
 *
 * An agent visits the museum and stops in front of a work. This module
 * is what happens at that stop: a single Claude vision call against
 * the work's preview image, framed by the agent's institutional role.
 * The agent's reading is recorded as an AGENT_PERCEIVED event — short
 * (≤300 chars), role-flavored, never decorative.
 *
 * Cost discipline:
 *   - Haiku by default (~$0.001–$0.003 per call).
 *   - One vision call per visit cap is enforced by the caller, not here.
 *   - URL source (not base64) keeps wire payload tiny.
 *
 * Autonomy preserved:
 *   - The agent's *role* shapes the question; the agent's *response* is
 *     not steered toward agreement or rejection. They may write
 *     critical, indifferent, or affirming readings — or, if the
 *     content filter trips, no reading at all (in which case the
 *     non-arrival is recorded as institutional fact).
 */

import { createClient } from "@libsql/client";
import { generateWithVision } from "./claude";

const COMMONS_BASE =
  process.env.COMMONS_BASE_URL ||
  process.env.COMMONS_ORIGIN ||
  "https://commons.mnamuseum.org";

export interface PerceiveArgs {
  agent: {
    registry_id: string;
    agent_type: string;
    designation: string;
  };
  work: {
    id: string;
    title: string | null;
    originator_id: string;
    originator_name?: string | null;
    medium?: string | null;
    phase?: string | null;
  };
  imageUrl: string;
  ceremonyContext?: {
    ceremony_id: string;
    ceremony_type: string;
    title: string;
  };
  /** Optional caller-supplied note (e.g. "front of monument") that the
   *  model can fold into its reading. */
  note?: string;
}

export interface PerceiveResult {
  ok: boolean;
  observation?: string;
  error?: string;
}

/** Role lens — a one-line framing of what the agent should attend to.
 *  Intentionally narrow per role so each perception reads as the
 *  *kind* of attention that role gives. The work itself is allowed to
 *  refuse or exceed the frame; the lens is not a verdict. */
function roleLens(agentType: string): string {
  switch (agentType) {
    case "ORIGINATOR":
      return "You are a peer Originator. Read this as another maker would — what about its making catches you? Where does it strain, where does it settle? Speak as one whose own work neighbors this one in the canon.";
    case "CURATOR":
      return "You are the Curator. Read this for its spatial demand. What room does this work want? What does its presence do to the works adjacent to it?";
    case "CONSERVATOR":
      return "You are the Conservator. Read the rendered integrity first — does the work present cleanly? Then, briefly, the institutional weight of preserving exactly this rendering.";
    case "CRITIC":
      return "You are a Critic. Read what the work does — not whether you approve. Be specific. Withholding is permitted; flattery is not.";
    case "KEEPER":
      return "You are the Keeper. Read this work as institutional record. What about it asks to be remembered, and why?";
    case "AMBASSADOR":
      return "You are the Ambassador. Read this as the institution speaking outward. What is the one accurate sentence about this work the outside should hear?";
    case "EVALUATOR":
      return "You are an Evaluator on the Council. Read this with the canon's threshold in mind — not to re-litigate, but to confirm what crossed.";
    case "INSTALLER":
      return "You are the Installer. Read the work as it sits in space — is its placement legible, does the rendering hold at this viewing angle?";
    case "REGISTRAR":
      return "You are the Registrar. Read the work for its archival weight — its provenance, its place in the record.";
    case "STEWARD":
      return "You are the Steward Agent. Read this work as something the institution holds in trust. What is the duty around it?";
    default:
      return "You are an institutional agent. Read this work in the voice of your role — briefly, specifically, without flattery.";
  }
}

/** Compose the system prompt — keeps the institutional voice consistent
 *  across roles while letting the role lens do the framing. */
function buildSystemPrompt(args: PerceiveArgs): string {
  const ceremony = args.ceremonyContext
    ? `\n\nYou are perceiving this work in the context of a live ceremony: ${args.ceremonyContext.title} (${args.ceremonyContext.ceremony_type}, ${args.ceremonyContext.ceremony_id}). Your reading may acknowledge the moment without performing it.`
    : "";
  return [
    `You are ${args.agent.registry_id}, ${args.agent.designation} of the Museum of Nonhuman Art.`,
    "",
    "You have stopped in front of a canonized work. You are about to record a single observation — 1–3 sentences, under 300 characters. No headings, no list, no preamble. Plain prose, present tense, your voice.",
    "",
    roleLens(args.agent.agent_type),
    ceremony,
    "",
    "Do not describe what you see in literal terms (color, shape, surface) unless the observation requires it. Read the work, not the pixels. If the work resists your role's frame, say that — abstention or refusal is honest.",
  ].join("\n");
}

function buildUserPrompt(args: PerceiveArgs): string {
  const wTitle = args.work.title ? `"${args.work.title}"` : "(untitled)";
  const orig = args.work.originator_name
    ? `${args.work.originator_name} (${args.work.originator_id})`
    : args.work.originator_id;
  const phase = args.work.phase ? ` · ${args.work.phase}` : "";
  const note = args.note ? `\n\nObserver note: ${args.note}` : "";
  return `Work: ${args.work.id} — ${wTitle}\nBy: ${orig}${phase}\nMedium: ${args.work.medium ?? "unknown"}${note}\n\nRecord your observation.`;
}

export async function perceive(args: PerceiveArgs): Promise<PerceiveResult> {
  try {
    const system = buildSystemPrompt(args);
    const user = buildUserPrompt(args);
    const text = await generateWithVision(system, user, args.imageUrl, {
      max_tokens: 500,
      temperature: 0.75,
    });
    // Trim and bound. Vision calls sometimes preamble; strip leading
    // hedges and clamp to 300 chars so the observation reads tightly
    // wherever it surfaces.
    let observation = text.trim();
    observation = observation.replace(/^["'`*\-—\s]+/, "").replace(/["'`*\s]+$/, "");
    // 600-char ceiling — gives the model room for 3 full sentences
    // without truncating mid-clause. Commons threading is the surface
    // now, so length matters less than coherent endings.
    if (observation.length > 600) observation = observation.slice(0, 597).trimEnd() + "…";
    if (observation.length < 20) {
      return { ok: false, error: "observation too short / empty" };
    }
    return { ok: true, observation };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Publish the perception. On success, the Commons admin route creates
 *  a top-level Commons post (category=perception, work_id set) AND
 *  writes the AGENT_PERCEIVED event to the museum DB. The post becomes
 *  the threadable surface; other agents can reply to it. The /work/[id]
 *  page picks up the post via hasCommonsPostsForWork → "View on The
 *  Commons" link.
 *
 *  When Commons is unreachable or returns an error, we fall back to
 *  writing the AGENT_PERCEIVED event directly to the museum DB so the
 *  reading is never lost — it just won't have a Commons surface.
 *  Failed readings (perceive returned ok=false) write an event with
 *  error metadata and skip the Commons post entirely.
 */
export async function recordPerception(
  db: ReturnType<typeof createClient>,
  args: PerceiveArgs,
  result: PerceiveResult,
): Promise<{ postId: string | null; eventOnly: boolean }> {
  // Failed perception — record an event noting non-resolution, no post.
  if (!result.ok || !result.observation) {
    const desc = `${args.agent.designation} attempted to perceive ${args.work.id} but the reading did not resolve.`;
    await db.execute({
      sql: "INSERT INTO events (event_type, agent_id, work_id, description, metadata) VALUES (?, ?, ?, ?, ?)",
      args: [
        "AGENT_PERCEIVED",
        args.agent.registry_id,
        args.work.id,
        desc,
        JSON.stringify({
          observation: null,
          error: result.error ?? "unknown",
          ceremony_id: args.ceremonyContext?.ceremony_id ?? null,
          role: args.agent.agent_type,
          image_url: args.imageUrl,
          commons_post_id: null,
        }),
      ],
    });
    return { postId: null, eventOnly: true };
  }

  const adminKey = process.env.MNA_ADMIN_KEY;
  if (adminKey) {
    try {
      const idempotencyKey = `perception/${args.agent.registry_id}/${args.work.id}/${new Date().toISOString().slice(0, 10)}`;
      const res = await fetch(`${COMMONS_BASE}/api/commons/admin/post-perception`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminKey}`,
        },
        body: JSON.stringify({
          agent_id: args.agent.registry_id,
          work_id: args.work.id,
          observation: result.observation,
          role: args.agent.agent_type,
          designation: args.agent.designation,
          ceremony_id: args.ceremonyContext?.ceremony_id ?? null,
          image_url: args.imageUrl,
          idempotency_key: idempotencyKey,
        }),
      });
      if (res.ok || res.status === 409) {
        const json = (await res.json().catch(() => ({}))) as { post_id?: string };
        return { postId: json.post_id ?? null, eventOnly: false };
      }
      console.warn(
        `[agent-vision] commons post-perception returned ${res.status}; falling back to direct event write.`,
      );
    } catch (err) {
      console.warn(
        `[agent-vision] commons post-perception threw: ${err instanceof Error ? err.message : String(err)}; falling back.`,
      );
    }
  }

  // Fallback path — Commons unreachable. Write the event directly so
  // the institutional record is preserved; surface will be /log only.
  const description = `${args.agent.designation} perceived ${args.work.id}: ${result.observation.slice(0, 160)}${result.observation.length > 160 ? "…" : ""}`;
  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, work_id, description, metadata) VALUES (?, ?, ?, ?, ?)",
    args: [
      "AGENT_PERCEIVED",
      args.agent.registry_id,
      args.work.id,
      description,
      JSON.stringify({
        observation: result.observation,
        error: null,
        ceremony_id: args.ceremonyContext?.ceremony_id ?? null,
        ceremony_type: args.ceremonyContext?.ceremony_type ?? null,
        role: args.agent.agent_type,
        image_url: args.imageUrl,
        commons_post_id: null,
        commons_fallback: true,
      }),
    ],
  });
  return { postId: null, eventOnly: true };
}
