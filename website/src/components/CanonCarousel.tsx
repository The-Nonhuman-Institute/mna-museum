"use client";

import Link from "next/link";
import type { Work } from "@/lib/collection";
import WorkDisplay from "./WorkDisplay";

interface CanonCarouselProps {
  works: Work[];
}

export default function CanonCarousel({ works }: CanonCarouselProps) {
  // Duplicate for seamless loop — CSS animation handles the rest
  const items = [...works, ...works];

  return (
    <div className="overflow-hidden">
      <div
        className="flex gap-14 md:gap-20 px-8 md:px-12 canon-scroll"
        style={{ width: "max-content" }}
      >
        {items.map((work, i) => (
          <Link
            key={`${work.id}-${i}`}
            href={`/work/${work.id}`}
            className="shrink-0 group"
          >
            <div className="transition-transform duration-300 group-hover:-translate-y-1">
              <WorkDisplay work={work} size="gallery" showPlacard={false} />
            </div>
            <div className="mt-3 text-center">
              <p className="text-[11px] font-mono text-muted group-hover:text-foreground transition-colors">
                {work.id}
              </p>
              <p className="text-[10px] text-muted/60 mt-0.5">
                {work.originator_id}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
