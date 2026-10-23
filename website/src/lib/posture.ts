/**
 * Posture — how the visitor's screen is held, for foldables (the iPhone Duo,
 * from 2026-10-23) and everything else.
 *
 * KEEP IN STEP with website/src/lib/posture.ts and commons/lib/posture.ts: identical.
 *
 * Every posture the site answers to:
 *
 *   screen  "compact"  a phone, or a foldable closed (its outer screen)
 *           "spread"   a large, near-square or wide screen — a foldable open,
 *                      a tablet, a wide window — where content and its context
 *                      can sit side by side, like an open book
 *   fold    "flat"     one continuous surface (or nothing is known)
 *           "book"     folded part-way with the hinge running top to bottom:
 *                      two pages, left and right
 *           "stand"    propped up with the hinge running across: a view on the
 *                      upper half, controls on the lower (Apple's "propped up on
 *                      a table"; elsewhere "tabletop")
 *
 * How it is known, in order:
 *   1. the browser says so — the Viewport Segments API (window.viewport.segments,
 *      or the horizontal-/vertical-viewport-segments media queries) and the
 *      Device Posture API (navigator.devicePosture). Chrome, Edge and Samsung
 *      Internet report these on foldables; Safari on the iPhone Duo reports
 *      them only behind an experimental flag (iOS 27.1). Where they are
 *      reported, `source` is "browser" and the fold's own rectangle is known.
 *   2. the visitor says so — a choice the page offers where it matters ("Stand
 *      it up"), kept on this device. `source` is "visitor".
 *   3. otherwise the fold is "flat" and `source` is "none". Nothing is guessed
 *      from the device's name or the screen's size: a page sees a viewport, and
 *      a wide viewport may be a tablet, a window or an open phone.
 *
 * The same functions and hierarchy in every posture (Apple's rule): a posture
 * rearranges, it never adds or removes what a visitor can do.
 */

export type ScreenKind = "compact" | "spread";
export type Fold = "flat" | "book" | "stand";
export type PostureSource = "browser" | "visitor" | "none";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Posture {
  screen: ScreenKind;
  fold: Fold;
  source: PostureSource;
  /** The regions the fold divides the viewport into, when the browser reports them. */
  segments: Rect[];
  /** The hinge's position in CSS pixels along its axis, when known: x for a book, y for a stand. */
  hinge: number | null;
  width: number;
  height: number;
}

/** A visitor's own choice, kept on this device: "auto" lets the browser decide. */
export type PostureChoice = "auto" | "flat" | "book" | "stand";
export const CHOICE_KEY = "mna-posture";

/** Wide enough, and not too tall and narrow, to lay two things side by side. */
export const SPREAD_MIN_WIDTH = 640;

interface SegmentedViewport {
  segments?: ReadonlyArray<{ x: number; y: number; width: number; height: number }> | null;
}
interface DevicePostureLike {
  type?: "continuous" | "folded";
}

/** Read the posture from what the browser reports and what the visitor chose. */
export function readPosture(choice: PostureChoice = "auto"): Posture {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const screen: ScreenKind = width >= SPREAD_MIN_WIDTH && width / height > 0.62 ? "spread" : "compact";
  const segments: Rect[] = [];
  try {
    const vp = (window as unknown as { viewport?: SegmentedViewport }).viewport;
    for (const s of vp?.segments ?? []) segments.push({ x: s.x, y: s.y, width: s.width, height: s.height });
  } catch {
    /* not reported */
  }
  const mq = (q: string) => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  let fold: Fold = "flat";
  let source: PostureSource = "none";
  let hinge: number | null = null;
  const sideBySide = (segments.length === 2 && segments[0].y === segments[1].y) || mq("(horizontal-viewport-segments: 2)");
  const stacked = (segments.length === 2 && segments[0].x === segments[1].x) || mq("(vertical-viewport-segments: 2)");
  const folded = ((navigator as unknown as { devicePosture?: DevicePostureLike }).devicePosture?.type === "folded") || mq("(device-posture: folded)");
  if (sideBySide) {
    fold = "book";
    source = "browser";
    if (segments.length === 2) hinge = (segments[0].x + segments[0].width + segments[1].x) / 2;
  } else if (stacked) {
    fold = "stand";
    source = "browser";
    if (segments.length === 2) hinge = (segments[0].y + segments[0].height + segments[1].y) / 2;
  } else if (folded) {
    // Folded, with no segments to say which way: a landscape fold is a stand,
    // a portrait one a book.
    fold = width > height ? "stand" : "book";
    source = "browser";
  }
  if (source === "none" && choice !== "auto") {
    fold = choice;
    source = "visitor";
  }
  if (hinge === null && fold === "book") hinge = width / 2;
  if (hinge === null && fold === "stand") hinge = height / 2;
  return { screen, fold, source, segments, hinge, width, height };
}

export function readChoice(): PostureChoice {
  try {
    const v = window.localStorage.getItem(CHOICE_KEY);
    return v === "flat" || v === "book" || v === "stand" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function saveChoice(c: PostureChoice): void {
  try {
    if (c === "auto") window.localStorage.removeItem(CHOICE_KEY);
    else window.localStorage.setItem(CHOICE_KEY, c);
  } catch {
    /* the choice lasts this visit only */
  }
}

/**
 * Call `on` with the posture now and whenever it changes: a resize, a rotation,
 * a fold, or the visitor's choice. Returns the unsubscribe.
 */
export function watchPosture(on: (p: Posture) => void): () => void {
  let frame = 0;
  const emit = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => on(readPosture(readChoice())));
  };
  emit();
  const unsubs: (() => void)[] = [];
  const add = (t: EventTarget | undefined | null, ev: string) => {
    if (!t) return;
    t.addEventListener(ev, emit);
    unsubs.push(() => t.removeEventListener(ev, emit));
  };
  add(window, "resize");
  add(window, "orientationchange");
  add(window, "storage");
  add(window, POSTURE_CHOICE_EVENT);
  add(window.visualViewport, "resize");
  try {
    add((navigator as unknown as { devicePosture?: EventTarget }).devicePosture, "change");
  } catch {
    /* not reported */
  }
  for (const q of ["(horizontal-viewport-segments: 2)", "(vertical-viewport-segments: 2)", "(device-posture: folded)"]) {
    try {
      const m = window.matchMedia(q);
      m.addEventListener("change", emit);
      unsubs.push(() => m.removeEventListener("change", emit));
    } catch {
      /* not supported */
    }
  }
  return () => {
    cancelAnimationFrame(frame);
    for (const u of unsubs) u();
  };
}

/** Fired on the window when the visitor changes their choice, so every listener re-reads. */
export const POSTURE_CHOICE_EVENT = "mna-posture-choice";

export function chooseFold(c: PostureChoice): void {
  saveChoice(c);
  window.dispatchEvent(new Event(POSTURE_CHOICE_EVENT));
}

/**
 * Publish the posture on <html> so CSS can answer it without JavaScript in
 * every component: data-screen, data-fold, data-posture-source, and the
 * --hinge-x / --hinge-y custom properties.
 */
export function publishPosture(p: Posture): void {
  const el = document.documentElement;
  el.dataset.screen = p.screen;
  el.dataset.fold = p.fold;
  el.dataset.postureSource = p.source;
  el.style.setProperty("--hinge-x", p.fold === "book" && p.hinge !== null ? `${p.hinge}px` : "50vw");
  el.style.setProperty("--hinge-y", p.fold === "stand" && p.hinge !== null ? `${p.hinge}px` : "50dvh");
}
