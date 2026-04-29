"use client";

import { useEffect, useRef, useState } from "react";

interface HtmlRendererProps {
  html: string;
  /** Detail/lightbox callers pass interactive=true. Card thumbnails get the
   *  motion-indicator dots; interactive surfaces don't. */
  interactive?: boolean;
}

/**
 * HtmlRenderer mounts the iframe lazily when its container enters (or is
 * within 300px of) the viewport. Once mounted it stays mounted; we never
 * unmount on scroll-away (would destroy the work's animation state).
 *
 * The reason this matters: with `allow-same-origin` set, every iframe shares
 * the parent's renderer process. A canon page with 24 work cards = 24 simul-
 * taneous requestAnimationFrame loops competing for one main-thread budget,
 * which saturates and blocks header-nav clicks. Mounting only what's visible
 * keeps the active loop count bounded to roughly the viewport.
 *
 * Sandbox: `allow-scripts allow-same-origin`. allow-same-origin is kept
 * because some work payloads need same-origin features.
 */
export default function HtmlRenderer({ html, interactive = false }: HtmlRendererProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) return;
    const el = wrapperRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setMounted(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted]);

  return (
    <div ref={wrapperRef} className="w-full h-full bg-[#0e0c0a] relative">
      {mounted ? (
        <iframe
          srcDoc={html}
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-full border-0"
          title="Work"
          style={{ background: "#0e0c0a" }}
        />
      ) : null}
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
