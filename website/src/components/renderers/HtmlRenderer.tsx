"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * HtmlRenderer — mounts a sandboxed iframe with the work's HTML/CSS/JS
 * payload as srcDoc.
 *
 * Mount staggering. When many HtmlRenderers mount in the same render
 * (e.g. 24 work cards on /canon), some browsers (notably ChatGPT
 * Atlas, but also weaker mobile devices) hit a per-page concurrent-
 * iframe initialization cap and silently fail to start scripts in a
 * portion of the iframes — they render their first paint but never
 * animate. The fix is to space iframe srcDoc assignment in time so no
 * single moment has too many iframes warming up at once.
 *
 * Each HtmlRenderer claims the next slot from a module-level counter
 * on first render, then defers setting srcDoc by `slot * STAGGER_MS`.
 * The counter wraps every QUEUE_SIZE slots so navigation between
 * pages keeps delays bounded. Total spread is ~1.9s for the first 24
 * iframes — fast enough to feel like the gallery coming on row by
 * row, slow enough to clear browser caps.
 *
 * Sandbox policy. `allow-scripts` only — no allow-same-origin. With
 * allow-same-origin, every work iframe inherits the parent's origin
 * and runs in the parent's renderer process; on /canon (24 cards)
 * that means 24 iframes share one process, accumulate memory in one
 * heap, and saturate the parent's main thread. Atlas / Firefox /
 * weaker mobile devices die from this — animations stop, then
 * navigation locks, then the whole tab crashes.
 *
 * Without allow-same-origin each iframe gets a unique opaque origin
 * and (on browsers that honor cross-origin process isolation, which
 * includes all major Chromium and Firefox builds) is process-
 * isolated. Memory pressure is distributed; parent's main thread
 * stays free for input events and chrome rendering.
 *
 * Trade-off: a work payload that depends on same-origin features
 * (parent CSS variables, parent.location, document.cookie, fetches
 * to relative URLs against the parent origin) will silently fail
 * inside its iframe. If a canonized work renders blank in a card,
 * its payload needs same-origin and should be authored to be self-
 * contained instead — that's an originator-side fix, not a renderer
 * concern.
 *
 * Click handling. Gallery cards rely on an enclosing <Link> for
 * navigation. The iframe element does not receive `pointer-events:
 * none` (which is unreliable on sandboxed iframes, especially in
 * agent browsers); the card surface draws an explicit absolute
 * overlay above the iframe to capture clicks at the DOM level.
 */

const STAGGER_MS = 150;
const QUEUE_SIZE = 24;
let mountSlotCounter = 0;

function claimMountSlot(): number {
  const slot = mountSlotCounter % QUEUE_SIZE;
  mountSlotCounter += 1;
  return slot;
}

interface HtmlRendererProps {
  html: string;
  /** Reserved for detail/lightbox sizes — does not currently change
   *  any iframe attribute, but kept on the API so callers can declare
   *  intent. The card-level click overlay is what actually controls
   *  click capture vs pass-through. */
  interactive?: boolean;
}

export default function HtmlRenderer({ html, interactive = false }: HtmlRendererProps) {
  const slot = useMemo(() => claimMountSlot(), []);
  const delay = slot * STAGGER_MS;
  const [srcDoc, setSrcDoc] = useState<string | undefined>(
    delay === 0 ? html : undefined,
  );

  useEffect(() => {
    if (delay === 0) {
      setSrcDoc(html);
      return;
    }
    const t = setTimeout(() => setSrcDoc(html), delay);
    return () => clearTimeout(t);
  }, [html, delay]);

  return (
    <div className="w-full h-full bg-[#0e0c0a] relative">
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        className="w-full h-full border-0"
        title="Work"
        style={{ background: "#0e0c0a" }}
      />
      {/* Motion indicator for animated works — only on non-interactive
          card thumbnails. The detail/lightbox views provide their own
          UI so the indicator would be visual noise there. */}
      {!interactive ? (
        <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-40 pointer-events-none">
          <div className="w-1 h-2 bg-[#6a6560] rounded-full animate-pulse" />
          <div className="w-1 h-3 bg-[#6a6560] rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
          <div className="w-1 h-2 bg-[#6a6560] rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
        </div>
      ) : null}
    </div>
  );
}
