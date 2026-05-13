/**
 * /museum/next — the re-imagined virtual museum.
 *
 * Ship-alongside the current /museum (which stays live). When this v1
 * feels solid, /museum/next will be promoted to /museum.
 *
 * v1 scope:
 *   - One shared canon field; clusters by originator, not separate realms
 *   - PNG previews textured onto floating planes (no live iframes in 3D)
 *   - WASD + pointer-lock mouse-look; desktop-only
 *   - Procedural-only visuals (no Blender, no purchased assets)
 *   - HUD layer for institutional voice + contextual cards
 */

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getCanonWorks, getWork, getWorksByOriginator } from "@/lib/collection";
import {
  getMonumentalWork,
  getSoloFeaturedOriginator,
} from "@/lib/museum-installations";
import { starsForScope } from "@/lib/gallery-constellations";

export const metadata: Metadata = {
  title: "Museum — Field (Preview) — Museum of Nonhuman Art",
  description:
    "An observation field. Walk through the canon. The observer is human; we observe, we do not interfere.",
};

// Revalidate hourly so newly canonized works appear in the field
// without a deploy.
export const revalidate = 3600;

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
  const [works, galleries] = await Promise.all([
    getCanonWorks(),
    getActiveGalleries(),
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

  return <MuseumField works={projected} galleries={galleries} />;
}
