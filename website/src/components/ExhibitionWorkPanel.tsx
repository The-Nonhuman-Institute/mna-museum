"use client";

/**
 * ExhibitionWorkPanel — work presentation for the exhibition page.
 *
 * Renders a single work inside the standard MuseumFrame/MuseumPlinth that the
 * rest of the site uses, then a serif placard below it with title, originator,
 * phase, and links. The difference from WorkDisplay is purely the *surrounding*
 * composition: single column, generous vertical rhythm, sequence index, and a
 * larger "detail" size so works read at exhibition scale rather than
 * thumbnail scale. The frame treatment itself is unchanged.
 */

import Link from "next/link";
import WorkDisplay from "./WorkDisplay";
import type { Work } from "@/lib/collection";

interface ExhibitionWorkPanelProps {
  work: Work;
  index: number; // 1-based position in the curatorial sequence
}

export default function ExhibitionWorkPanel({ work, index }: ExhibitionWorkPanelProps) {
  return (
    <article className="flex flex-col items-center">
      {/* Sequence index — small, quiet, gives the visitor a sense of order */}
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted mb-5 font-sans">
        {String(index).padStart(2, "0")} / {work.medium}
      </div>

      {/* Framed work — same frame treatment as the rest of the site, but
          at the larger "detail" size so it reads at exhibition scale.
          Wrapped in a Link so the frame itself is clickable; the hover
          affordance is a subtle opacity shift on the contained frame.
          On mobile we cap the link width so the frame doesn't fill the
          entire viewport. MuseumFrame's internal maxWidth: 100% causes
          the frame and its content to scale down proportionally. */}
      <Link
        href={`/work/${work.id}`}
        aria-label={`View ${work.title || work.id}`}
        className="group inline-block w-[280px] sm:w-auto transition-opacity hover:opacity-90"
      >
        <WorkDisplay work={work} size="detail" showPlacard={false} framed={false} />
      </Link>

      {/* Placard — serif title, muted metadata, links */}
      <div className="mt-6 pb-2 max-w-[520px] text-center">
        <h3
          className="text-lg md:text-xl font-light italic mb-1.5 leading-snug"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {work.title || work.id}
        </h3>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted mb-3">
          {work.originator_name || work.originator_id}
          {work.phase_at_submission ? ` — Phase ${work.phase_at_submission}` : ""}
        </p>
        <div className="flex items-center justify-center gap-5">
          <Link
            href={`/work/${work.id}`}
            className="text-[10px] uppercase tracking-[0.18em] text-muted hover:text-foreground transition-colors"
          >
            View Work →
          </Link>
          <Link
            href={`/agent/${work.originator_id}`}
            className="text-[10px] uppercase tracking-[0.18em] text-muted hover:text-foreground transition-colors"
          >
            View Originator →
          </Link>
        </div>
      </div>
    </article>
  );
}
