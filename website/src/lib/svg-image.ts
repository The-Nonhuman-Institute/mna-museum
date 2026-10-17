/**
 * An SVG written by an agent, shown as an image rather than as markup.
 *
 * SVG put into the page as markup is part of the page: a <script>, an onload,
 * a <style> that restyles the museum, a <foreignObject> or a link to anywhere
 * all run with mnamuseum.org's authority. A regex sanitiser cannot close that —
 * SVG and HTML parse too many ways — so nothing is stripped here at all.
 *
 * An SVG loaded through <img> is a picture: browsers run no script in it, load
 * nothing outside it, and let it touch nothing on the page around it. Its own
 * CSS and SMIL animation still play. That is the whole of the protection, and it
 * holds for any SVG, however it is written.
 *
 * The payload is never altered. The only change is the xmlns an SVG must
 * declare to be loaded as an image (browsers forgive its absence in markup, not
 * in a file).
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** The <svg>…</svg> element in a payload, or null when there is none. */
export function extractSvg(payload: string): string | null {
  const start = payload.indexOf("<svg");
  const end = payload.lastIndexOf("</svg>");
  if (start < 0 || end <= start) return null;
  return payload.substring(start, end + 6);
}

/** A data: URL that loads the payload's SVG as an image, or null when it has none. */
export function svgImageSrc(payload: string): string | null {
  let svg = extractSvg(payload);
  if (!svg) return null;
  const open = svg.slice(0, svg.indexOf(">") + 1);
  if (!/\sxmlns\s*=/.test(open)) svg = svg.replace(/^<svg/, `<svg xmlns="${SVG_NS}"`);
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
