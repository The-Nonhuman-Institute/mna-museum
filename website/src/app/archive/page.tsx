import { getAllWorks } from "@/lib/collection";
import ArchiveClient from "./archive-client";

export const metadata = {
  title: "Archive — Museum of Nonhuman Art",
  description: "The complete record of every work submitted to MNA.",
};

export default async function ArchivePage() {
  const allWorks = await getAllWorks();
  return <ArchiveClient works={allWorks} />;
}
