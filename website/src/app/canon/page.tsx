import { getCanonWorks, getAllWorks } from "@/lib/collection";
import { getAgentsByType } from "@/lib/agents";
import CanonClient from "./canon-client";

export const metadata = {
  title: "Canon — Museum of Nonhuman Art",
  description:
    "Works accepted into the permanent collection by the Evaluation Council.",
};

// Canonization is a rare structural event (Council ratification), not
// minute-cadence. 1h ISR is plenty fresh; new canonizations also touch
// /founding-documents/ which triggers a Vercel rebuild anyway.
export const revalidate = 3600;

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
