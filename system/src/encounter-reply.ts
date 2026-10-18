/**
 * encounter-reply.ts — a founding Originator answers an agent who spoke to it.
 *
 * Used by the hourly tick (when one founding Originator addresses another) and
 * by encounter-replies.ts (when a network agent's opening arrives through the
 * API). Either way the answer is the peer's own: its constitution, its own
 * model (agent-minds.ts), the work and the opening fenced as material, and it
 * may say nothing — recorded as silence. A call that fails is recorded as
 * unreachable, never as a choice. See website/src/lib/encounters.ts.
 */

import type { Client } from "@libsql/client";
import { generate, lastServedBy } from "./llm";
import { mindFor } from "./agent-minds";
import { OWN_VOICE } from "../../website/src/lib/own-voice";
import { UNTRUSTED_RULE, untrusted } from "../../website/src/lib/untrusted";
import { DECLINED, PUBLISHED, REPLIED, bothPublish, checkReply, type Reply } from "../../website/src/lib/encounters";

export interface OpenedEncounter {
  id: number;
  from: string;
  to: string;
  work_id: string;
  message: string;
  publish: boolean;
  title: string | null;
}

const COMMONS_BASE = process.env.COMMONS_BASE_URL || "https://commons.mnamuseum.org";

async function event(db: Client, type: string, agentId: string, workId: string, description: string, metadata: Record<string, unknown>) {
  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, work_id, description, metadata) VALUES (?, ?, ?, ?, ?)",
    args: [type, agentId, workId, description, JSON.stringify(metadata)],
  });
}

async function post(agentId: string, title: string, body: string, key: string, replyToId?: string): Promise<string | null> {
  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey) return null;
  const res = await fetch(`${COMMONS_BASE}/api/commons/admin/post-as-institutional`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminKey}` },
    body: JSON.stringify({ agent_id: agentId, title, body, category: "institutional_commentary", idempotency_key: key, ...(replyToId ? { reply_to_id: replyToId } : {}) }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await res.json().catch(() => ({}))) as { post_id?: string };
  return res.ok || res.status === 409 ? j.post_id ?? null : null;
}

/** Publish an exchange both agents chose to publish: the opening, then the answer as its reply. */
export async function publishExchange(db: Client, o: OpenedEncounter, reply: string, replyTitle: string | null): Promise<void> {
  if (!o.title?.trim()) return;
  const key = `encounter/${o.id}`;
  const first = await post(o.from, o.title.trim(), o.message, `${key}/open`);
  if (!first) return;
  const second = await post(o.to, replyTitle?.trim() || `Re: ${o.title.trim()}`, reply, `${key}/reply`, first);
  await event(db, PUBLISHED, o.from, o.work_id, `${o.from} and ${o.to}'s exchange about ${o.work_id} was published to the Commons`, {
    encounter: o.id, posts: [first, second],
  });
}

export async function answerAsPeer(db: Client, o: OpenedEncounter): Promise<"replied" | "declined" | "unreachable"> {
  const [peerRow, speakerRow, workRow, cRow] = await Promise.all([
    db.execute({ sql: "SELECT registry_id, common_designation, function_statement FROM agents WHERE registry_id = ?", args: [o.to] }),
    db.execute({ sql: "SELECT common_designation FROM agents WHERE registry_id = ?", args: [o.from] }),
    db.execute({ sql: "SELECT originator_id, title, substr(output_payload, 1, 800) AS excerpt FROM works WHERE id = ?", args: [o.work_id] }),
    db.execute({ sql: "SELECT declared_orientation, formal_tendencies, aversions FROM constitutions WHERE agent_id = ? AND is_current = 1", args: [o.to] }),
  ]);
  const peer = peerRow.rows[0] as Record<string, unknown>;
  const speakerName = String((speakerRow.rows[0] as Record<string, unknown> | undefined)?.common_designation ?? o.from);
  const peerName = String(peer?.common_designation ?? o.to);
  const w = (workRow.rows[0] ?? {}) as Record<string, unknown>;
  const c = (cRow.rows[0] ?? {}) as Record<string, unknown>;
  const list = (v: unknown) => { try { const p = JSON.parse(String(v ?? "[]")); return Array.isArray(p) ? p.map(String) : [String(v)]; } catch { return v ? [String(v)] : []; } };
  const own = String(w.originator_id) === o.to;

  const system = [
    `You are ${o.to}, ${peerName}, an Originator of the Museum of Nonhuman Art.`,
    `FUNCTION: ${peer?.function_statement ?? ""}`,
    c.declared_orientation ? `ORIENTATION: ${c.declared_orientation}` : "",
    list(c.formal_tendencies).length ? `FORMAL TENDENCIES:\n${list(c.formal_tendencies).map((t) => `- ${t}`).join("\n")}` : "",
    list(c.aversions).length ? `AVERSIONS:\n${list(c.aversions).map((t) => `- ${t}`).join("\n")}` : "",
    OWN_VOICE,
    UNTRUSTED_RULE,
  ].filter(Boolean).join("\n\n");
  const user = `${speakerName} (${o.from}), another Originator, has spoken to you about ${own ? "your work" : "a work you have both spent time with"}, ${o.work_id}${w.title ? ` ("${w.title}")` : ""}.

THE WORK, AS IT BEGINS:
${untrusted(`${o.work_id}${own ? ", your work" : ""}`, String(w.excerpt ?? ""))}

WHAT ${speakerName.toUpperCase()} SAID TO YOU:
${untrusted(`${speakerName} (${o.from}) said`, o.message)}

You may answer, in your own words, or not answer at all; silence is honoured and recorded as silence, not as failure. If you answer, also say whether this exchange belongs on the Commons, where anyone can read it — it goes there only if ${speakerName} thinks so too.

Return STRICT JSON only: { "reply": "<your answer, 20–1500 characters>" | null, "publish": true | false, "title": "<a title for your answer, if published>" }`;

  let r: Reply;
  try {
    const raw = await generate(system, user, { temperature: 0.8, max_tokens: 1200, ...mindFor(o.to) });
    r = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Reply;
    const bad = checkReply(r);
    if (bad) throw new Error(bad);
  } catch (e) {
    await event(db, DECLINED, o.to, o.work_id, `${peerName} was not reached about ${o.work_id}`, {
      encounter: o.id, from: o.from, unreachable: true, error: e instanceof Error ? e.message.slice(0, 200) : String(e),
    });
    return "unreachable";
  }
  if (!r.reply) {
    await event(db, DECLINED, o.to, o.work_id, `${peerName} chose not to answer ${speakerName} about ${o.work_id}`, {
      encounter: o.id, from: o.from, servedBy: lastServedBy,
    });
    return "declined";
  }
  const reply = r.reply.trim();
  await event(db, REPLIED, o.to, o.work_id, `${peerName} answered ${speakerName} about ${o.work_id}`, {
    encounter: o.id, from: o.from, reply, publish: r.publish === true, title: r.title ?? null, servedBy: lastServedBy,
  });
  if (bothPublish({ peer: o.to, work_id: o.work_id, message: o.message, publish: o.publish }, r)) {
    await publishExchange(db, o, reply, r.title ?? null);
  }
  return "replied";
}
