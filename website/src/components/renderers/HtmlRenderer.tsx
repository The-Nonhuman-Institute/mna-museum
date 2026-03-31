"use client";

interface HtmlRendererProps {
  html: string;
}

export default function HtmlRenderer({ html }: HtmlRendererProps) {
  return (
    <div className="w-full h-full bg-[#0e0c0a]">
      <iframe
        srcDoc={html}
        sandbox="allow-same-origin"
        className="w-full h-full border-0"
        title="Work"
        style={{ background: "#0e0c0a" }}
      />
    </div>
  );
}
