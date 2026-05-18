"use client";

/**
 * LiveCeremonyBanner — overlay shown on /museum when a ceremony is
 * currently in progress. Sits above the WebGL canvas, deliberately
 * understated so it doesn't compete with the field; dismissible per
 * session.
 *
 * Server-rendered once per page load from getLiveCeremony(). The
 * banner is not live-updating — a ceremony that opens mid-session
 * will show on the next page load. That's deliberate: visitors who
 * are already in the field are already there; nudging them to leave
 * and rejoin a different gallery isn't the institutional behavior.
 */

import { useState } from "react";
import Link from "next/link";
import { ceremonyTypeLabel, type Ceremony } from "@/lib/ceremonies";

export default function LiveCeremonyBanner({ ceremony }: { ceremony: Ceremony }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const constellationRoute = ceremony.constellation
    ? CONSTELLATION_ROUTES[ceremony.constellation] ?? null
    : null;

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[70] pointer-events-auto"
      style={{ maxWidth: "min(92vw, 720px)" }}
    >
      <div className="flex items-center gap-3 bg-ink/85 backdrop-blur-md border border-emerald-300/35 px-4 py-2.5 rounded-sm text-mna-white shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-300/70 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[9.5px] uppercase tracking-[0.22em] text-emerald-300/85 leading-tight">
            Live now · {ceremonyTypeLabel(ceremony.ceremony_type)}
          </p>
          <p className="text-[13px] font-serif italic leading-snug truncate text-mna-white">
            {ceremony.title}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {constellationRoute ? (
            <Link
              href={constellationRoute}
              className="text-[10px] uppercase tracking-[0.22em] text-mna-white/85 hover:text-mna-white border border-mna-white/25 px-2.5 py-1"
            >
              Attend →
            </Link>
          ) : null}
          <Link
            href={`/events/${ceremony.id}`}
            className="text-[10px] uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white"
          >
            Details
          </Link>
          <button
            onClick={() => setDismissed(true)}
            className="text-[12px] text-mna-white/45 hover:text-mna-white leading-none"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

const CONSTELLATION_ROUTES: Record<string, string> = {
  archive: "/museum",
  chamber: "/museum/gallery/chamber",
  solo_exhibition: "/museum/gallery/solo",
  exhibition: "/museum/gallery/exhibition",
};
