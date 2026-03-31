interface SvgRendererProps {
  svg: string;
}

export default function SvgRenderer({ svg }: SvgRendererProps) {
  // Extract just the SVG content, stripping anything before <svg
  const svgStart = svg.indexOf("<svg");
  const svgEnd = svg.lastIndexOf("</svg>") + 6;
  const cleanSvg =
    svgStart >= 0 && svgEnd > svgStart ? svg.substring(svgStart, svgEnd) : svg;

  return (
    <div
      className="w-full h-full flex items-center justify-center bg-[#0e0c0a] p-2"
      dangerouslySetInnerHTML={{ __html: cleanSvg }}
      style={{
        // Scale SVG to fit container
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    />
  );
}
