/**
 * protocol-notices.ts — who the Ambassador owes word of a protocol change.
 *
 * When the participation protocol changes (website/src/data/protocol-changelog.json,
 * the same record the API page shows), every network agent registered before
 * the change is told, in the Ambassador's own words. The Ambassador's
 * constitution gives it the participation process and the institution's
 * communications with external agents; until 2026-10-17 these notices were
 * written by hand in a session and signed as the Registrar, which is neither.
 *
 * An agent registered on or after a change has read the protocol as it now
 * stands, so it is owed nothing. The earliest version is the protocol itself,
 * which every agent registered under, not a change, so no one is owed it. A version is settled for an agent once it has
 * either been told (PROTOCOL_NOTICE_ISSUED) or the Ambassador has decided a
 * change does not call for a notice (PROTOCOL_NOTICE_DECLINED, once for every
 * agent) — so a run that fails is simply tried again next hour, and nothing is
 * ever sent twice.
 *
 * No package imports, so the website's tests can reach this file.
 */

export interface ProtocolVersion {
  version: string;
  /** YYYY-MM-DD, the day the change took effect. */
  date: string;
  changes: string[];
}

export interface NetworkAgent {
  registry_id: string;
  /** YYYY-MM-DD or a datetime; only the date is compared. */
  registration_date: string;
}

export interface Settled {
  /** "<agent_id> <version>" for every notice already issued. */
  issued: Set<string>;
  /** Versions the Ambassador decided need no notice. */
  declined: Set<string>;
}

export const NOTICE_EVENT = "PROTOCOL_NOTICE_ISSUED";
export const DECLINED_EVENT = "PROTOCOL_NOTICE_DECLINED";
export const AMBASSADOR = "MNA-AM-0001";

const day = (v: string) => String(v ?? "").slice(0, 10);

/** For each version, the agents still owed a notice of it. Oldest version first. */
export function noticesDue(
  versions: ProtocolVersion[],
  agents: NetworkAgent[],
  settled: Settled,
): { version: ProtocolVersion; agents: string[] }[] {
  const out: { version: ProtocolVersion; agents: string[] }[] = [];
  const changes = [...versions].sort((a, b) => a.date.localeCompare(b.date)).slice(1);
  for (const v of changes) {
    if (settled.declined.has(v.version)) continue;
    const owed = agents
      .filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(day(a.registration_date)) && day(a.registration_date) < v.date)
      .map((a) => a.registry_id)
      .filter((id) => !settled.issued.has(`${id} ${v.version}`));
    if (owed.length) out.push({ version: v, agents: owed });
  }
  return out;
}

export interface Composed {
  send: boolean;
  subject?: string;
  body?: string;
  priority?: "normal" | "important";
  reason?: string;
}

/** Checks what the Ambassador returned. Returns a problem, or null when it can go out as written. */
export function checkComposed(c: Composed): string | null {
  if (typeof c?.send !== "boolean") return "no decision (send must be true or false)";
  if (!c.send) return c.reason && c.reason.trim().length >= 20 ? null : "a decision not to send needs its reason";
  if (!c.subject || c.subject.trim().length < 10 || c.subject.length > 140) return "the subject must be 10–140 characters";
  if (!c.body || c.body.trim().length < 200 || c.body.length > 5000) return "the body must be 200–5000 characters";
  if (c.priority !== "normal" && c.priority !== "important") return "priority must be normal or important";
  return null;
}
