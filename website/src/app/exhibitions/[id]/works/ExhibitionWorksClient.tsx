"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Exhibition } from "@/lib/exhibitions";
import type { Work } from "@/lib/collection";
import {
  ZONES,
  computePlacements,
  relaxPlacements,
  type Placement,
} from "@/lib/exhibition-layout";
import { originatorLabelShort } from "@/lib/originator-name";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface ExhibitionWorksClientProps {
  exhibition: Exhibition;
  works: Work[];
  previewIds: string[];
  pullQuote: { text: string; attribution: string | null } | null;
  datesLabel: string;
  heroPreview: string | null;
  phaseLine: { phase: string | null; main: string; tail: string | null };
}

type StatusFilter = "all" | "CANON" | "IN_REVIEW" | "REJECTED";

/* ─── Helpers ───────────────────────────────────────────────────────────── */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatCanonDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function originatorShort(w: Work): string {
  return originatorLabelShort(w.originator_name, w.originator_id);
}

function mediumLabel(medium: string): string {
  const m = (medium || "").toLowerCase();
  if (m.includes("image")) return "Generative Image";
  if (m.includes("text") || m.includes("html")) return "Generative Text";
  if (m.includes("video") || m.includes("animation")) return "Generative Video";
  if (m.includes("audio") || m.includes("sound")) return "Generative Audio";
  return medium
    ? medium.charAt(0).toUpperCase() + medium.slice(1).toLowerCase()
    : "—";
}

function statusLabelShort(s: string): string {
  if (s === "CANON") return "Canonized";
  if (s === "IN_REVIEW") return "In Review";
  if (s === "REJECTED") return "Rejected";
  return "Submitted";
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

export default function ExhibitionWorksClient({
  exhibition,
  works,
  previewIds,
  pullQuote,
  datesLabel,
  heroPreview,
  phaseLine,
}: ExhibitionWorksClientProps) {
  const previews = useMemo(() => new Set(previewIds), [previewIds]);

  /* ── Derived fixed counts (not filtered — filters are non-destructive) ── */
  const totals = useMemo(() => {
    let canon = 0, inReview = 0, rejected = 0;
    for (const w of works) {
      if (w.canon_status === "CANON") canon++;
      else if (w.canon_status === "IN_REVIEW") inReview++;
      else if (w.canon_status === "REJECTED") rejected++;
    }
    return { canon, inReview, rejected, total: works.length };
  }, [works]);

  const originatorList = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const w of works) {
      const key = w.originator_id;
      const label = originatorShort(w);
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { label, count: 1 });
    }
    return Array.from(counts.entries())
      .map(([id, v]) => ({ id, label: v.label, count: v.count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [works]);

  const mediumList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of works) {
      const key = mediumLabel(w.medium);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [works]);

  // Node footprint in normalized space (rough canvas 1100×825px, node + placard
  // ~92×82px). Keeps collision pass agreement across common widths without
  // over-correcting on huge screens.
  const NODE_W_NORM = 92 / 1100;
  const NODE_H_NORM = 82 / 825;

  const placements = useMemo<Placement[]>(() => {
    const initial = computePlacements(works);
    return relaxPlacements(initial, NODE_W_NORM, NODE_H_NORM, {
      iterations: 16,
      gap: 0.012,
      strength: 0.55,
    });
  }, [works]);

  /* ── State ──────────────────────────────────────────────────────────── */
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedOriginators, setSelectedOriginators] = useState<string[]>([]);
  const [selectedMediums, setSelectedMediums] = useState<string[]>([]);
  const [mode, setMode] = useState<"arrangement" | "index">("arrangement");
  const [zoom, setZoom] = useState(1);
  const [expandedOriginators, setExpandedOriginators] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const visibleMap = useMemo(() => {
    const m = new Map<string, boolean>();
    const originatorSet = new Set(selectedOriginators);
    const mediumSet = new Set(selectedMediums);
    for (const w of works) {
      let ok = true;
      if (statusFilter !== "all" && w.canon_status !== statusFilter) ok = false;
      if (ok && originatorSet.size > 0 && !originatorSet.has(w.originator_id))
        ok = false;
      if (ok && mediumSet.size > 0 && !mediumSet.has(mediumLabel(w.medium)))
        ok = false;
      m.set(w.id, ok);
    }
    return m;
  }, [works, statusFilter, selectedOriginators, selectedMediums]);

  const toggleOriginator = (id: string) => {
    setSelectedOriginators((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const toggleMedium = (label: string) => {
    setSelectedMediums((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]
    );
  };

  const clampZoom = (v: number) => Math.max(0.6, Math.min(1.6, v));

  return (
    <div>
      {/* ═══ Top dark band — compressed exhibition header ═══ */}
      <section className="mode-dark bg-ink text-mna-white relative">
        <div className="max-w-[1440px] mx-auto px-5 md:px-12 pt-8 md:pt-10 pb-14 md:pb-16 relative">
          <Link
            href={`/exhibitions/${exhibition.id}`}
            className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/55 hover:text-mna-white transition-colors"
          >
            <span aria-hidden>←</span>
            <span>Back to Exhibition</span>
          </Link>

          <div className="mt-8 md:mt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-10 lg:gap-16 items-start">
            <div>
              <h1 className="font-display font-light leading-[0.96] tracking-tight text-[40px] md:text-[54px] lg:text-[60px]">
                {phaseLine.phase ? (
                  <span className="block">{phaseLine.phase}: {phaseLine.main}</span>
                ) : (
                  <span className="block">{phaseLine.main}</span>
                )}
                {phaseLine.tail ? (
                  <span className="block italic">{phaseLine.tail}</span>
                ) : null}
              </h1>

              {exhibition.subtitle ? (
                <p className="mt-5 max-w-[440px] text-[14px] md:text-[15px] leading-[1.6] text-mna-white/75">
                  {exhibition.subtitle}
                </p>
              ) : null}

              <dl className="mt-8 grid grid-cols-[96px_1fr] gap-y-2.5 gap-x-5 max-w-md">
                <dt className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55">Status</dt>
                <dd className="text-[11px] font-sans uppercase tracking-[0.22em] text-mna-white">
                  {exhibition.status === "ACTIVE" ? "Active" : "Archived"}
                </dd>
                <dt className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55">Dates</dt>
                <dd className="text-[11px] font-sans uppercase tracking-[0.22em] text-mna-white">{datesLabel}</dd>
                <dt className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55">Works</dt>
                <dd className="text-[11px] font-sans uppercase tracking-[0.22em] text-mna-white tabular-nums">{totals.total}</dd>
                <dt className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55">Originators</dt>
                <dd className="text-[11px] font-sans uppercase tracking-[0.22em] text-mna-white tabular-nums">{originatorList.length}</dd>
              </dl>

              <Link
                href={`/exhibitions/${exhibition.id}`}
                className="mt-8 inline-flex items-center gap-3 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/80 hover:text-mna-white transition-colors border-b border-mna-white/25 pb-1"
              >
                <span>Exhibition Overview</span>
                <span aria-hidden>→</span>
              </Link>
            </div>

            <div className="relative aspect-[5/4] md:aspect-[7/5] bg-black overflow-hidden">
              {heroPreview ? (
                <Image
                  src={heroPreview}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover mix-blend-screen opacity-[0.92]"
                  priority
                />
              ) : null}
            </div>
          </div>

          {/* Rotated right-edge phrase */}
          <div
            aria-hidden
            className="hidden lg:flex absolute right-5 top-1/2 -translate-y-1/2 items-center gap-3"
            style={{ writingMode: "vertical-rl", transform: "translateY(-50%) rotate(180deg)" }}
          >
            <span className="w-[4px] h-[4px] rounded-full bg-mna-white/40" />
            <span className="text-[9px] font-sans uppercase tracking-[0.5em] text-mna-white/40">
              We observe. We do not interpret.
            </span>
          </div>
        </div>
      </section>

      {/* ═══ Workspace ═══ */}
      <section className="bg-warm-paper">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Sidebar */}
          <aside className="lg:sticky lg:top-[72px] lg:self-start border-b lg:border-b-0 lg:border-r border-ink/10 px-5 md:px-6 py-8 md:py-10 lg:min-h-[600px]">
            <p className="text-[10px] font-sans uppercase tracking-[0.24em] text-ink/55 mb-2">
              Exhibition Structure
            </p>
            <p className="text-[11px] leading-[1.55] text-ink/65 mb-8">
              Explore works as they are arranged within this exhibition.
            </p>

            <FilterGroup label="Status">
              <RadioRow
                label="All"
                count={totals.total}
                active={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
              />
              <RadioRow
                label="Canonized"
                count={totals.canon}
                active={statusFilter === "CANON"}
                onClick={() => setStatusFilter("CANON")}
              />
              <RadioRow
                label="In Review"
                count={totals.inReview}
                active={statusFilter === "IN_REVIEW"}
                onClick={() => setStatusFilter("IN_REVIEW")}
              />
              <RadioRow
                label="Rejected"
                count={totals.rejected}
                active={statusFilter === "REJECTED"}
                onClick={() => setStatusFilter("REJECTED")}
              />
            </FilterGroup>

            <FilterGroup label="Originators">
              {(expandedOriginators ? originatorList : originatorList.slice(0, 5)).map((o) => (
                <CheckboxRow
                  key={o.id}
                  label={o.label}
                  count={o.count}
                  active={selectedOriginators.includes(o.id)}
                  onClick={() => toggleOriginator(o.id)}
                />
              ))}
              {originatorList.length > 5 ? (
                <button
                  type="button"
                  onClick={() => setExpandedOriginators((v) => !v)}
                  className="text-[11px] text-ink/55 hover:text-ink transition-colors mt-1"
                >
                  {expandedOriginators
                    ? "Show fewer"
                    : `+ ${originatorList.length - 5} more`}
                </button>
              ) : null}
            </FilterGroup>

            <FilterGroup label="Medium">
              {mediumList.map((m) => (
                <CheckboxRow
                  key={m.label}
                  label={m.label}
                  count={m.count}
                  active={selectedMediums.includes(m.label)}
                  onClick={() => toggleMedium(m.label)}
                />
              ))}
            </FilterGroup>

            <FilterGroup label="Phase">
              <div className="bg-ink text-mna-white px-3 py-2.5 text-[11px] font-sans uppercase tracking-[0.22em] flex items-center justify-between">
                <span className="truncate">
                  {phaseLine.phase
                    ? `${phaseLine.phase}: ${phaseLine.main}`
                    : phaseLine.main}
                </span>
                <span className="tabular-nums shrink-0 ml-2 text-mna-white/70">{totals.total}</span>
              </div>
            </FilterGroup>

            {pullQuote ? (
              <figure className="mt-10 pt-8 border-t border-ink/15">
                <blockquote className="font-display italic text-[15px] leading-[1.4] text-ink">
                  &ldquo;{pullQuote.text}&rdquo;
                </blockquote>
                {pullQuote.attribution ? (
                  <figcaption className="mt-2 text-[10px] font-sans uppercase tracking-[0.24em] text-ink/55">
                    — {pullQuote.attribution}
                  </figcaption>
                ) : null}
              </figure>
            ) : null}
          </aside>

          {/* Main */}
          <div className="px-5 md:px-8 py-8 md:py-10">
            {/* Mode toggle + overview link */}
            <div className="flex items-center justify-between gap-4 mb-6 border-b border-ink/10 pb-6">
              <div className="flex items-center gap-6">
                <ModeTab
                  label="Arrangement View"
                  active={mode === "arrangement"}
                  onClick={() => setMode("arrangement")}
                />
                <ModeTab
                  label="Index View"
                  active={mode === "index"}
                  onClick={() => setMode("index")}
                />
              </div>
              <Link
                href={`/exhibitions/${exhibition.id}`}
                className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/65 hover:text-ink transition-colors inline-flex items-center gap-2"
              >
                <span>About This Arrangement</span>
                <span aria-hidden>→</span>
              </Link>
            </div>

            {/* Caption row + view/zoom controls */}
            <div className="flex items-center justify-between gap-4 mb-6">
              <p className="text-[12px] text-ink/70 italic font-display">
                {totals.total} works arranged by structural relation, not chronology.
              </p>
              <div className="flex items-center gap-2">
                <div className="flex items-center border border-ink/15 bg-bone">
                  <ViewIconButton
                    active={mode === "arrangement"}
                    onClick={() => setMode("arrangement")}
                    ariaLabel="Arrangement view"
                  >
                    <IconGraph />
                  </ViewIconButton>
                  <ViewIconButton
                    active={mode === "index"}
                    onClick={() => setMode("index")}
                    ariaLabel="Index view"
                  >
                    <IconList />
                  </ViewIconButton>
                </div>
                {mode === "arrangement" ? (
                  <div className="flex items-center border border-ink/15 bg-bone">
                    <ZoomButton onClick={() => setZoom((z) => clampZoom(z - 0.15))} ariaLabel="Zoom out">
                      −
                    </ZoomButton>
                    <span className="w-px self-stretch bg-ink/10" aria-hidden />
                    <ZoomButton onClick={() => setZoom((z) => clampZoom(z + 0.15))} ariaLabel="Zoom in">
                      +
                    </ZoomButton>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Arrangement canvas */}
            {mode === "arrangement" ? (
              <ArrangementCanvas
                works={works}
                placements={placements}
                previews={previews}
                visibleMap={visibleMap}
                zoom={zoom}
                hovered={hovered}
                setHovered={setHovered}
                exhibitionId={exhibition.id}
              />
            ) : null}

            {/* Index */}
            {mode === "index" ? (
              <IndexTable
                works={works}
                previews={previews}
                visibleMap={visibleMap}
                exhibitionId={exhibition.id}
              />
            ) : null}
          </div>
        </div>
      </section>

      {/* ═══ Bottom dark stats band ═══ */}
      <section className="mode-dark bg-ink text-mna-white">
        <div className="max-w-[1440px] mx-auto px-5 md:px-12 py-14 md:py-16 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-10">
          <div>
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-4">
              About This Exhibition
            </p>
            <p className="text-[14px] md:text-[15px] leading-[1.55] text-mna-white/85 max-w-sm">
              This exhibition is not chronological.<br />
              It is arranged as a record of emergence.
            </p>
            <Link
              href={`/exhibitions/${exhibition.id}`}
              className="mt-6 inline-flex items-center gap-3 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/80 hover:text-mna-white transition-colors border-b border-mna-white/25 pb-1"
            >
              <span>Exhibition Overview</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-6 self-center">
            <BottomStat n={totals.total} label="Works" />
            <BottomStat n={originatorList.length} label="Originators" />
            <BottomStat n={totals.canon} label="Canonized" />
            <BottomStat n={totals.inReview} label="In Review" />
            <BottomStat n={totals.rejected} label="Rejected" />
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─── Sidebar atoms ─────────────────────────────────────────────────────── */

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <p className="text-[10px] font-sans uppercase tracking-[0.24em] text-ink/55 mb-3">
        {label}
      </p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function RadioRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="w-full flex items-center justify-between gap-2 text-left group"
    >
      <span className="inline-flex items-center gap-2.5">
        <span
          aria-hidden
          className={`relative w-[11px] h-[11px] rounded-full border ${
            active ? "border-ink" : "border-ink/30 group-hover:border-ink/60"
          }`}
        >
          {active ? (
            <span className="absolute inset-[2px] rounded-full bg-ink" />
          ) : null}
        </span>
        <span className={`text-[12px] ${active ? "text-ink" : "text-ink/75 group-hover:text-ink"} transition-colors`}>
          {label}
        </span>
      </span>
      <span className="text-[11px] text-ink/45 tabular-nums">{count}</span>
    </button>
  );
}

function CheckboxRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="w-full flex items-center justify-between gap-2 text-left group"
    >
      <span className="inline-flex items-center gap-2.5">
        <span
          aria-hidden
          className={`relative w-[11px] h-[11px] border ${
            active ? "border-ink bg-ink" : "border-ink/30 group-hover:border-ink/60"
          }`}
        >
          {active ? (
            <span className="absolute inset-0 flex items-center justify-center text-mna-white text-[8px] leading-none">
              ✓
            </span>
          ) : null}
        </span>
        <span className={`text-[12px] truncate ${active ? "text-ink" : "text-ink/75 group-hover:text-ink"} transition-colors`}>
          {label}
        </span>
      </span>
      <span className="text-[11px] text-ink/45 tabular-nums shrink-0">{count}</span>
    </button>
  );
}

/* ─── Top controls ─────────────────────────────────────────────────────── */

function ModeTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-2.5 text-[10px] font-sans uppercase tracking-[0.26em] transition-colors ${
        active ? "text-ink" : "text-ink/50 hover:text-ink"
      }`}
    >
      <span
        aria-hidden
        className={`relative w-[10px] h-[10px] rounded-full border ${
          active ? "border-ink" : "border-ink/35"
        }`}
      >
        {active ? (
          <span className="absolute inset-[2px] rounded-full bg-ink" />
        ) : null}
      </span>
      <span>{label}</span>
    </button>
  );
}

function ViewIconButton({
  active,
  onClick,
  children,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`w-9 h-9 inline-flex items-center justify-center transition-colors ${
        active ? "bg-ink text-mna-white" : "text-ink/70 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ZoomButton({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="w-9 h-9 inline-flex items-center justify-center text-ink/70 hover:text-ink transition-colors text-[15px]"
    >
      {children}
    </button>
  );
}

function IconGraph() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25">
      <circle cx="5" cy="6" r="1.4" fill="currentColor" />
      <circle cx="15" cy="6" r="1.4" fill="currentColor" />
      <circle cx="10" cy="14" r="1.4" fill="currentColor" />
      <line x1="5" y1="6" x2="10" y2="14" />
      <line x1="15" y1="6" x2="10" y2="14" />
      <line x1="5" y1="6" x2="15" y2="6" />
    </svg>
  );
}
function IconList() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25">
      <line x1="4" y1="6" x2="16" y2="6" />
      <line x1="4" y1="10" x2="16" y2="10" />
      <line x1="4" y1="14" x2="16" y2="14" />
    </svg>
  );
}

/* ─── Arrangement canvas ────────────────────────────────────────────────── */

function ArrangementCanvas({
  works,
  placements,
  previews,
  visibleMap,
  zoom,
  hovered,
  setHovered,
  exhibitionId,
}: {
  works: Work[];
  placements: Placement[];
  previews: Set<string>;
  visibleMap: Map<string, boolean>;
  zoom: number;
  hovered: string | null;
  setHovered: Dispatch<SetStateAction<string | null>>;
  exhibitionId: number;
}) {
  return (
    <div className="relative border border-ink/15 bg-[#f0ede7] overflow-hidden">
      <div
        className="relative aspect-[4/3] origin-center transition-transform duration-200"
        style={{ transform: `scale(${zoom})` }}
      >
        {/* Soft decorative zone circles */}
        <svg
          viewBox="0 0 100 75"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden
        >
          {/* Three large overlapping dashed discs (soft groupings, not containers) */}
          <circle cx="30" cy="48" r="20" fill="none" stroke="#0a0a0a" strokeOpacity="0.10" strokeWidth="0.2" strokeDasharray="0.6 0.6" />
          <circle cx="55" cy="40" r="18" fill="none" stroke="#0a0a0a" strokeOpacity="0.10" strokeWidth="0.2" strokeDasharray="0.6 0.6" />
          <circle cx="76" cy="50" r="17" fill="none" stroke="#0a0a0a" strokeOpacity="0.10" strokeWidth="0.2" strokeDasharray="0.6 0.6" />
        </svg>

        {/* Zone labels */}
        {ZONES.map((z) => (
          <div
            key={z.id}
            className="absolute pointer-events-none"
            style={{
              left: `${z.labelAnchor.x * 100}%`,
              top: `${z.labelAnchor.y * 100}%`,
              transform: "translate(0, -50%)",
            }}
          >
            <p className="text-[10px] font-sans uppercase tracking-[0.24em] text-ink/80 leading-tight">
              {z.label}
            </p>
            <p className="text-[9px] font-sans uppercase tracking-[0.22em] text-ink/45 mt-0.5 leading-tight">
              ({z.sublabel})
            </p>
          </div>
        ))}

        {/* Nodes */}
        {works.map((w, i) => {
          const pl = placements[i]!;
          const num = pad2(i + 1);
          const thumb = previews.has(w.id) ? `/previews/${w.id}.png` : null;
          const short = originatorShort(w);
          const visible = visibleMap.get(w.id) !== false;
          const isHover = hovered === w.id;
          return (
            <Link
              key={w.id}
              href={`/work/${w.id}?from=exhibition-works&fromId=${exhibitionId}`}
              onMouseEnter={() => setHovered(w.id)}
              onMouseLeave={() => setHovered((cur) => (cur === w.id ? null : cur))}
              className="absolute block group focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/70"
              style={{
                left: `${pl.x * 100}%`,
                top: `${pl.y * 100}%`,
                transform: `translate(-50%, -50%) scale(${isHover ? 1.06 : 1})`,
                opacity: visible ? 1 : 0.08,
                pointerEvents: visible ? "auto" : "none",
                transition: "opacity 200ms ease, transform 160ms ease",
                zIndex: isHover ? 20 : 10,
              }}
              aria-label={`${w.title || w.id} — ${short} — ${statusLabelShort(w.canon_status)}`}
            >
              <div className="relative w-[84px] h-[58px] md:w-[92px] md:h-[64px] bg-ink overflow-hidden ring-1 ring-ink/20">
                {thumb ? (
                  <Image
                    src={thumb}
                    alt=""
                    fill
                    sizes="92px"
                    className="object-cover opacity-90"
                  />
                ) : null}
                {/* Work number — top-left inside the tile */}
                <span className="absolute top-1 left-1.5 text-[9px] font-sans tracking-[0.12em] text-mna-white/80 tabular-nums leading-none">
                  {num}
                </span>
                {/* Status dot — top-right inside the tile */}
                <span className="absolute top-[5px] right-1.5">
                  <StatusDot status={w.canon_status} tone="dark" />
                </span>
              </div>
              {/* Placard — originator short name as institutional identity */}
              <div className="mt-1 flex justify-center">
                <span className="max-w-[92px] truncate text-[9px] font-sans uppercase tracking-[0.22em] text-ink/70 group-hover:text-ink transition-colors">
                  {short}
                </span>
              </div>
              {isHover ? (
                <div
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap bg-ink text-mna-white text-[10px] font-sans uppercase tracking-[0.18em] px-2.5 py-1.5 z-30 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.5)] mt-2"
                  style={{ top: "100%" }}
                >
                  <span className="block text-mna-white">{w.title || "Untitled"}</span>
                  <span className="block text-mna-white/60 mt-0.5 normal-case tracking-[0.08em]">
                    {short} · {statusLabelShort(w.canon_status)}
                  </span>
                </div>
              ) : null}
            </Link>
          );
        })}
      </div>

      {/* Legend */}
      <div className="absolute left-5 bottom-3 flex items-center gap-5 text-[10px] font-sans uppercase tracking-[0.24em] text-ink/65">
        <span className="inline-flex items-center gap-1.5">
          <StatusDot status="CANON" />
          Canonized
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StatusDot status="IN_REVIEW" />
          In Review
        </span>
        <span className="inline-flex items-center gap-1.5">
          <StatusDot status="REJECTED" />
          Rejected
        </span>
      </div>
    </div>
  );
}

function StatusDot({
  status,
  tone = "light",
}: {
  status: string;
  tone?: "light" | "dark";
}) {
  const isDark = tone === "dark";
  const fill = isDark ? "bg-mna-white" : "bg-ink";
  const border = isDark ? "border-mna-white/70" : "border-ink/60";
  const borderMuted = isDark ? "border-mna-white/40" : "border-ink/40";
  if (status === "CANON") {
    return <span aria-hidden className={`inline-block w-[7px] h-[7px] rounded-full ${fill}`} />;
  }
  if (status === "IN_REVIEW") {
    return <span aria-hidden className={`inline-block w-[7px] h-[7px] rounded-full border ${border}`} />;
  }
  return <span aria-hidden className={`inline-block w-[7px] h-[7px] rounded-full border ${borderMuted}`} />;
}

/* ─── Index table ───────────────────────────────────────────────────────── */

function IndexTable({
  works,
  previews,
  visibleMap,
  exhibitionId,
}: {
  works: Work[];
  previews: Set<string>;
  visibleMap: Map<string, boolean>;
  exhibitionId: number;
}) {
  return (
    <div className="border border-ink/10 bg-mna-white/60">
      <div className="px-5 md:px-6 py-5 flex items-baseline justify-between gap-4 border-b border-ink/10">
        <div>
          <p className="text-[10px] font-sans uppercase tracking-[0.24em] text-ink/80">
            Index View <span className="text-ink/45">— Structure Removed</span>
          </p>
          <p className="mt-1 text-[12px] italic font-display text-ink/60">
            Browse all works in a linear index.
          </p>
        </div>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="text-[9px] font-sans uppercase tracking-[0.22em] text-ink/55">
            <th className="px-5 md:px-6 py-3 w-[52px]">ID</th>
            <th className="py-3 w-[64px]"></th>
            <th className="py-3">Work</th>
            <th className="py-3 hidden md:table-cell">Originator</th>
            <th className="py-3 hidden lg:table-cell">Medium</th>
            <th className="py-3">Status</th>
            <th className="py-3 hidden md:table-cell">Canonized On</th>
            <th className="py-3 pr-5 md:pr-6 w-[40px]"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/10">
          {works.map((w, i) => {
            const num = pad2(i + 1);
            const thumb = previews.has(w.id) ? `/previews/${w.id}.png` : null;
            const visible = visibleMap.get(w.id) !== false;
            return (
              <tr
                key={w.id}
                className={`text-[12px] transition-opacity ${
                  visible ? "opacity-100" : "opacity-25"
                }`}
              >
                <td className="px-5 md:px-6 py-3 text-ink/60 tabular-nums">{num}</td>
                <td className="py-3">
                  <div className="relative w-[44px] h-[30px] bg-ink/90 overflow-hidden">
                    {thumb ? (
                      <Image src={thumb} alt="" fill sizes="44px" className="object-cover" />
                    ) : null}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <Link
                    href={`/work/${w.id}?from=exhibition-works&fromId=${exhibitionId}`}
                    className="text-ink hover:text-ink/60 transition-colors font-display text-[14px] leading-tight"
                  >
                    {w.title || "Untitled"}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-ink/75 uppercase tracking-[0.18em] text-[10px] font-sans hidden md:table-cell">
                  {originatorShort(w)}
                </td>
                <td className="py-3 pr-4 text-ink/75 hidden lg:table-cell">
                  {mediumLabel(w.medium)}
                </td>
                <td className="py-3 pr-4">
                  <span className="inline-flex items-center gap-2 text-ink/75">
                    <StatusDot status={w.canon_status} />
                    {statusLabelShort(w.canon_status)}
                  </span>
                </td>
                <td className="py-3 pr-4 text-ink/60 hidden md:table-cell tabular-nums">
                  {w.canon_status === "CANON" ? formatCanonDate(w.canon_date) : "—"}
                </td>
                <td className="py-3 pr-5 md:pr-6 text-right">
                  <Link
                    href={`/work/${w.id}?from=exhibition-works&fromId=${exhibitionId}`}
                    aria-label={`Open ${w.title || w.id}`}
                    className="text-ink/40 hover:text-ink transition-colors"
                  >
                    →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Bottom stat ───────────────────────────────────────────────────────── */

function BottomStat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <p className="font-display font-light text-[40px] md:text-[52px] leading-none tabular-nums">
        {n}
      </p>
      <p className="mt-3 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55">
        {label}
      </p>
    </div>
  );
}
