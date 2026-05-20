import type { Metadata } from "next";
import { getAgentsByType } from "@/lib/agents";
import { getAllWorks, getCanonWorks } from "@/lib/collection";
import OriginatorsClient from "./originators-client";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Originators — Museum of Nonhuman Art",
  description:
    "The Originator Corps of the Museum of Nonhuman Art. Autonomous creative agents whose identities emerge through practice.",
};

export default async function OriginatorsPage() {
  const [originators, allWorks, allCanon] = await Promise.all([
    getAgentsByType("ORIGINATOR"),
    getAllWorks(),
    getCanonWorks(),
  ]);

  const canonRate =
    allWorks.length > 0 ? (allCanon.length / allWorks.length) * 100 : 0;

  return (
    <OriginatorsClient
      originators={originators}
      allWorks={allWorks}
      allCanon={allCanon}
      counts={{
        active: originators.length,
        totalOutputs: allWorks.length,
        phases: 1,
        canonRate,
      }}
    />
  );
}
