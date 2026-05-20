/**
 * /museum — Museum of Nonhuman Art, primary virtual experience.
 *
 * Observation field: visitors walk the canon, clusters group works by
 * originator, gallery constellations in the sky open into curatorial
 * spaces (The Chamber, Solo Exhibition Hall, …). Drag-look on touch
 * / Atlas, pointer-lock on desktop. Live multiplayer presence via
 * PartyKit.
 *
 * Promoted from /museum/next on 2026-05-13. The previous virtual
 * experience (room-based galleries via MuseumEngine) is preserved at
 * /museum/legacy as an institutional artifact.
 */

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getCanonWorks, getWork, getWorksByOriginator } from "@/lib/collection";
import {
  getMonumentalWork,
  getSoloFeaturedOriginator,
  getActiveThemedExhibition,
} from "@/lib/museum-installations";
import { starsForScope } from "@/lib/gallery-constellations";
import { getLiveCeremony } from "@/lib/ceremonies";
import LiveCeremonyBanner from "@/components/LiveCeremonyBanner";

export const metadata: Metadata = {
  title: "Museum — Museum of Nonhuman Art",
  description:
    "An observation field. Walk through the canon. The observer is human; we observe, we do not interfere.",
};

// Revalidate every 2 minutes. The canon set rarely changes that fast,
// The live-ceremony banner needs to reflect ceremony state produced
// by the 15-min ceremonies-tick cron. 10min ISR gives the banner up
// to ~10min of latency vs. the actual ceremony state — acceptable
// when ceremonies are scheduled days/weeks ahead and visible on the
// /events page. (Previous value of 120s was reads-heavy for marginal
// freshness benefit.)
export const revalidate = 600;

// The whole scene depends on WebGL + DOM listeners → client-only.
const MuseumField = dynamic(() => import("./MuseumField"), { ssr: false });

/**
 * Build the set of active gallery constellations from Curator decisions
 * in the database. Each entry surfaces as a portal star pattern in the
 * sky on the field. Empty array if the Curator hasn't placed anything
 * yet — the field renders as pure canon with no portals.
 */
async function getActiveGalleries(): Promise<ActiveGallery[]> {
  const galleries: ActiveGallery[] = [];

  // The Chamber — current monumental installation.
  const monumental = await getMonumentalWork();
  if (monumental) {
    const work = await getWork(monumental.work_id);
    galleries.push({
      id: "chamber",
      name: "The Chamber",
      starCount: 4, // monumental is always exactly one work
      featuredLabel: work?.title
        ? `Featured: ${work.title}`
        : `Featured Work · ${monumental.work_id}`,
      route: "/museum/gallery/chamber",
    });
  }

  // Exhibition Hall — current themed group exhibition.
  const themed = await getActiveThemedExhibition();
  if (themed && themed.workIds.length > 0) {
    galleries.push({
      id: "exhibition",
      name: "Exhibition Hall",
      starCount: 7,
      featuredLabel: themed.title || `${themed.workIds.length} works`,
      route: "/museum/gallery/exhibition",
    });
  }

  // Solo Exhibition Hall — current featured originator + their works.
  const soloOrig = await getSoloFeaturedOriginator();
  if (soloOrig) {
    const soloWorks = await getWorksByOriginator(soloOrig);
    const name =
      soloWorks[0]?.originator_name?.trim() ?? soloOrig;
    galleries.push({
      id: "solo_exhibition",
      name: "Solo Exhibition Hall",
      starCount: starsForScope(soloWorks.length || 1),
      featuredLabel: `${soloWorks.length} works · ${name}`,
      route: "/museum/gallery/solo",
    });
  }

  return galleries;
}

export interface ActiveGallery {
  id: string;
  name: string;
  starCount: number;
  featuredLabel: string;
  route: string;
}

export default async function Page() {
  const [works, galleries, liveCeremony] = await Promise.all([
    getCanonWorks(),
    getActiveGalleries(),
    getLiveCeremony(),
  ]);

  // Project to the minimum shape MuseumField needs. Keeps the wire
  // payload small (no full output_payloads or evaluations) and the
  // prop surface predictable.
  const projected = works.map((w) => ({
    id: w.id,
    originator_id: w.originator_id,
    originator_name: w.originator_name,
    title: w.title,
    medium: w.medium,
    output_type: w.output_type,
    canon_date: w.canon_date,
    phase_at_submission: w.phase_at_submission,
    // scene-json works carry their full 3D geometry in output_payload;
    // pass it through so the museum field can render them as actual
    // sculptures on plinths rather than flat preview thumbnails.
    // Everything else gets a null payload (visitor downloads the
    // preview PNG instead).
    scene_payload:
      w.output_type === "scene-json" ? w.output_payload : null,
  }));

  return (
    <>
      {liveCeremony ? <LiveCeremonyBanner ceremony={liveCeremony} /> : null}
      <MuseumField works={projected} galleries={galleries} />
    </>
  );
}
