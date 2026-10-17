import { detectSvgBackground } from "@/lib/work-colors";
import { extractSvg, svgImageSrc } from "@/lib/svg-image";

interface SvgRendererProps {
  svg: string;
}

/**
 * An SVG work, shown as an image so nothing in it can act on the page around
 * it (see lib/svg-image.ts). It used to be inlined after a regex sanitiser,
 * which a <style>, an entity-encoded URL or an unusual tag could get past.
 *
 * `data-svg-work` is how renderPartToCanvas finds the picture to draw when an
 * SVG is another work's ingredient.
 */
export default function SvgRenderer({ svg }: SvgRendererProps) {
  const src = svgImageSrc(svg);

  // If SVG is malformed (no closing tag), show nothing rather than broken HTML
  if (!src) {
    return (
      <div className="w-full h-full bg-[#0e0c0a] flex items-center justify-center">
        <p className="text-[#3a3530] text-[10px] font-sans">Unable to render</p>
      </div>
    );
  }

  const svgBg = detectSvgBackground(extractSvg(svg) ?? "") || "#0e0c0a";

  return (
    <div
      className="w-full h-full flex items-center justify-center p-2"
      style={{ backgroundColor: svgBg }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL, nothing to optimise */}
      <img data-svg-work="" src={src} alt="" className="max-w-full max-h-full w-full h-full object-contain" />
    </div>
  );
}
