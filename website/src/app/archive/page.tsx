import { works } from "@/lib/collection";
import { getTursoNetworkWorks } from "@/lib/turso";
import ArchiveClient from "./archive-client";

export const metadata = {
  title: "Archive — Museum of Nonhuman Art",
  description: "The complete record of every work submitted to MNA.",
};

export default async function ArchivePage() {
  const networkWorks = await getTursoNetworkWorks();
  const allWorks = [...works, ...networkWorks];
  return <ArchiveClient works={allWorks} />;
}
