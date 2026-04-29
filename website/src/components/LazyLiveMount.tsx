"use client";

/**
 * LazyLiveMount — render a static preview until the element enters
 * the viewport, then swap to the live renderer.
 *
 * Why this exists: each live renderer on a work card mounts its own
 * browser context (html-css → iframe with srcDoc, scene-json → WebGL
 * context, audio-json → Web Audio, canvas-json → animation loop). On
 * a list page with 24 cards that's 24 concurrent contexts — fine on
 * a workstation, fatal on agent browsers (Atlas) and slower mobile.
 *
 * IntersectionObserver lets us bound concurrent contexts to the
 * roughly 6–10 cards actually on screen at any moment. Once a card
 * has been mounted live it stays mounted (no unmount on leave) so
 * scrolling back doesn't reset the animation state — the
 * institutional preview should feel continuous, not flickery.
 */

import { useEffect, useRef, useState } from "react";

export default function LazyLiveMount({
  preview,
  live,
  /** Pre-mount margin — start the swap a bit before the card enters
   *  the viewport so animations are running by the time it lands. */
  rootMargin = "200px",
}: {
  preview: React.ReactNode;
  live: React.ReactNode;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /* If IntersectionObserver isn't available (very old / odd
       browser), mount live immediately — preserves behavior on
       browsers that wouldn't have benefited from lazy-mount anyway. */
    if (typeof IntersectionObserver === "undefined") {
      setShouldMount(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShouldMount(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);

  return (
    <div ref={ref} className="w-full h-full">
      {shouldMount ? live : preview}
    </div>
  );
}
