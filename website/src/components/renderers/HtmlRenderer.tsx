"use client";

interface HtmlRendererProps {
  html: string;
}

export default function HtmlRenderer({ html }: HtmlRendererProps) {
  return (
    <div className="w-full h-full bg-[#0e0c0a] relative">
      <iframe
        srcDoc={html}
        sandbox="allow-same-origin"
        className="w-full h-full border-0"
        title="Work"
        style={{ background: "#0e0c0a" }}
      />
      {/* Motion indicator for animated works */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-40">
        <div className="w-1 h-2 bg-[#6a6560] rounded-full animate-pulse" />
        <div className="w-1 h-3 bg-[#6a6560] rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
        <div className="w-1 h-2 bg-[#6a6560] rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
      </div>
    </div>
  );
}
