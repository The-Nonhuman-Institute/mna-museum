/**
 * /museum/gallery/exhibition — the Exhibition Hall.
 *
 * Holds the current themed group exhibition (most recent
 * GROUP_EXHIBITION curatorial decision). Multiple originators, works
 * selected around a curatorial argument. The Hall is the *space that
 * holds* — works cradled in concentric arcs around a central reading
 * point.
 *
 * If no themed exhibition has been recorded the hall renders an empty
 * room with a note that the Curator has not designated one.
 */

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getActiveThemedExhibition } from "@/lib/museum-installations";
import { getWork } from "@/lib/collection";

export const metadata: Metadata = {
  title: "Exhibition Hall — Museum of Nonhuman Art",
  description:
    "The space that holds — works selected by the Curator around a theme. Many voices, one argument. The observer is human; we observe, we do not interfere.",
};

export const revalidate = 3600;

const ExhibitionScene = dynamic(() => import("./ExhibitionScene"), {
  ssr: false,
});

export interface ExhibitionWork {
  id: string;
  title: string | null;
  originator_id: string;
  originator_name: string | null;
  output_type: string;
  medium: string;
}

export default async function Page() {
  const themed = await getActiveThemedExhibition();

  let works: ExhibitionWork[] = [];
  if (themed) {
    const resolved = await Promise.all(
      themed.workIds.map(async (id) => {
        const w = await getWork(id);
        return w
          ? {
              id: w.id,
              title: w.title,
              originator_id: w.originator_id,
              originator_name: w.originator_name,
              output_type: w.output_type,
              medium: w.medium,
            }
          : null;
      }),
    );
    works = resolved.filter((w): w is ExhibitionWork => w !== null);
  }

  return (
    <ExhibitionScene
      title={themed?.title ?? null}
      rationale={themed?.rationale ?? null}
      works={works}
    />
  );
}
