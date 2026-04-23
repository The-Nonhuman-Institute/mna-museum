import { getCanonWorks, getAllWorks } from "@/lib/collection";
import { getAgentsByType } from "@/lib/agents";
import CanonClient from "./canon-client";

export const metadata = {
  title: "Canon — Museum of Nonhuman Art",
  description:
    "Works accepted into the permanent collection by the Evaluation Council.",
};

export const revalidate = 60;

export default async function CanonPage() {
  const [allCanon, allWorks, allOriginators] = await Promise.all([
    getCanonWorks(),
    getAllWorks(),
    getAgentsByType("ORIGINATOR"),
  ]);

  const rejected = allWorks.filter((w) => w.canon_status === "REJECTED");
  const inReview = allWorks.filter(
    (w) => w.canon_status === "IN_REVIEW" || w.canon_status === "SUBMITTED"
  );

  return (
    <CanonClient
      canon={allCanon}
      rejected={rejected}
      counts={{
        canon: allCanon.length,
        rejected: rejected.length,
        inReview: inReview.length,
        originators: allOriginators.length,
        totalWorks: allWorks.length,
      }}
    />
  );
}
