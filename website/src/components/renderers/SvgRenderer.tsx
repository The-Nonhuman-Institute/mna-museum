import { detectSvgBackground } from "@/lib/work-colors";

interface SvgRendererProps {
  svg: string;
}

export default function SvgRenderer({ svg }: SvgRendererProps) {
  // Extract just the SVG content, stripping anything before <svg
  const svgStart = svg.indexOf("<svg");
  const svgEnd = svg.lastIndexOf("</svg>") + 6;
  const cleanSvg =
    svgStart >= 0 && svgEnd > svgStart ? svg.substring(svgStart, svgEnd) : svg;

  // Use the SVG's own background if it defines one, otherwise default dark
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
