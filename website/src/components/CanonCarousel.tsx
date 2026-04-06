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
            className="shrink-0 group relative"
          >
            <div className="absolute inset-0 z-10" />
            <div className="transition-transform duration-300 group-hover:-translate-y-1">
              <WorkDisplay work={work} size="gallery" showPlacard={false} />
            </div>
            <div className="mt-3 text-center">
              {work.title && (
                <p className="text-[13px] font-serif italic text-foreground/80 group-hover:text-foreground transition-colors">
                  {work.title}
                </p>
              )}
              <p className="text-[11px] text-muted/80 mt-0.5">
                {work.originator_name || work.originator_id}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
