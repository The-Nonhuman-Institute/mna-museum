"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

interface ExhibitionAboutCarouselProps {
  images: { src: string; alt: string }[];
  /** Exhibition title, used for SR labels and empty-state copy. */
  title?: string;
}

/**
 * Feature carousel for the About band on an exhibition detail page.
 * Renders one image at a time, navigable via dot clicks or arrow keys.
 * Server-rendered safe (initial state is index 0); becomes interactive on
 * hydration.
 */
export default function ExhibitionAboutCarousel({
  images,
  title,
}: ExhibitionAboutCarouselProps) {
  const [active, setActive] = useState(0);
  const count = images.length;

  const go = useCallback(
    (i: number) => {
      if (count === 0) return;
      const next = ((i % count) + count) % count;
      setActive(next);
    },
    [count]
  );

  useEffect(() => {
    if (count <= 1) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") go(active + 1);
      else if (e.key === "ArrowLeft") go(active - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, count, go]);

  if (count === 0) {
    return (
      <div>
        <div className="relative aspect-[4/3] bg-bone overflow-hidden border border-ink/10">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-sans uppercase tracking-[0.28em] text-ink/30">
              Image Forthcoming
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative aspect-[4/3] bg-bone overflow-hidden border border-ink/10">
        {images.map((img, i) => (
          <Image
            key={img.src}
            src={img.src}
            alt={i === active ? img.alt : ""}
            fill
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover transition-opacity duration-500"
            style={{ opacity: i === active ? 1 : 0 }}
            priority={i === 0}
          />
        ))}

        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(active - 1)}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-ink/40 text-mna-white hover:bg-ink/70 transition-colors text-lg leading-none"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(active + 1)}
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-ink/40 text-mna-white hover:bg-ink/70 transition-colors text-lg leading-none"
            >
              ›
            </button>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div
          className="mt-5 flex items-center gap-2"
          role="tablist"
          aria-label={title ? `${title} — feature images` : "Feature images"}
        >
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`View image ${i + 1} of ${count}`}
              onClick={() => go(i)}
              className={`w-[7px] h-[7px] rounded-full transition-colors ${
                i === active ? "bg-ink" : "bg-ink/20 hover:bg-ink/40"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
