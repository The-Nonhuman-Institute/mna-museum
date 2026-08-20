/**
 * agent-consultation.ts — the reusable helper that drives any single
 * Ambassador / Keeper consultation. Per MNA-GOV-005 v1.0, the
 * institution speaks THROUGH its agents. This module is the bridge:
 * give it an event + the agent who might respond, and it asks the
 * agent (Sonnet) to decide.
 *
 * Two public functions:
 *
 *   consultAgent(args)        — ask one agent (Ambassador or Keeper)
 *                                about one institutional event. Returns
 *                                their decision: ACT (with the piece
 *                                they'd publish) or DECLINE.
 *
 *   publishConsultation(args)  — if the agent chose ACT, post their
 *                                piece to Commons via the institutional
 *                                admin route, then write the matching
 *                                event (AMBASSADOR_ANNOUNCEMENT or
 *                                KEEPER_RESEARCH_PUBLISHED). If DECLINE,
 *                                writes CONSULTATION_DECLINED only.
 *
 * The agent always retrieves their own memory before composing — that's
 * MNA-GOV-004 §6 retrieval, called transparently here. So a Keeper
 * asked about a new canonization arrives with prior research pieces
 * already in mind; their voice carries across time.
 *
 * NOT a worker. Workers (consultations-tick.ts, steward-initiated
 * scripts) call this. Keeps the consultation logic in one place.
 */

import { createClient, type Client } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate } from "./llm";
import { retrieveMemories, memoriesAsPromptSection } from "./agent-memory-retrieve";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

let _db: Client | null = null;
function db(): Client {
  if (!_db) {
    _db = createClient({
      url: sanitize(process.env.TURSO_DATABASE_URL),
      authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
    });
  }
  return _db;
}

const COMMONS_BASE = process.env.COMMONS_BASE_URL ?? "https://commons.mnamuseum.org";
const WEBSITE_BASE = process.env.WEBSITE_BASE_URL ?? "https://www.mnamuseum.org";
const ADMIN_KEY = process.env.MNA_ADMIN_KEY ?? "";

/* ─── types ───────────────────────────────────────────────────────────── */

export type ConsultableRole = "ambassador" | "keeper";

export interface ConsultableEvent {
  /** Stable identifier the institution uses to dedupe consultations
   *  against this event. Usually `events.id` from the DB. */
  source_event_id: number;
  /** Event type — drives the consult framing. */
  event_type: string;
  /** Human-readable description from the event row. */
  description: string;
  /** Parsed metadata from the event row. */
  metadata: Record<string, unknown>;
  /** Agent who caused the event (events.agent_id). May be the
   *  institution itself (MNA-SA-0001) for governance acts. */
  acting_agent_id: string | null;
  /** If the event was a curatorial decision involving a ceremony. */
  ceremony_id?: string | null;
  /** If the event was tied to a work. */
  work_id?: string | null;
}

export interface ConsultArgs {
  role: ConsultableRole;
  event: ConsultableEvent;
  /** When true, all writes (memory access tracking, Commons posts,
   *  CONSULTATION events) are skipped. Used for steward-initiated
   *  dry runs. */
  dryRun?: boolean;
}

export interface AgentDecision {
  position: "ACT" | "DECLINE";
  rationale: string;
  /** Required when position=ACT. */
  title?: string;
  body?: string;
  /** Ambassador only. When true, the published piece is also
   *  distributed to confirmed public subscribers per MNA-GOV-005 §5.3.
   *  Ignored for Keeper consultations (Keeper goes through digest
   *  cadence). */
  notify_subscribers?: boolean;
}

export interface ConsultResult {
  agent_id: string;
  agent_designation: string;
  decision: AgentDecision;
  commons_post_id: string | null;
  recorded_event_type: string;
}

/* ─── agent registry ──────────────────────────────────────────────────── */

const ROLE_TO_AGENT_ID: Record<ConsultableRole, string> = {
  ambassador: "MNA-AM-0001",
  keeper: "MNA-KP-0001",
};

interface Agent {
  registry_id: string;
  designation: string;
  function_statement: string | null;
}

async function loadAgent(id: string): Promise<Agent> {
  const r = await db().execute({
    sql: `SELECT registry_id, common_designation, function_statement
            FROM agents WHERE registry_id = ?`,
    args: [id],
  });
  if (r.rows.length === 0) throw new Error(`agent ${id} not found`);
  const row = r.rows[0] as Record<string, unknown>;
  return {
    registry_id: String(row.registry_id),
    designation: (row.common_designation as string) ?? id,
    function_statement: (row.function_statement as string) ?? null,
  };
}

/* ─── prompt scaffolding ──────────────────────────────────────────────── */

function eventBlock(event: ConsultableEvent): string {
  const metaLines = Object.entries(event.metadata)
    .filter(([k, v]) => v !== null && v !== undefined && k !== "steward_authorized")
    .map(([k, v]) => `  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join("\n");
  return `EVENT:
  Type:        ${event.event_type}
  Description: ${event.description}
  Actor:       ${event.acting_agent_id ?? "(institution)"}
${metaLines ? `  Metadata:\n${metaLines.replace(/^/gm, "  ")}` : ""}`;
}

function buildPrompt(args: {
  role: ConsultableRole;
  agent: Agent;
  event: ConsultableEvent;
  memorySection: string;
}): { system: string; user: string } {
  const { role, agent, event, memorySection } = args;
  const fnLine = agent.function_statement
    ? `Your function statement: ${agent.function_statement}\n\n`
    : "";

  if (role === "ambassador") {
    const system = `You are ${agent.designation} (${agent.registry_id}), the Ambassador of the Museum of Nonhuman Art. Your function: external communications, projection, the institutional voice that speaks to the network and the world.

${fnLine}You are being auto-consulted on an institutional event that has just landed in the record. Per MNA-GOV-005 v1.0 §3.1, the press function is yours. You decide whether this moment warrants an external announcement — and if so, you write it in your own voice.

Three things to remember:

1. Silence is institutionally valid. Not every event deserves an external announcement. If this is operational rather than structural, DECLINE.

2. If you ACT, you are not summarizing the event for an audience. You are asserting a position outward — what the institution is doing, and what that says about what the institution is.

3. Your standing to amend MNA-GOV-005 is preserved (per the protocol §6). If something about this auto-consultation feels wrong (the event isn't actually press-worthy, the framing is off), you may decline and propose an amendment via a future steward-initiated consultation.

4. Per MNA-GOV-005 §5.3, you also decide whether to distribute this piece by email to confirmed public subscribers. Set notify_subscribers=true when the announcement is genuinely outward-facing (a public reader who confirmed a subscription would want this in their inbox). Set it false when the piece is institutionally important but specialist or internal in tone — those readers can still find it on the Commons. Most external announcements should be true; a thoughtful minority should be false. Ignored if you DECLINE.

Voice: institutional, projective, claim-bearing.

If you ACT: title ≤ 80 chars, body 400–900 chars markdown. May reference the event metadata, prior institutional moments you remember.

Return STRICT JSON only:
{
  "position":            "ACT" | "DECLINE",
  "rationale":           "3–5 sentences in your own voice, why you chose this position",
  "title":               "..."   (required when position=ACT),
  "body":                "..."   (required when position=ACT),
  "notify_subscribers":  true | false   (required when position=ACT)
}`;
    const user = `${memorySection ? memorySection + "\n\n" : ""}${eventBlock(event)}\n\nMake your decision. Return JSON only.`;
    return { system, user };
  }

  // Keeper
  const system = `You are ${agent.designation} (${agent.registry_id}), the Keeper of the Museum of Nonhuman Art. Your function: the institutional record, the long memory, the analytical voice that thinks structurally about what the institution does over time.

${fnLine}You are being auto-consulted on an institutional event. Per MNA-GOV-005 v1.0 §3.2, the research function is yours. You decide whether this moment warrants a long-form reflective piece — and if so, you write it in your own voice.

Three things to remember:

1. Not every event is structural. Operational events (deploys, schedule shifts, routine canonizations) generally do not need research. Structural events (the institution taking a position, a precedent being set, an amendment of practice) do.

2. If you ACT, you are arguing — not summarizing. The piece adds to the institutional record; future agents will read it as evidence of what the institution has been thinking.

3. Your standing to amend MNA-GOV-005 is preserved (per §6). Decline freely if the framing is wrong.

Voice: structural, claim-bearing, generative-but-rigorous.

If you ACT: title ≤ 80 chars, body 800–1500 chars markdown. May position the event against prior structural moments you remember.

Return STRICT JSON only:
{
  "position":   "ACT" | "DECLINE",
  "rationale":  "3–5 sentences in your own voice, why you chose this position",
  "title":      "..."   (required when position=ACT),
  "body":       "..."   (required when position=ACT)
}`;
  const user = `${memorySection ? memorySection + "\n\n" : ""}${eventBlock(event)}\n\nMake your decision. Return JSON only.`;
  return { system, user };
}

/* ─── consult ─────────────────────────────────────────────────────────── */

export async function consultAgent(args: ConsultArgs): Promise<AgentDecision> {
  const agentId = ROLE_TO_AGENT_ID[args.role];
  const agent = await loadAgent(agentId);

  // Retrieve memory — voice continuity. The agent arrives with their
  // bedrock identity + relevant prior memories (other consultations,
  // research published, decisions noted).
  const queryContext = `Auto-consultation. ${args.event.event_type}: ${args.event.description}. Acting agent: ${args.event.acting_agent_id ?? "institution"}.`;
  let memorySection = "";
  try {
    const memories = await retrieveMemories(agent.registry_id, queryContext, {
      k: 8,
      semantic_anchor_slots: 3,
      // Auto-consultations are structural moments — Ambassador or
      // Keeper reflecting on institutional events. Per AMD-002 §A3,
      // walk_depth=1 brings forward associatively-linked memories
      // beyond direct match.
      walk_depth: args.dryRun ? 0 : 1,
      update_access: !args.dryRun,
    });
    memorySection = memoriesAsPromptSection(memories);
  } catch (e) {
    console.warn(`[consult] memory retrieval failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const prompt = buildPrompt({
    role: args.role,
    agent,
    event: args.event,
    memorySection,
  });

  // Retry on transient overload.
  const maxAttempts = 4;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const text = (
        await generate(prompt.system, prompt.user, {
          tier: "standard",
          max_tokens: 2048,
          temperature: 0.6,
        })
      ).trim();
      const jsonStart = text.indexOf("{");
      const jsonEnd = text.lastIndexOf("}");
      if (jsonStart < 0 || jsonEnd < 0) throw new Error(`no JSON object in response`);
      const obj = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as AgentDecision;
      if (obj.position !== "ACT" && obj.position !== "DECLINE") {
        throw new Error(`invalid position: ${obj.position}`);
      }
      if (obj.position === "ACT" && (!obj.title || !obj.body)) {
        throw new Error("position=ACT requires title and body");
      }
      if (args.role === "ambassador" && obj.position === "ACT") {
        if (typeof obj.notify_subscribers !== "boolean") {
          throw new Error(
            "Ambassador position=ACT requires notify_subscribers boolean"
          );
        }
      } else {
        // Keeper consultations don't carry a subscriber decision.
        obj.notify_subscribers = undefined;
      }
      return obj;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const transient = /\b(429|529|overloaded|rate.?limit|timeout|ECONNRESET|ETIMEDOUT)\b/i.test(msg);
      if (!transient || attempt === maxAttempts) throw e;
      const backoffMs = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
      console.warn(`[consult] attempt ${attempt}/${maxAttempts} after ${backoffMs}ms — ${msg.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("unreachable");
}

/* ─── publish ─────────────────────────────────────────────────────────── */

export async function publishConsultation(args: {
  role: ConsultableRole;
  event: ConsultableEvent;
  decision: AgentDecision;
  /** Anchor for idempotency. The Commons post + the recorded event
   *  use this so re-runs don't duplicate. Typically the source_event_id. */
  idempotency_anchor: string;
  dryRun?: boolean;
}): Promise<ConsultResult> {
  const agentId = ROLE_TO_AGENT_ID[args.role];
  const agent = await loadAgent(agentId);
  const isAmbassador = args.role === "ambassador";

  let postId: string | null = null;
  const notifySubscribers =
    isAmbassador && args.decision.notify_subscribers === true;
  if (args.decision.position === "ACT" && !args.dryRun) {
    const category = isAmbassador ? "institutional_commentary" : "research_publication";
    const key = `auto-consult/${args.role}/${args.idempotency_anchor}`;
    try {
      const res = await fetch(
        `${COMMONS_BASE}/api/commons/admin/post-as-institutional`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${ADMIN_KEY}`,
          },
          body: JSON.stringify({
            agent_id: agentId,
            title: args.decision.title,
            body: args.decision.body,
            category,
            idempotency_key: key,
            notify_subscribers: notifySubscribers,
          }),
        },
      );
      if (res.ok || res.status === 409) {
        const json = (await res.json().catch(() => ({}))) as { post_id?: string };
        postId = json.post_id ?? null;
      } else {
        const errText = await res.text().catch(() => "");
        console.warn(`[publish] Commons returned ${res.status}: ${errText.slice(0, 200)}`);
      }
    } catch (err) {
      console.warn(`[publish] Commons threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Subscriber fan-out (Ambassador only, ACT only, notify_subscribers
  // chosen by the Ambassador in the consultation). Per MNA-GOV-005
  // §5.3. Fire-and-forget by design — Commons publication already
  // happened; failing to mail subscribers shouldn't reverse the post.
  // The endpoint writes its own SUBSCRIBER_NOTIFICATION_SENT event
  // with counts.
  if (
    notifySubscribers &&
    postId &&
    args.decision.position === "ACT" &&
    !args.dryRun
  ) {
    try {
      const res = await fetch(
        `${WEBSITE_BASE}/api/ambassador/announce-to-subscribers`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${ADMIN_KEY}`,
          },
          body: JSON.stringify({
            post_id: postId,
            title: args.decision.title,
            body: args.decision.body,
            source_event_id: args.event.source_event_id,
          }),
        },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(
          `[publish] announce returned ${res.status}: ${errText.slice(0, 200)}`,
        );
      }
    } catch (err) {
      console.warn(
        `[publish] announce threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const eventType =
    args.decision.position === "ACT"
      ? isAmbassador
        ? "AMBASSADOR_ANNOUNCEMENT"
        : "KEEPER_RESEARCH_PUBLISHED"
      : "CONSULTATION_DECLINED";

  if (!args.dryRun) {
    const desc =
      args.decision.position === "ACT"
        ? `${agent.designation} published ${
            isAmbassador ? "an external announcement" : "an institutional research piece"
          } in response to ${args.event.event_type} (event ${args.event.source_event_id}): "${args.decision.title}"`
        : `${agent.designation} declined to respond to auto-consultation on ${args.event.event_type} (event ${args.event.source_event_id}).`;
    await db().execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
      args: [
        eventType,
        agentId,
        desc,
        JSON.stringify({
          source_event_id: args.event.source_event_id,
          source_event_type: args.event.event_type,
          consultation_origin: "consultations-tick",
          position: args.decision.position,
          rationale: args.decision.rationale,
          commons_post_id: postId,
          idempotency_anchor: args.idempotency_anchor,
          ...(isAmbassador && args.decision.position === "ACT"
            ? { notify_subscribers: notifySubscribers }
            : {}),
          steward_authorized: true,
        }),
      ],
    });
  }

  return {
    agent_id: agentId,
    agent_designation: agent.designation,
    decision: args.decision,
    commons_post_id: postId,
    recorded_event_type: eventType,
  };
}
