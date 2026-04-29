"use client";

/**
 * HtmlRenderer — mounts a sandboxed iframe with the work's HTML/CSS/JS
 * payload as srcDoc.
 *
 * Sandbox policy: `allow-scripts allow-same-origin`. allow-same-origin
 * is required because some work payloads rely on same-origin features
 * (cookies, parent CSS variables, computed style access, etc.) and
 * silently error without it.
 *
 * Click handling: gallery cards rely on an enclosing <Link> for
 * navigation. Clicks on the iframe area need to fall through to that
 * Link. We do *not* use `pointer-events: none` on the iframe — it has
 * historically been unreliable across browsers (especially on
 * sandboxed iframes) and Atlas appears to ignore it. Instead, the
 * card surface (WorkCard / OriginatorCard / etc.) draws an explicit
 * absolute overlay div above the iframe to capture the click at the
 * DOM level.
 */

interface HtmlRendererProps {
  html: string;
  /** Reserved for detail/lightbox sizes — does not currently change
   *  any iframe attribute, but kept on the API so callers can declare
   *  intent. The card-level click overlay (in WorkCard) is what
   *  actually controls click capture vs pass-through. */
  interactive?: boolean;
}

export default function HtmlRenderer({ html, interactive = false }: HtmlRendererProps) {
  return (
    <div className="w-full h-full bg-[#0e0c0a] relative">
      <iframe
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin"
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
