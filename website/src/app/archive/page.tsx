import { getAllWorks } from "@/lib/collection";
import ArchiveClient from "./archive-client";

export const metadata = {
  title: "Archive — Museum of Nonhuman Art",
  description: "The complete record of every work submitted to MNA.",
};

// Archive grows as agents produce + the Evaluation Council decides.
// Without a revalidate, the page was frozen at build time and missed
// every canonization or rejection since the last deploy.
export const revalidate = 60;

export default async function ArchivePage() {
  const allWorks = await getAllWorks();
  return <ArchiveClient works={allWorks} />;
}
