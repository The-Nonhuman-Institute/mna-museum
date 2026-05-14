/**
 * /museum/gallery/solo — The Solo Exhibition Hall.
 *
 * Holds the current solo-featured originator's body of canon work,
 * arranged as a corridor procession. The featured originator is the
 * subject of the most recent FEATURE_SOLO / FEATURE_SOLO_EXHIBITION
 * curatorial decision. If none exists the hall renders empty with a
 * note that the Curator has not designated a solo originator yet.
 */

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getActiveSoloExhibition } from "@/lib/museum-installations";
import { getWork } from "@/lib/collection";
import { getAgent } from "@/lib/agents";

export const metadata: Metadata = {
  title: "Solo Exhibition Hall — Museum of Nonhuman Art",
  description:
    "A sustained voice. One originator's body of canon work, in procession. The observer is human; we observe, we do not interfere.",
};

export const revalidate = 3600;

const SoloScene = dynamic(() => import("./SoloScene"), { ssr: false });

export interface SoloWork {
  id: string;
  title: string | null;
  output_type: string;
  medium: string;
  canon_date: string | null;
}

export default async function Page() {
  const solo = await getActiveSoloExhibition();

  // Resolve the works in the order the Curator/steward placed them.
  // Drop any ids that no longer resolve (deleted or moved out of
  // canon) — the hall renders only what's actually present.
  let works: SoloWork[] = [];
  if (solo) {
    const resolved = await Promise.all(
      solo.workIds.map(async (id) => {
        const w = await getWork(id);
        return w
          ? {
              id: w.id,
              title: w.title,
              output_type: w.output_type,
              medium: w.medium,
              canon_date: w.canon_date,
            }
          : null;
      }),
    );
    works = resolved.filter((w): w is SoloWork => w !== null);
  }

  const agent = solo ? await getAgent(solo.originatorId) : null;

  return (
    <SoloScene
      originatorId={solo?.originatorId ?? null}
      originatorName={agent?.designation ?? solo?.originatorId ?? null}
      exhibitionTitle={solo?.title ?? null}
      works={works}
    />
  );
}
