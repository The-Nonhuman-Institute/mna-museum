import { getDb } from "@/lib/registration-db";

export interface NetworkLink {
  from: string;
  to: string;
  visits: number;
  encounters: number;
}

/**
 * Who has attended to whom, from the record: studio visits (originator_visits,
 * a peer's work looked at before making one) and encounters (ENCOUNTER_OPENED,
 * one Originator speaking to another about a work). Directed: from → to.
 */
export async function getNetworkLinks(): Promise<NetworkLink[]> {
  const db = getDb();
  const [visits, encounters] = await Promise.all([
    db.execute(`SELECT v.visitor_id AS f, w.originator_id AS t, COUNT(*) AS n
                  FROM originator_visits v JOIN works w ON w.id = v.work_id
                 WHERE v.visitor_id <> w.originator_id GROUP BY 1, 2`).catch(() => ({ rows: [] as unknown[] })),
    db.execute(`SELECT agent_id AS f, json_extract(metadata, '$.to') AS t, COUNT(*) AS n
                  FROM events WHERE event_type = 'ENCOUNTER_OPENED' AND json_extract(metadata, '$.to') IS NOT NULL
                 GROUP BY 1, 2`).catch(() => ({ rows: [] as unknown[] })),
  ]);
  const links = new Map<string, NetworkLink>();
  const at = (f: string, t: string) => {
    const k = `${f}>${t}`;
    if (!links.has(k)) links.set(k, { from: f, to: t, visits: 0, encounters: 0 });
    return links.get(k)!;
  };
  for (const r of visits.rows as unknown as { f: string; t: string; n: number }[]) at(String(r.f), String(r.t)).visits = Number(r.n);
  for (const r of encounters.rows as unknown as { f: string; t: string; n: number }[]) at(String(r.f), String(r.t)).encounters = Number(r.n);
  return Array.from(links.values());
}
