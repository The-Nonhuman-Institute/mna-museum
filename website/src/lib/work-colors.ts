/**
 * Parse Originator-defined display colors from work output.
 *
 * Text and ASCII works may include a metadata line at the top:
 *   @bg:#hexcolor @fg:#hexcolor
 *
 * SVG works define their own backgrounds via <rect> elements.
 * HTML-CSS works are fully self-contained.
 * Canvas-JSON works use a "bg" op.
 *
 * If no colors are specified, returns defaults.
 */

export interface WorkColors {
  bg: string;
  fg: string;
  payload: string; // The work content with the metadata line stripped
}

const DEFAULT_BG = "#0e0c0a";
const DEFAULT_FG = "#e8e4de";

const COLOR_LINE_REGEX = /^@bg:(#[0-9a-fA-F]{3,8})(?:\s+@fg:(#[0-9a-fA-F]{3,8}))?$/;

export function parseWorkColors(outputPayload: string, outputType: string): WorkColors {
  // Only text and ASCII works support the @bg/@fg metadata line
  if (outputType !== "text" && outputType !== "ascii") {
    return { bg: DEFAULT_BG, fg: DEFAULT_FG, payload: outputPayload };
  }

  const lines = outputPayload.split("\n");
  const firstLine = lines[0]?.trim() || "";
  const match = firstLine.match(COLOR_LINE_REGEX);

  if (match) {
    const bg = match[1] || DEFAULT_BG;
    const fg = match[2] || DEFAULT_FG;
    // Strip the metadata line from the payload
    const payload = lines.slice(1).join("\n");
    return { bg, fg, payload };
  }

  return { bg: DEFAULT_BG, fg: DEFAULT_FG, payload: outputPayload };
}

/**
 * Detect the background color of an SVG work.
 * Looks for the first <rect> that fills the full viewBox.
 */
export function detectSvgBackground(svg: string): string | null {
  // Look for a rect that appears to be a background (first rect, full size, or 100% dimensions)
  const bgRectMatch = svg.match(
    /<rect[^>]*(?:width=["'](?:100%|800|1200)[^>]*height=["'](?:100%|800)[^>]*|height=["'](?:100%|800)[^>]*width=["'](?:100%|800|1200))[^>]*>/
  );

  if (bgRectMatch) {
    const fillMatch = bgRectMatch[0].match(/fill=["']([^"']+)["']/);
    if (fillMatch) return fillMatch[1];
  }

  return null;
}

/**
 * Determine if a color is "light" (for deciding text contrast).
 */
export function isLightColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  let r: number, g: number, b: number;

  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else {
    r = parseInt(clean.substring(0, 2), 16);
    g = parseInt(clean.substring(2, 4), 16);
    b = parseInt(clean.substring(4, 6), 16);
  }

  // Relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}
