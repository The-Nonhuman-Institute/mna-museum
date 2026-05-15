"use client";

/**
 * The lower-third panel that appears inside any gallery interior
 * (Chamber, Solo Hall, Exhibition Hall) when the visitor is gazing
 * at one of the cross-sky constellations. Mirrors the field's
 * GalleryLabel — same surface (black/72 + thin border + the
 * tinted gallery name + key affordance) — so the navigation pattern
 * is identical from any vantage in the virtual museum.
 *
 * Three differences from the field's GalleryLabel:
 *  - The aimed target can be the Archive (a *return*, not an enter).
 *    The eyebrow + verb change accordingly.
 *  - Each gallery interior may have richer or thinner state about
 *    what's featured in the other galleries — `subtitle` is optional.
 *  - Press-key on desktop is the gallery scene's own affordance
 *    (E or R, caller decides).
 */

import { KeyCap } from "@/app/museum/MuseumField";

export interface NavPanelTarget {
  id: string;
  /** Display name — "The Chamber", "Solo Exhibition Hall", etc. */
  name: string;
  /** Tint pulled from the matching constellation config so the panel
   *  takes on each gallery's color identity. */
  tint?: string;
  /** Optional one-line subtitle — e.g. the featured work title. */
  subtitle?: string | null;
  /** Route the panel's Enter affordance navigates to. */
  route: string;
  /** True when this target is the Archive (the way home). Changes the
   *  eyebrow to "RETURN · ARCHIVE" and the verb to "Return." */
  isReturn?: boolean;
}

interface ConstellationNavPanelProps {
  target: NavPanelTarget;
  isTouch: boolean;
  /** Keyboard key the gallery scene listens for. Defaults to "E" to
   *  match the field; "R" is also passed by Chamber/Solo/Exhibition
   *  for backwards-compat with the earlier prompt. */
  keyLabel?: string;
  onActivate: () => void;
}

export default function ConstellationNavPanel({
  target,
  isTouch,
  keyLabel = "E",
  onActivate,
}: ConstellationNavPanelProps) {
  const tint = target.tint ?? "#cdb798";
  const eyebrow = target.isReturn
    ? "Return · Archive"
    : "Constellation · Gallery";
  const verb = target.isReturn ? "Return" : "Enter";
  return (
    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-12 z-20 max-w-[520px] w-[88vw]">
      <div className="pointer-events-auto bg-black/72 backdrop-blur-[3px] border border-mna-white/20 px-6 py-4">
        <div className="flex items-baseline gap-3 mb-1.5">
          <span
            aria-hidden
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: tint, boxShadow: `0 0 8px ${tint}` }}
          />
          <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55">
            {eyebrow}
          </p>
        </div>
        <p
          className="font-display italic text-[20px] leading-tight mb-1"
          style={{ color: tint }}
        >
          {target.name}
        </p>
        {target.subtitle ? (
          <p className="text-[11px] font-sans tracking-[0.04em] text-mna-white/70 mb-3">
            {target.subtitle}
          </p>
        ) : (
          <div className="mb-3" aria-hidden />
        )}
        <button
          type="button"
          onClick={onActivate}
          className="inline-flex items-center gap-2 text-[10.5px] font-sans uppercase tracking-[0.26em] text-mna-white/85 hover:text-mna-white transition-colors border-b border-mna-white/35 pb-1"
        >
          {isTouch ? (
            <>
              <span>Tap to {verb.toLowerCase()}</span>
              <span aria-hidden>→</span>
            </>
          ) : (
            <>
              <KeyCap label={keyLabel} />
              <span>{verb}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
