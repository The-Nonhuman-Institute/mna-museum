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
import { getCanonWorks } from "@/lib/collection";

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

export default async function Page() {
  const works = await getCanonWorks();

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
  }));

  return <MuseumField works={projected} />;
}
