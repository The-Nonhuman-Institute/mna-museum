"use client";

interface HtmlRendererProps {
  html: string;
  /** When true, the iframe accepts clicks and keyboard input so the work's
   *  own UI (toggles, buttons, hover states) actually runs. Cards / thumbnails
   *  should stay non-interactive so clicks fall through to the enclosing link;
   *  detail and lightbox views should set this. */
  interactive?: boolean;
}

export default function HtmlRenderer({ html, interactive = false }: HtmlRendererProps) {
  return (
    <div className="w-full h-full bg-[#0e0c0a] relative">
      <iframe
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin"
        className={`w-full h-full border-0 ${interactive ? "" : "pointer-events-none"}`}
        title="Work"
        style={{ background: "#0e0c0a" }}
      />
      {/* Motion indicator for animated works — only when the iframe is
          non-interactive; when interactive, the work provides its own UI. */}
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
