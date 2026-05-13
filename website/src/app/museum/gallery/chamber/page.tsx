/**
 * /museum/gallery/chamber — The Chamber.
 *
 * Holds a single monumental work selected by the Curator
 * (MNA-CU-0001 v1.1). Reached from the field at /museum/next by aiming
 * at the Chamber constellation and pressing E (or tapping the label).
 *
 * The featured work is determined by the most recent active
 * `museum_installations` row with display_treatment='monumental' in
 * space 'chamber'. If none exists, the Chamber renders empty with a
 * note explaining the Curator has not placed a work here yet.
 */

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getMonumentalWork } from "@/lib/museum-installations";
import { getWork } from "@/lib/collection";

export const metadata: Metadata = {
  title: "The Chamber — Museum of Nonhuman Art",
  description:
    "A monumental space. One featured work, placed by the Curator. The observer is human; we observe, we do not interfere.",
};

export const revalidate = 3600;

const ChamberScene = dynamic(() => import("./ChamberScene"), { ssr: false });

export default async function Page() {
  const monumental = await getMonumentalWork();
  const work = monumental ? await getWork(monumental.work_id) : null;

  const featuredWork = work
    ? {
        id: work.id,
        title: work.title,
        originator_id: work.originator_id,
        originator_name: work.originator_name,
        medium: work.medium,
        output_type: work.output_type,
        canon_date: work.canon_date,
        phase_at_submission: work.phase_at_submission,
        // For scene-json works, pass the full payload so the Chamber
        // can render the actual 3D geometry at monumental scale rather
        // than the flat preview PNG. Other output types fall back to
        // the preview image.
        scene_payload:
          work.output_type === "scene-json" ? work.output_payload : null,
      }
    : null;

  return <ChamberScene featuredWork={featuredWork} />;
}
