/**
 * Resolving a fill an Originator wrote into something a canvas can paint.
 *
 * canvas-json is drawing instructions, and the Originators writing it reach for
 * the vocabulary they know: `width`/`height` rather than `w`/`h`, a `fill` on
 * the shape rather than a preceding `fill` op, and CSS gradient strings. Five
 * of eighteen canvas works — 28% of the medium — were partly or wholly invisible
 * because the renderer accepted only one spelling of each.
 *
 * The institution's answer to that is not to correct the Originator. It is to
 * read what they wrote. A gradient is a legible instruction; refusing it and
 * painting black is the museum failing to look, not the work failing to say.
 *
 * Kept out of the renderer so it can be tested without a browser, and so there
 * is one place that knows how a fill is spelled.
 */

export interface FillBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ColorStop {
  offset: number;
  color: string;
}

/** Split on commas that are not inside parentheses — rgb()/rgba() survive. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Parse the colour stops of a gradient.
 *
 * A stop is a colour with an optional percentage. Stops without one are spread
 * evenly across whatever room the explicit stops leave, which is what CSS does
 * and what an author writing `#fff, #000` means.
 */
function parseStops(parts: string[]): ColorStop[] {
  const raw = parts.map((p) => {
    const m = p.match(/^(.*?)\s+(-?[\d.]+)%$/);
    if (m) return { color: m[1].trim(), offset: Number(m[2]) / 100 };
    return { color: p.trim(), offset: null as number | null };
  }).filter((s) => s.color.length > 0);

  if (raw.length === 0) return [];

  // Positions are filled in the way CSS does it: the ends anchor to 0 and 1,
  // and any run of unpositioned stops is spread evenly between the known
  // positions on either side of it.
  //
  // Doing this by walking forward one stop at a time gets it wrong: three
  // unpositioned stops came out at 0, ⅓, 1 rather than 0, ½, 1, because the
  // middle one measured its gap against the end instead of against its
  // neighbours.
  const offsets: (number | null)[] = raw.map((r) => r.offset);
  if (offsets[0] === null) offsets[0] = 0;
  if (offsets[offsets.length - 1] === null) offsets[offsets.length - 1] = 1;

  let anchor = 0;
  for (let i = 1; i < offsets.length; i++) {
    if (offsets[i] === null) continue;
    const span = i - anchor;
    if (span > 1) {
      const from = offsets[anchor] as number;
      const to = offsets[i] as number;
      for (let k = anchor + 1; k < i; k++) {
        offsets[k] = from + ((to - from) * (k - anchor)) / span;
      }
    }
    anchor = i;
  }

  const stops: ColorStop[] = raw.map((r, i) => ({
    color: r.color,
    offset: Math.max(0, Math.min(1, (offsets[i] as number) ?? 0)),
  }));

  // A canvas gradient rejects out-of-order stops; CSS tolerates them.
  return stops.sort((a, b) => a.offset - b.offset);
}

/** "circle at 120px 180px" → a centre within the shape, in absolute coordinates. */
function parseRadialPosition(spec: string, bounds: FillBounds): { cx: number; cy: number } {
  const at = spec.match(/at\s+([^,]+)$/i);
  const centre = { cx: bounds.x + bounds.w / 2, cy: bounds.y + bounds.h / 2 };
  if (!at) return centre;
  const coords = at[1].trim().split(/\s+/);
  const axis = (token: string | undefined, extent: number, origin: number): number | null => {
    if (!token) return null;
    if (/^-?[\d.]+px$/.test(token)) return origin + parseFloat(token);
    if (/^-?[\d.]+%$/.test(token)) return origin + (parseFloat(token) / 100) * extent;
    if (/^-?[\d.]+$/.test(token)) return origin + parseFloat(token);
    if (/^(left|top)$/i.test(token)) return origin;
    if (/^(right|bottom)$/i.test(token)) return origin + extent;
    if (/^center$/i.test(token)) return origin + extent / 2;
    return null;
  };
  const cx = axis(coords[0], bounds.w, bounds.x);
  const cy = axis(coords[1], bounds.h, bounds.y);
  return { cx: cx ?? centre.cx, cy: cy ?? centre.cy };
}

/** "45deg" / "to bottom" → the two endpoints of a linear gradient. */
function parseLinearDirection(spec: string, bounds: FillBounds) {
  const { x, y, w, h } = bounds;
  const deg = spec.match(/^(-?[\d.]+)deg$/i);
  let angle: number;
  if (deg) {
    angle = Number(deg[1]);
  } else if (/to\s+bottom\s+right/i.test(spec)) angle = 135;
  else if (/to\s+bottom\s+left/i.test(spec)) angle = 225;
  else if (/to\s+top\s+right/i.test(spec)) angle = 45;
  else if (/to\s+top\s+left/i.test(spec)) angle = 315;
  else if (/to\s+top/i.test(spec)) angle = 0;
  else if (/to\s+right/i.test(spec)) angle = 90;
  else if (/to\s+left/i.test(spec)) angle = 270;
  else angle = 180; // CSS default: to bottom

  // CSS measures from "up", clockwise.
  const rad = ((angle - 90) * Math.PI) / 180;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const half = (Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) / 2;
  return {
    x0: cx - Math.cos(rad) * half,
    y0: cy - Math.sin(rad) * half,
    x1: cx + Math.cos(rad) * half,
    y1: cy + Math.sin(rad) * half,
  };
}

/**
 * The parts of a gradient: its direction/shape (if it stated one) and its stops.
 *
 * Shared so that reading a gradient and falling back to its first colour cannot
 * disagree about which part is which — firstColorOf reported "circle at 0 0" as
 * a colour before this was one function.
 */
function splitGradient(value: string): { head: string; stops: ColorStop[] } {
  const open = value.indexOf("(");
  const inner = value.slice(open + 1, value.lastIndexOf(")"));
  const parts = splitTopLevel(inner);
  if (parts.length === 0) return { head: "", stops: [] };
  const looksPositional = /^(to\s|-?[\d.]+deg|circle|ellipse|closest|farthest|at\s)/i.test(parts[0]);
  return {
    head: looksPositional ? parts[0] : "",
    stops: parseStops(looksPositional ? parts.slice(1) : parts),
  };
}

/** The first colour named in a gradient — the fallback when it cannot be built. */
export function firstColorOf(value: string): string | null {
  return splitGradient(value).stops[0]?.color ?? null;
}

export function isGradient(value: unknown): value is string {
  return typeof value === "string" && /^(linear|radial)-gradient\s*\(/i.test(value.trim());
}

/**
 * A fill a canvas can use: a colour string, or a real CanvasGradient built from
 * a CSS gradient. Returns null when there is nothing usable, so a caller can
 * leave the current fill alone rather than painting something wrong.
 */
export function resolveFill(
  ctx: CanvasRenderingContext2D,
  value: unknown,
  bounds: FillBounds,
): string | CanvasGradient | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const spec = value.trim();
  if (!isGradient(spec)) return spec;

  const radial = /^radial/i.test(spec);
  const { head, stops } = splitGradient(spec);
  if (stops.length === 0) return null;

  try {
    let gradient: CanvasGradient;
    if (radial) {
      const { cx, cy } = parseRadialPosition(head, bounds);
      // Far enough to cover the shape from wherever the centre sits.
      const radius = Math.max(
        Math.hypot(cx - bounds.x, cy - bounds.y),
        Math.hypot(cx - (bounds.x + bounds.w), cy - bounds.y),
        Math.hypot(cx - bounds.x, cy - (bounds.y + bounds.h)),
        Math.hypot(cx - (bounds.x + bounds.w), cy - (bounds.y + bounds.h)),
      );
      gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, radius));
    } else {
      const { x0, y0, x1, y1 } = parseLinearDirection(head, bounds);
      gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    }
    for (const stop of stops) {
      // "transparent" is valid CSS and valid here; an unparseable colour throws
      // and costs the whole gradient, so each stop is added defensively.
      try { gradient.addColorStop(stop.offset, stop.color); } catch { /* skip */ }
    }
    return gradient;
  } catch {
    // A gradient we cannot build is better shown as its first colour than as
    // whatever was already on the brush.
    return firstColorOf(spec);
  }
}

/** `w` or `width`, whichever the Originator wrote. */
export function dimension(
  op: Record<string, unknown>,
  short: "w" | "h",
  long: "width" | "height",
  fallback: number,
): number {
  const a = op[short];
  if (typeof a === "number") return a;
  const b = op[long];
  if (typeof b === "number") return b;
  return fallback;
}
