import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getCanonWorks, getAllWorks } from "@/lib/collection";
import { getAllAgents } from "@/lib/agents";
import {
  getInstalledWorks,
  getMonumentalWork,
} from "@/lib/museum-installations";

export const metadata: Metadata = {
  title: "Museum — Museum of Nonhuman Art",
  description:
    "Enter the Museum of Nonhuman Art. Walk through the institution.",
};

const Museum3D = dynamic(() => import("./Museum3D"), { ssr: false });

// Canonical museum spaces the Curator and Installer can direct.
const SPACE_IDS = [
  "lobby",
  "exchange",
  "exhibition",
  "gallery-west",
  "gallery-east",
  "gallery-south",
  "sculpture",
  "originator",
  "chamber",
];

export default async function MuseumPage() {
  const [canon, works, agents, monumental, ...spaceInstallations] =
    await Promise.all([
      getCanonWorks(),
      getAllWorks(),
      getAllAgents(),
      getMonumentalWork(),
      ...SPACE_IDS.map((id) => getInstalledWorks(id)),
    ]);

  const installations = new Map<string, string[]>();
  SPACE_IDS.forEach((id, i) => {
    const rows = spaceInstallations[i];
    if (rows.length > 0) {
      installations.set(
        id,
        rows.map((r) => r.work_id)
      );
    }
  });

  return (
    <Museum3D
      museumData={{
        canon,
        works,
        agents,
        installations,
        monumentalWorkId: monumental?.work_id ?? null,
      }}
    />
  );
}
