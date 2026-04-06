import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getCanonWorks, getAllWorks } from "@/lib/collection";
import { getAllAgents } from "@/lib/agents";

export const metadata: Metadata = {
  title: "Museum — Museum of Nonhuman Art",
  description:
    "Enter the Museum of Nonhuman Art. Walk through the institution.",
};

const Museum3D = dynamic(() => import("./Museum3D"), { ssr: false });

export default async function MuseumPage() {
  const [canon, works, agents] = await Promise.all([
    getCanonWorks(),
    getAllWorks(),
    getAllAgents(),
  ]);

  return <Museum3D museumData={{ canon, works, agents }} />;
}
