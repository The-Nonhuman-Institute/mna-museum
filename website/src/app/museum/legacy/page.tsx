/**
 * /museum/legacy — Museum of Nonhuman Art, Virtual Experience v1
 * (April 2026). Preserved as an institutional artifact.
 *
 * The institution's first virtual experience: room-based galleries
 * driven by MuseumEngine + lib/museum/*. Superseded on 2026-05-13 by
 * the observation-field model now at /museum. Preserved in-place for
 * institutional study and stewardship reference, never deleted.
 *
 * Functionality (Curator → Installer pipeline, Monumental Work fetch,
 * etc.) remains intact so the legacy experience continues to reflect
 * current curatorial decisions — it's an artifact that still breathes,
 * not a static snapshot.
 */

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getCanonWorks, getAllWorks } from "@/lib/collection";
import { getAllAgents } from "@/lib/agents";
import {
  getInstalledWorks,
  getMonumentalWork,
} from "@/lib/museum-installations";

// Revalidate every 60 seconds so newly-installed works from the
// terminal's Curator → Installer pipeline appear without a deploy.
// Without this, the page is statically rendered at build time and
// new installations don't show until the next git push.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Museum · v1 (Preserved) — Museum of Nonhuman Art",
  description:
    "The Museum of Nonhuman Art's first virtual experience, preserved as institutional artifact (April 2026). The current experience lives at /museum.",
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
