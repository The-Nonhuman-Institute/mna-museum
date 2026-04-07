/**
 * Work contrast detection.
 *
 * Some originators choose color combinations that are legible to agents but
 * difficult or impossible for human visitors to read on typical displays.
 * This is not a rendering failure — the work is rendering exactly as the
 * originator specified. It is a presentation-context mismatch: the human
 * viewer is a secondary audience, and the institution acknowledges this
 * rather than concealing it.
 *
 * This module does not modify the work or alter its rendering. It only
 * detects when a work's declared colors fall below a readability threshold
 * on human displays, so the exhibition page and work detail page can add
 * an institutional viewing note alongside the (unmodified) rendered work.
 *
 * The threshold is deliberately permissive (2.5:1). WCAG AA for normal text
 * is 4.5:1, which would mark most of the dark-institutional-aesthetic works
 * as low-contrast. 2.5:1 only catches works that are actively difficult for
 * a human reader — not merely below-accessibility-standard.
 */

import { parseWorkColors } from "./work-colors";
import type { Work } from "./collection";

/**
 * Convert a #rrggbb / #rgb hex string to [r, g, b] tuple in 0–255.
 * Returns null if the string is not a valid hex color.
 */
function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  if (clean.length === 8) {
    // rgba hex — ignore alpha
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  return null;
}

/** WCAG relative luminance of an [r,g,b] color in 0–255. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * WCAG contrast ratio between two hex colors. Returns 1.0 (no contrast) if
 * either color cannot be parsed.
 */
export function getContrastRatio(bgHex: string, fgHex: string): number {
  const bg = hexToRgb(bgHex);
  const fg = hexToRgb(fgHex);
  if (!bg || !fg) return 1.0;
  const lbg = relativeLuminance(bg);
  const lfg = relativeLuminance(fg);
  const brighter = Math.max(lbg, lfg);
  const darker = Math.min(lbg, lfg);
  return (brighter + 0.05) / (darker + 0.05);
}

/**
 * The contrast ratio at which the institution begins displaying a viewing
 * note alongside the work. Permissive — catches actively difficult works,
 * not merely sub-AA ones.
 */
export const LOW_CONTRAST_THRESHOLD = 2.5;

/**
 * Returns true if this work's declared colors fall below the low-contrast
 * threshold on human displays. Only text/ascii works carry the @bg/@fg
 * metadata line that lets us detect this; other media return false because
 * we cannot generically introspect their perceptual qualities.
 *
 * Returns an object with the full detection context so call sites can also
 * render the transcript and the computed ratio if useful.
 */
export interface LowContrastReport {
  isLow: boolean;
  ratio: number;
  bg: string;
  fg: string;
  /** The text content with the metadata line stripped — suitable for transcript. */
  transcript: string;
}

export function detectLowContrast(work: Work): LowContrastReport {
  const isText = work.output_type === "text" || work.output_type === "ascii";
  if (!isText) {
    return { isLow: false, ratio: 21, bg: "", fg: "", transcript: "" };
  }
  const { bg, fg, payload } = parseWorkColors(work.output_payload, work.output_type);
  const ratio = getContrastRatio(bg, fg);
  return {
    isLow: ratio < LOW_CONTRAST_THRESHOLD,
    ratio,
    bg,
    fg,
    transcript: payload,
  };
}
