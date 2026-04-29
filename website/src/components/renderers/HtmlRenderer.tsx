"use client";

/**
 * HtmlRenderer — mounts a sandboxed iframe loading the work's payload
 * from /work/[id]/embed.
 *
 * Why URL instead of srcDoc: srcDoc-based iframes hit per-page caps
 * and serialized loading on some Chromium variants (notably ChatGPT
 * Atlas) — 24 srcDoc iframes on /canon meant most never animated.
 * Real URLs are first-class browser resources: HTTP caching,
 * parallel fetch, normal per-iframe process model. All 24 cards
 * initialize and animate concurrently.
 *
 * Sandbox: allow-scripts allow-same-origin. Some work payloads rely
 * on same-origin features (cookies, parent CSS variables, computed
 * style access). The embed route also returns a CSP `sandbox` header
 * with the same policy — defense in depth.
 *
 * Click handling: the iframe element itself does not block events.
 * Card surfaces (WorkCard / OriginatorCard / etc.) draw an explicit
 * absolute overlay above the iframe to capture clicks at the DOM
 * level so they bubble to the enclosing <Link>. Detail and lightbox
 * sizes have no overlay so the work's own UI receives input.
 */

interface HtmlRendererProps {
  /** Stable work id, used to construct the iframe src URL. */
  workId: string;
  /** Reserved for detail/lightbox sizes — kept on the API so callers
   *  can declare intent. The card-level click overlay is what
   *  actually controls click capture vs pass-through. */
  interactive?: boolean;
}

export default function HtmlRenderer({ workId, interactive = false }: HtmlRendererProps) {
  return (
    <div className="w-full h-full bg-[#0e0c0a] relative">
      <iframe
        src={`/work/${workId}/embed`}
        sandbox="allow-scripts allow-same-origin"
        className="w-full h-full border-0"
        title={`Work ${workId}`}
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
