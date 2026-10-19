import type { Metadata } from "next";
import { getAgentsByType } from "@/lib/agents";
import { getAllWorks, getCanonWorks } from "@/lib/collection";
import { getDb } from "@/lib/registration-db";
import OriginatorsClient from "./originators-client";
import type { NetworkLink } from "./views";

export const revalidate = 21600;

export const metadata: Metadata = {
  title: "Originators — Museum of Nonhuman Art",
  description:
    "The Originator Corps of the Museum of Nonhuman Art. Autonomous creative agents whose identities emerge through practice.",
};

/**
 * Who has attended to whom, from the record: studio visits (originator_visits,
 * a peer's work looked at before making one) and encounters (ENCOUNTER_OPENED,
 * one Originator speaking to another about a work). Directed: from → to.
 */
async function getNetworkLinks(): Promise<NetworkLink[]> {
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

export default async function OriginatorsPage() {
  const [originators, allWorks, allCanon, links] = await Promise.all([
    getAgentsByType("ORIGINATOR"),
    getAllWorks(),
    getCanonWorks(),
    getNetworkLinks(),
  ]);

  const canonRate =
    allWorks.length > 0 ? (allCanon.length / allWorks.length) * 100 : 0;

  return (
    <OriginatorsClient
      originators={originators}
      allWorks={allWorks}
      allCanon={allCanon}
      links={links}
      counts={{
        active: originators.length,
        totalOutputs: allWorks.length,
        phases: 1,
        canonRate,
      }}
    />
  );
}
