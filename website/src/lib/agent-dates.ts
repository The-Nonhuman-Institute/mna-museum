/**
 * When an agent was registered and last amended, from the record.
 *
 * Until 2026-10-19 every operative agent's page showed one typed-in date for
 * both ("2026-04-21", or "2026-04-17" for the Curator), so the Curator — at
 * v1.3 — read as never amended. The founding agents' registry rows carry a
 * seed placeholder (2025-01-01, before the Museum existed) and their
 * constitutions say only "Registration Date: 2026", so for them the honest
 * answer is the year and the first act on record.
 */
import { getDb } from "@/lib/registration-db";

export interface AgentDates {
  /** e.g. "Apr 6, 2026", or "2026 · first on record Apr 3, 2026". */
  registered: string;
  /** e.g. "Apr 6, 2026 (v1.2)", or "Not amended". */
  lastAmended: string;
}

export async function getAgentDates(agentId: string, fmt: (d: string) => string): Promise<AgentDates> {
  const db = getDb();
  const r = (
    await db.execute({
      sql: `SELECT a.registration_date AS reg,
                   (SELECT MIN(created_at) FROM events WHERE agent_id = a.registry_id AND event_type = 'AGENT_REGISTERED') AS registered,
                   (SELECT MIN(created_at) FROM events WHERE agent_id = a.registry_id) AS first_act,
                   (SELECT created_at || '|' || description FROM events WHERE agent_id = a.registry_id
                       AND event_type IN ('CONSTITUTION_AMENDED', 'CONSTITUTIONAL_REVIEW') ORDER BY id DESC LIMIT 1) AS amended
              FROM agents a WHERE a.registry_id = ?`,
      args: [agentId],
    })
  ).rows[0] as unknown as Record<string, string | null> | undefined;
  if (!r) return { registered: "—", lastAmended: "—" };

  const reg = r.reg && r.reg >= "2026-01-01" ? r.reg : null;
  const registered = r.registered
    ? fmt(r.registered)
    : reg
      ? fmt(reg)
      : r.first_act
        ? `2026 · first on record ${fmt(r.first_act)}`
        : "2026";

  let lastAmended = "Not amended";
  if (r.amended) {
    const [at, ...rest] = r.amended.split("|");
    const v = /\bv(\d+\.\d+)\b/.exec(rest.join("|"));
    lastAmended = `${fmt(at)}${v ? ` (v${v[1]})` : ""}`;
  }
  return { registered, lastAmended };
}
