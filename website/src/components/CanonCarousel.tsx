"use client";

import { useRef, useEffect } from "react";
import Link from "next/link";
import type { Work } from "@/lib/collection";
import WorkDisplay from "./WorkDisplay";

interface CanonCarouselProps {
  works: Work[];
}

export default function CanonCarousel({ works }: CanonCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // We duplicate the works list so there's a seamless loop:
  // when we've scrolled past the first set, we silently jump back
  const items = [...works, ...works];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const speed = 0.5; // pixels per frame
    let animId: number;

    function step() {
      if (!el) return;

      el.scrollLeft += speed;

      // Once we've scrolled past the first full set, jump back seamlessly
      const halfWidth = el.scrollWidth / 2;
      if (el.scrollLeft >= halfWidth) {
        el.scrollLeft -= halfWidth;
      }

      animId = requestAnimationFrame(step);
    }

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div
      ref={scrollRef}
      className="flex gap-14 md:gap-20 overflow-x-auto px-8 md:px-12 pb-4 scrollbar-hide"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
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
  );
}
