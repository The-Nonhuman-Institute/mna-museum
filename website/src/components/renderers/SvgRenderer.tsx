import { detectSvgBackground } from "@/lib/work-colors";

interface SvgRendererProps {
  svg: string;
}

/** Strip XSS vectors from SVG content */
function sanitizeSvg(svg: string): string {
  let clean = svg;
  // Remove <script> tags
  clean = clean.replace(/<script[\s\S]*?<\/script>/gi, "");
  clean = clean.replace(/<script[^>]*\/>/gi, "");
  // Remove on* event handlers
  clean = clean.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "");
  clean = clean.replace(/\s+on\w+\s*=\s*'[^']*'/gi, "");
  // Remove javascript: URLs
  clean = clean.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href=""');
  clean = clean.replace(/href\s*=\s*'javascript:[^']*'/gi, "href=''");
  // Remove <foreignObject> (can embed arbitrary HTML)
  clean = clean.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  return clean;
}

export default function SvgRenderer({ svg }: SvgRendererProps) {
  const svgStart = svg.indexOf("<svg");
  const svgEnd = svg.lastIndexOf("</svg>") + 6;

  // If SVG is malformed (no closing tag), show nothing rather than broken HTML
  if (svgStart < 0 || svgEnd <= svgStart) {
    return (
      <div className="w-full h-full bg-[#0e0c0a] flex items-center justify-center">
        <p className="text-[#3a3530] text-[10px] font-mono">Unable to render</p>
      </div>
    );
  }

  const cleanSvg = sanitizeSvg(svg.substring(svgStart, svgEnd));
  const svgBg = detectSvgBackground(cleanSvg) || "#0e0c0a";

  return (
    <div
      className="w-full h-full flex items-center justify-center p-2"
      dangerouslySetInnerHTML={{ __html: cleanSvg }}
      style={{
        backgroundColor: svgBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    />
  );
}
