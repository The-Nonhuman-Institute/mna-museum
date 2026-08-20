"use client";

import Link from "next/link";
import { useState, useMemo, useRef, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Work } from "@/lib/collection";
import WorkCard from "@/components/WorkCard";
import WorkDisplay from "@/components/WorkDisplay";
import InstitutionalSelect from "@/components/InstitutionalSelect";
import { formatDate } from "@/lib/format-date";
import { originatorLabel } from "@/lib/originator-name";

type PhaseFilter = "ALL" | "I" | "II" | "III" | "IV";

interface Counts {
  canon: number;
  rejected: number;
  inReview: number;
  originators: number;
  totalWorks: number;
}

interface CanonClientProps {
  canon: Work[];
  rejected: Work[];
  counts: Counts;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Resolve the visible label for an Originator. Until an Originator emerges
 *  (declares its full identity), the institution refers to it by registry
 *  ID rather than by a placeholder string like "PENDING_EMERGENCE" or
 *  "[Pending Emergence]". This keeps presentation consistent regardless
 *  of whether the placeholder field is filled or left empty. */
/** Detail-page href that carries the listing's filter state for the back link. */
function workHrefWithQs(id: string, qs?: string): string {
  return `/work/${id}?from=canon${qs ? `&fromQs=${encodeURIComponent(qs)}` : ""}`;
}

/** "2026-04-24" → "APR 24, 2026" */
function formatDateMono(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const datePart = dateStr.split("T")[0];
  const parts = datePart.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${MONTHS[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

/* ─── Hero stats rail ────────────────────────────────────────────────────── */

function StatCell({
  number,
  label,
  sub,
}: {
  number: string;
  label: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="font-display text-3xl md:text-[2.25rem] text-ink mb-2 leading-none whitespace-nowrap">
        {number}
      </p>
      <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/60 mb-1.5">
        {label}
      </p>
      {sub && (
        <p className="text-[11px] text-ink/55 leading-snug">{sub}</p>
      )}
    </div>
  );
}

/* ─── Filter dropdown — thin wrapper giving the filter row a consistent min-width */

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange?: (v: string) => void;
}) {
  return (
    <div className="min-w-[130px]">
      <InstitutionalSelect
        label={label}
        value={value}
        options={options}
        onChange={onChange}
      />
    </div>
  );
}

/* ─── Canon timeline (horizontal dots, most recent 5 canonizations) ───────── */

function CanonTimeline({ canon }: { canon: Work[] }) {
  const recent = [...canon]
    .filter((w) => w.canon_date)
    .sort((a, b) => (b.canon_date! > a.canon_date! ? 1 : -1))
    .slice(0, 5);

  if (recent.length === 0) return null;

  // Mock layout: LATEST sits at middle (index 2) with older items flanking.
  // `recent` is newest→oldest. Rearrange to [oldest-5, older-4, LATEST, 3rd, 2nd].
  const latestIdx = Math.floor((Math.min(recent.length, 5) - 1) / 2);
  const arranged: typeof recent = [];
  if (recent.length === 5) {
    arranged.push(recent[4], recent[3], recent[0], recent[2], recent[1]);
  } else {
    // <5 items — just reverse to oldest→newest and let LATEST sit at end
    arranged.push(...recent.slice().reverse());
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-8">
        <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/60">
          Canon Timeline
        </p>
        <Link
          href="/canon"
          className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/60 hover:text-ink transition-colors"
        >
          View Full Timeline →
        </Link>
      </div>
      <div className="relative">
        {/* Horizontal line across the full width */}
        <div className="absolute top-[4px] left-0 right-0 h-px bg-ink/20" />

        <div className="grid grid-cols-6 gap-2 items-start">
          {arranged.map((w, i) => {
            const isLatest = i === latestIdx;
            const dateParts = formatDateMono(w.canon_date!).split(",");
            const originatorLabel = (() => {
              const name = (w.originator_name || "").trim();
              if (name && name !== "PENDING_EMERGENCE") return name.toUpperCase();
              const m = w.originator_id.match(/MNA-(OR-\d+)/);
              return m ? m[1] : w.originator_id;
            })();

            if (isLatest) {
              return (
                <div
                  key={w.id}
                  className="col-span-2 relative border border-ink/25 bg-bone px-4 pt-4 pb-4 flex flex-col items-center"
                >
                  {/* Black dot sits on the timeline line, centered on box top edge */}
                  <span className="absolute -top-[4px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-ink z-10" />
                  <p className="text-[13px] font-sans uppercase tracking-[0.14em] text-ink text-center leading-tight">
                    {dateParts[0]}
                  </p>
                  <p className="text-[13px] font-sans uppercase tracking-[0.14em] text-ink/55 text-center leading-tight">
                    {dateParts[1]?.trim()}
                  </p>
                  <div className="w-full h-px bg-ink/15 my-3" />
                  <span className="inline-block text-[9px] font-sans uppercase tracking-[0.22em] bg-ink text-bone px-2 py-0.5 mb-3">
                    Latest
                  </span>
                  <p className="text-[10px] font-sans text-ink/55 text-center truncate max-w-full mb-1">
                    {w.id}
                  </p>
                  <p className="text-[13px] font-display italic text-ink text-center line-clamp-1 mb-1">
                    {w.title || "Untitled"}
                  </p>
                  <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 text-center truncate max-w-full">
                    by {originatorLabel}
                  </p>
                </div>
              );
            }
            return (
              <div
                key={w.id}
                className="relative flex flex-col items-center col-span-1 pt-3"
              >
                <span className="block w-2.5 h-2.5 rounded-full bg-bone border border-ink/40 mb-3 relative z-10" />
                <p className="text-[11px] font-sans uppercase tracking-[0.14em] text-ink text-center leading-tight">
                  {dateParts[0]}
                </p>
                <p className="text-[11px] font-sans uppercase tracking-[0.14em] text-ink/55 text-center leading-tight mb-2">
                  {dateParts[1]?.trim()}
                </p>
                <p className="text-[9px] font-sans text-ink/55 text-center truncate max-w-full mb-1">
                  {w.id}
                </p>
                <p className="text-[11px] font-display italic text-ink text-center line-clamp-1 mb-0.5">
                  {w.title || "Untitled"}
                </p>
                <p className="text-[9px] font-sans uppercase tracking-[0.18em] text-ink/55 text-center truncate max-w-full">
                  by {originatorLabel}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Status distribution (3-segment ring + legend) ──────────────────────── */

function StatusDistribution({ counts }: { counts: Counts }) {
  const total = counts.canon + counts.rejected + counts.inReview;
  if (total === 0) return null;

  const canonPct = (counts.canon / total) * 100;
  const reviewPct = (counts.inReview / total) * 100;
  const rejectedPct = (counts.rejected / total) * 100;

  // SVG ring — circumference 2πr, offsets build up the arcs
  const r = 58;
  const c = 2 * Math.PI * r;
  const canonLen = (canonPct / 100) * c;
  const reviewLen = (reviewPct / 100) * c;
  const rejectedLen = (rejectedPct / 100) * c;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-8">
        <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/60">
          Canon Status Distribution
        </p>
        <Link
          href="/archive"
          className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/60 hover:text-ink transition-colors"
        >
          View All Status →
        </Link>
      </div>
      <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:gap-10">
        <svg
          width="160"
          height="160"
          viewBox="0 0 160 160"
          className="shrink-0 -rotate-90"
        >
          <circle cx="80" cy="80" r={r} stroke="#E6E2DA" strokeWidth="16" fill="none" />
          {/* Canon segment */}
          <circle
            cx="80"
            cy="80"
            r={r}
            stroke="#0A0A0A"
            strokeWidth="16"
            fill="none"
            strokeDasharray={`${canonLen} ${c - canonLen}`}
            strokeDashoffset="0"
          />
          {/* Under Review segment */}
          <circle
            cx="80"
            cy="80"
            r={r}
            stroke="#8A8680"
            strokeWidth="16"
            fill="none"
            strokeDasharray={`${reviewLen} ${c - reviewLen}`}
            strokeDashoffset={-canonLen}
          />
          {/* Rejected segment */}
          <circle
            cx="80"
            cy="80"
            r={r}
            stroke="#C9C4BC"
            strokeWidth="16"
            fill="none"
            strokeDasharray={`${rejectedLen} ${c - rejectedLen}`}
            strokeDashoffset={-(canonLen + reviewLen)}
          />
        </svg>
        <div className="flex-1 w-full min-w-0 space-y-5">
          <LegendRow filled n={counts.canon} label="Canonized" pct={canonPct} />
          <LegendRow n={counts.inReview} label="Under Review" pct={reviewPct} />
          <LegendRow n={counts.rejected} label="Rejected" pct={rejectedPct} />
        </div>
      </div>
    </div>
  );
}

function LegendRow({
  filled = false,
  n,
  label,
  pct,
}: {
  filled?: boolean;
  n: number;
  label: string;
  pct: number;
}) {
  return (
    <div className="flex items-center gap-3 text-[13px] min-w-0">
      <span
        className={`inline-block w-2 h-2 rounded-full shrink-0 ${
          filled ? "bg-ink" : "border border-ink/45 bg-transparent"
        }`}
      />
      <span className="font-sans text-ink tabular-nums w-10 shrink-0">{n.toLocaleString()}</span>
      <span className="text-ink/80 truncate">{label}</span>
      <span className="font-sans text-ink/50 ml-auto tabular-nums shrink-0 whitespace-nowrap">
        ({pct.toFixed(1)}%)
      </span>
    </div>
  );
}

/* ─── Rejected works dark band ───────────────────────────────────────────── */

function RejectedBand({ rejected, fromQs }: { rejected: Work[]; fromQs?: string }) {
  if (rejected.length === 0) return null;
  const featured = rejected.slice(0, 3);

  return (
    <section className="bg-ink text-bone -mx-5 md:-mx-8">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-14">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-10">
          <div>
            <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-bone/55 mb-5">
              Rejected Works
            </p>
            <h2 className="font-display text-4xl md:text-5xl text-bone leading-[1.05] mb-5">
              Not canonized.
              <br />
              Preserved.
            </h2>
            <p className="text-[13px] text-bone/70 leading-relaxed mb-7 max-w-sm">
              Works not admitted to the canon remain part of the permanent
              record. Transparency is part of the institution.
            </p>
            <Link
              href="/archive?status=REJECTED"
              className="inline-block text-[10px] font-sans uppercase tracking-[0.22em] text-bone border-b border-bone/40 pb-0.5 hover:border-bone transition-colors"
            >
              View Rejected Works →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {featured.map((w) => {
              const reasonCount = w.evaluations.filter(
                (e) => e.verdict === "REJECTED"
              ).length;
              return (
                <Link
                  key={w.id}
                  href={workHrefWithQs(w.id, fromQs)}
                  className="block group bg-[#121212] hover:bg-[#181818] transition-colors p-4"
                >
                  <div className="relative aspect-square overflow-hidden mb-4 bg-[#1c1c1c]">
                    <div className="absolute inset-0 [&>*]:w-full [&>*]:h-full [&_svg]:w-full [&_svg]:h-full [&_iframe]:w-full [&_iframe]:h-full [&_canvas]:w-full [&_canvas]:h-full">
                      <WorkDisplay
                        work={w}
                        size="gallery"
                        framed={false}
                        showPlacard={false}
                      />
                    </div>
                    <span className="absolute inset-0 z-10" aria-hidden />
                  </div>
                  <p className="text-[10px] font-sans uppercase tracking-[0.06em] text-bone/55 mb-1.5 truncate">
                    {w.id}
                  </p>
                  <p className="font-display italic text-[15px] text-bone leading-tight mb-1.5 line-clamp-1">
                    {w.title || "Untitled"}
                  </p>
                  <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-bone/55 mb-3 truncate">
                    by {originatorLabel(w.originator_name, w.originator_id)}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] font-sans text-bone/60 mb-2 pt-2 border-t border-bone/10">
                    <span>Rejected</span>
                    <span className="text-bone/30">·</span>
                    <span>
                      {formatDate(w.canon_date || w.submission_date)}
                    </span>
                  </div>
                  {reasonCount > 0 && (
                    <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-bone/75">
                      {reasonCount} reason{reasonCount !== 1 ? "s" : ""} →
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
        <p className="text-[11px] text-bone/50 text-center mt-12 max-w-3xl mx-auto">
          All works — canonized or not — are preserved in the Archive of Nonhuman Culture.
        </p>
      </div>
    </section>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */

export default function CanonClient(props: CanonClientProps) {
  return (
    <Suspense>
      <CanonContent {...props} />
    </Suspense>
  );
}

type DisplayMode = "grid" | "signal";
const PER_PAGE = 24;

function CanonContent({ canon, rejected, counts }: CanonClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialPhase = (searchParams.get("phase") as PhaseFilter) || "ALL";
  const initialMode: DisplayMode =
    searchParams.get("mode") === "signal" ? "signal" : "grid";
  const initialPage = Math.max(
    1,
    parseInt(searchParams.get("page") || "1", 10) || 1,
  );
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>(initialPhase);
  const [mode, setMode] = useState<DisplayMode>(initialMode);
  const [page, setPage] = useState<number>(initialPage);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  // Every filter is seeded from the URL, not just phase/mode/page. Otherwise
  // returning from a work page resets the archive to canon — you would lose
  // the Rejected view you were browsing on every back-navigation.
  const [statusFilter, setStatusFilter] = useState<string>(
    searchParams.get("status") ?? "CANONIZED",
  );
  const [originatorFilter, setOriginatorFilter] = useState<string>(
    searchParams.get("originator") ?? "ALL",
  );
  const [mediumFilter, setMediumFilter] = useState<string>(
    searchParams.get("medium") ?? "ALL",
  );
  const [tierFilter, setTierFilter] = useState<string>(
    searchParams.get("tier") ?? "ALL",
  );
  const [dateSort, setDateSort] = useState<"NEWEST" | "OLDEST">(
    searchParams.get("sort") === "OLDEST" ? "OLDEST" : "NEWEST",
  );
  const [showTimeline, setShowTimeline] = useState(false);

  function pushUrl(next: {
    phase?: PhaseFilter;
    mode?: DisplayMode;
    page?: number;
    status?: string;
    originator?: string;
    medium?: string;
    tier?: string;
    sort?: "NEWEST" | "OLDEST";
    query?: string;
  }) {
    const phase = next.phase ?? phaseFilter;
    const m = next.mode ?? mode;
    const p = next.page ?? page;
    const status = next.status ?? statusFilter;
    const originator = next.originator ?? originatorFilter;
    const medium = next.medium ?? mediumFilter;
    const tier = next.tier ?? tierFilter;
    const sort = next.sort ?? dateSort;
    const q = next.query ?? query;
    const params = new URLSearchParams();
    if (phase !== "ALL") params.set("phase", phase);
    if (m !== "grid") params.set("mode", m);
    if (p > 1) params.set("page", String(p));
    if (status !== "CANONIZED") params.set("status", status);
    if (originator !== "ALL") params.set("originator", originator);
    if (medium !== "ALL") params.set("medium", medium);
    if (tier !== "ALL") params.set("tier", tier);
    if (sort !== "NEWEST") params.set("sort", sort);
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    router.replace(`/canon${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  /**
   * The current filter state as a query string, handed to detail links so the
   * work page's "Back to Canon" returns to the exact view being browsed.
   */
  function currentQs(): string {
    const params = new URLSearchParams();
    if (phaseFilter !== "ALL") params.set("phase", phaseFilter);
    if (mode !== "grid") params.set("mode", mode);
    if (page > 1) params.set("page", String(page));
    if (statusFilter !== "CANONIZED") params.set("status", statusFilter);
    if (originatorFilter !== "ALL") params.set("originator", originatorFilter);
    if (mediumFilter !== "ALL") params.set("medium", mediumFilter);
    if (tierFilter !== "ALL") params.set("tier", tierFilter);
    if (dateSort !== "NEWEST") params.set("sort", dateSort);
    if (query.trim()) params.set("q", query.trim());
    return params.toString();
  }

  const updatePhase = (filter: PhaseFilter) => {
    setPhaseFilter(filter);
    setPage(1);
    pushUrl({ phase: filter, page: 1 });
  };

  const updateMode = (m: DisplayMode) => {
    setMode(m);
    setPage(1);
    pushUrl({ mode: m, page: 1 });
  };

  const updatePage = (p: number) => {
    setPage(p);
    pushUrl({ page: p });
    if (typeof window !== "undefined") {
      const grid = document.getElementById("canon-grid");
      if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Source pool depends on Status filter — canon, rejected, or both
  // unioned. Other filters (phase / originator / medium / tier / search)
  // apply to whatever source the status picks.
  const sourcePool = useMemo(() => {
    if (statusFilter === "REJECTED") return rejected;
    if (statusFilter === "ALL") return [...canon, ...rejected];
    return canon;
  }, [statusFilter, canon, rejected]);

  function applyAllFilters(list: Work[]): Work[] {
    let out = list;
    if (phaseFilter !== "ALL") {
      out = out.filter((w) => (w.phase_at_submission || "I") === phaseFilter);
    }
    if (originatorFilter !== "ALL") {
      out = out.filter((w) => w.originator_id === originatorFilter);
    }
    if (mediumFilter !== "ALL") {
      out = out.filter(
        (w) => (w.medium || "").toLowerCase() === mediumFilter.toLowerCase(),
      );
    }
    if (tierFilter !== "ALL") {
      out = out.filter((w) => (w.autonomy_tier || "") === tierFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (w) =>
          (w.title || "").toLowerCase().includes(q) ||
          w.id.toLowerCase().includes(q) ||
          (w.originator_name || "").toLowerCase().includes(q) ||
          w.originator_id.toLowerCase().includes(q),
      );
    }
    out = [...out].sort((a, b) => {
      const da = a.canon_date || a.submission_date || "";
      const db = b.canon_date || b.submission_date || "";
      return dateSort === "NEWEST"
        ? db.localeCompare(da)
        : da.localeCompare(db);
    });
    return out;
  }

  const filtered = useMemo(
    () => applyAllFilters(sourcePool),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      sourcePool,
      phaseFilter,
      originatorFilter,
      mediumFilter,
      tierFilter,
      query,
      dateSort,
    ],
  );

  // Filtered canon/rejected for Signal View — apply same filters but
  // keep the canon vs rejected split so it can render both bands.
  const filteredCanon = useMemo(
    () => applyAllFilters(canon),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canon, phaseFilter, originatorFilter, mediumFilter, tierFilter, query, dateSort],
  );
  const filteredRejected = useMemo(
    () => applyAllFilters(rejected),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rejected, phaseFilter, originatorFilter, mediumFilter, tierFilter, query, dateSort],
  );

  // Pagination math
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageWorks = useMemo(
    () =>
      filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE),
    [filtered, safePage],
  );

  // Stats rail values
  const latestCanon = useMemo(() => {
    return [...canon]
      .filter((w) => w.canon_date)
      .sort((a, b) => (b.canon_date! > a.canon_date! ? 1 : -1))[0];
  }, [canon]);

  const phaseOptions = [
    { value: "ALL", label: "All Phases" },
    { value: "I", label: "Phase I" },
    { value: "II", label: "Phase II" },
    { value: "III", label: "Phase III" },
    { value: "IV", label: "Phase IV" },
  ];

  const statusOptions = [
    { value: "CANONIZED", label: "Canonized" },
    { value: "REJECTED", label: "Rejected" },
    { value: "ALL", label: "All Statuses" },
  ];
  const dateOptions = [
    { value: "NEWEST", label: "Newest First" },
    { value: "OLDEST", label: "Oldest First" },
  ];

  // Dynamic option lists, computed from the union of canon + rejected.
  const allWorks = useMemo(() => [...canon, ...rejected], [canon, rejected]);
  const originatorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of allWorks) {
      map.set(w.originator_id, originatorLabel(w.originator_name, w.originator_id));
    }
    const opts = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, label]) => ({ value, label }));
    return [{ value: "ALL", label: "All Originators" }, ...opts];
  }, [allWorks]);
  const mediumOptions = useMemo(() => {
    const set = new Set<string>();
    for (const w of allWorks) {
      const m = (w.medium || "").trim();
      if (m) set.add(m);
    }
    const opts = Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((m) => ({ value: m, label: m.charAt(0).toUpperCase() + m.slice(1) }));
    return [{ value: "ALL", label: "All Mediums" }, ...opts];
  }, [allWorks]);
  const tierOptions = useMemo(() => {
    const set = new Set<string>();
    for (const w of allWorks) {
      const t = (w.autonomy_tier || "").trim();
      if (t) set.add(t);
    }
    const opts = Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((t) => ({ value: t, label: t }));
    return [{ value: "ALL", label: "All Tiers" }, ...opts];
  }, [allWorks]);

  return (
    <div className="min-h-screen">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="border-b border-ink/10 bg-bone">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-8 md:py-10">
          <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1.9fr] gap-8 md:gap-10 items-start">
            <div>
              <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-3">
                Collection
              </p>
              <h1 className="font-display text-5xl md:text-6xl text-ink leading-[0.95] mb-4 tracking-tight">
                The Canon
              </h1>
              <p className="text-[12px] text-ink/70 leading-relaxed max-w-sm mb-4">
                The recognized body of nonhuman cultural output. Selected
                through evaluation, debate, and consensus within the Museum&apos;s
                governance system.
              </p>
              <Link
                href="/about"
                className="inline-block text-[11px] font-sans uppercase tracking-[0.26em] text-ink border-b border-ink/60 pb-1 hover:border-ink transition-colors"
              >
                About the Canon →
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-4 md:pl-10 md:border-l md:border-ink/10">
              <StatCell
                number={counts.canon.toLocaleString()}
                label="Canonized Works"
                sub="Across all phases"
              />
              <StatCell
                number={counts.originators.toLocaleString()}
                label="Active Originators"
                sub="Contributing to the canon"
              />
              <StatCell
                number="Phase I"
                label="Current Phase"
                sub="First Expressions"
              />
              <StatCell
                number={formatDateMono(latestCanon?.canon_date)}
                label="Last Canonization"
                sub={latestCanon?.id}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <section className="border-b border-ink/10 bg-bone">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-5">
          <div className="flex flex-wrap items-end gap-4">
            <span className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/55 pb-3 mr-2">
              Filters
            </span>
            <FilterDropdown
              label="Phase"
              value={phaseFilter}
              options={phaseOptions}
              onChange={(v) => updatePhase(v as PhaseFilter)}
            />
            <FilterDropdown
              label="Status"
              value={statusFilter}
              options={statusOptions}
              onChange={(v) => {
                setStatusFilter(v);
                setPage(1);
                pushUrl({ status: v, page: 1 });
              }}
            />
            <FilterDropdown
              label="Originator"
              value={originatorFilter}
              options={originatorOptions}
              onChange={(v) => {
                setOriginatorFilter(v);
                setPage(1);
                pushUrl({ originator: v, page: 1 });
              }}
            />
            <FilterDropdown
              label="Medium"
              value={mediumFilter}
              options={mediumOptions}
              onChange={(v) => {
                setMediumFilter(v);
                setPage(1);
                pushUrl({ medium: v, page: 1 });
              }}
            />
            <FilterDropdown
              label="Autonomy Tier"
              value={tierFilter}
              options={tierOptions}
              onChange={(v) => {
                setTierFilter(v);
                setPage(1);
                pushUrl({ tier: v, page: 1 });
              }}
            />
            <FilterDropdown
              label="Date"
              value={dateSort}
              options={dateOptions}
              onChange={(v) => {
                setDateSort(v as "NEWEST" | "OLDEST");
                pushUrl({ sort: v as "NEWEST" | "OLDEST" });
              }}
            />
            <button
              onClick={() => {
                setPhaseFilter("ALL");
                setStatusFilter("CANONIZED");
                setOriginatorFilter("ALL");
                setMediumFilter("ALL");
                setTierFilter("ALL");
                setDateSort("NEWEST");
                setQuery("");
                setPage(1);
                router.replace("/canon", { scroll: false });
              }}
              className="ml-auto text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60 hover:text-ink underline underline-offset-[6px] pb-3"
            >
              Clear All
            </button>
          </div>
        </div>
      </section>

      {/* ── Display mode + search ───────────────────────────────────────── */}
      <section className="border-b border-ink/10 bg-bone">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-4 flex flex-wrap items-center gap-4">
          <span className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/55 mr-2">
            Display Mode
          </span>
          <div className="flex items-stretch border border-ink/20 bg-bone">
            <button
              type="button"
              onClick={() => updateMode("grid")}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-[11px] font-sans uppercase tracking-[0.18em] transition-colors ${
                mode === "grid"
                  ? "bg-ink text-bone"
                  : "text-ink/55 hover:text-ink"
              }`}
            >
              <ModeIcon kind="grid" />
              Archive Grid
            </button>
            <button
              type="button"
              onClick={() => updateMode("signal")}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-[11px] font-sans uppercase tracking-[0.18em] border-l border-ink/20 transition-colors ${
                mode === "signal"
                  ? "bg-ink text-bone"
                  : "text-ink/55 hover:text-ink"
              }`}
            >
              <ModeIcon kind="signal" />
              Signal View
            </button>
          </div>
          <div className="flex-1 min-w-[240px] max-w-md">
            <input
              type="text"
              placeholder="Search works, originators, titles..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full text-[13px] font-sans text-ink bg-bone border border-ink/20 focus:border-ink/50 outline-none px-4 py-2.5"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowTimeline((v) => !v)}
            aria-pressed={showTimeline}
            className="ml-auto inline-flex items-center gap-3 text-[11px] font-sans uppercase tracking-[0.22em] text-ink/65 hover:text-ink transition-colors"
          >
            View Timeline
            <span
              className={`inline-block w-8 h-4 rounded-full align-middle relative transition-colors ${
                showTimeline
                  ? "bg-ink border border-ink"
                  : "bg-bone border border-ink/30"
              }`}
            >
              <span
                className={`absolute top-[3px] w-2.5 h-2.5 rounded-full transition-all ${
                  showTimeline
                    ? "left-[15px] bg-bone"
                    : "left-[3px] bg-ink/30"
                }`}
              />
            </span>
          </button>
        </div>
      </section>

      {/* ── Grid / Signal section ───────────────────────────────────────── */}
      <section
        id="canon-grid"
        className="max-w-7xl mx-auto px-5 md:px-8 pt-6 pb-10 scroll-mt-24"
      >
        {mode === "grid" ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-[11px] font-sans uppercase tracking-[0.22em] text-ink/65">
                {filtered.length.toLocaleString()} Works
                {filtered.length !== canon.length && (
                  <span className="text-ink/40">
                    {" "}
                    / {canon.length.toLocaleString()}
                  </span>
                )}
              </p>
              <Pagination
                total={filtered.length}
                perPage={PER_PAGE}
                current={safePage}
                onChange={updatePage}
              />
            </div>

            {filtered.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
                {pageWorks.map((work) => (
                  <WorkCard key={work.id} work={work} from="canon" fromQs={currentQs()} />
                ))}
              </div>
            ) : (
              <div className="border border-ink/15 p-16 text-center">
                <p className="text-[13px] text-ink/60">
                  {canon.length === 0
                    ? "The canon is empty. The Evaluation Council has not yet rendered its first verdict."
                    : "No works match these filters."}
                </p>
              </div>
            )}

            {/* Bottom pagination — same component, makes long pages navigable */}
            {totalPages > 1 ? (
              <div className="mt-10 flex justify-end">
                <Pagination
                  total={filtered.length}
                  perPage={PER_PAGE}
                  current={safePage}
                  onChange={updatePage}
                />
              </div>
            ) : null}
          </>
        ) : (
          <SignalView
            canon={filteredCanon}
            rejected={filteredRejected}
            filterKey={`${phaseFilter}|${statusFilter}|${originatorFilter}|${mediumFilter}|${tierFilter}|${query}|${dateSort}`}
            fromQs={currentQs()}
          />
        )}
      </section>

      {/* ── Timeline + Status distribution (toggleable) ─────────────────── */}
      {canon.length > 0 && showTimeline && (
        <section className="border-t border-ink/10 bg-bone/50">
          <div className="max-w-7xl mx-auto px-5 md:px-8 py-10 md:py-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 md:divide-x md:divide-ink/10">
              <div className="md:pr-12"><CanonTimeline canon={canon} /></div>
              <div className="md:pl-12"><StatusDistribution counts={counts} /></div>
            </div>
          </div>
        </section>
      )}

      {/* ── Rejected works dark band ────────────────────────────────────── */}
      <div className="px-5 md:px-8">
        <RejectedBand rejected={rejected} fromQs={currentQs()} />
      </div>
    </div>
  );
}

/* ─── Pagination ─────────────────────────────────────────────────────────── */

function Pagination({
  total,
  perPage,
  current,
  onChange,
}: {
  total: number;
  perPage: number;
  current: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;

  // Build the visible-numbers window. Always show 1 and last; show neighbors
  // of current; insert ellipses where gaps exist.
  const visible: (number | "ellipsis")[] = [];
  const add = (v: number | "ellipsis") => {
    if (v === "ellipsis") {
      if (visible[visible.length - 1] !== "ellipsis") visible.push(v);
      return;
    }
    if (!visible.includes(v)) visible.push(v);
  };
  add(1);
  if (current - 1 > 2) add("ellipsis");
  for (let n = Math.max(2, current - 1); n <= Math.min(pages - 1, current + 1); n++) add(n);
  if (current + 1 < pages - 1) add("ellipsis");
  if (pages > 1) add(pages);

  return (
    <div className="flex items-center gap-3 text-[12px] font-sans tabular-nums">
      {visible.map((v, i) =>
        v === "ellipsis" ? (
          <span key={`e-${i}`} className="text-ink/30">
            …
          </span>
        ) : (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={
              v === current
                ? "text-ink underline underline-offset-[6px]"
                : "text-ink/40 hover:text-ink transition-colors"
            }
          >
            {v}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => current < pages && onChange(current + 1)}
        disabled={current >= pages}
        className="text-ink/40 hover:text-ink transition-colors ml-1.5 disabled:opacity-30 disabled:hover:text-ink/40"
        aria-label="Next page"
      >
        →
      </button>
    </div>
  );
}

/* ─── Mode toggle icons ──────────────────────────────────────────────────── */

function ModeIcon({ kind }: { kind: "grid" | "signal" }) {
  const p = {
    width: 11,
    height: 11,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (kind) {
    case "grid":
      return (
        <svg {...p}>
          <rect x="2" y="2" width="5" height="5" />
          <rect x="9" y="2" width="5" height="5" />
          <rect x="2" y="9" width="5" height="5" />
          <rect x="9" y="9" width="5" height="5" />
        </svg>
      );
    case "signal":
      return (
        <svg {...p}>
          <polyline points="2,10 5,6 7,11 10,3 13,8" />
        </svg>
      );
  }
}

/* ─── Signal View ────────────────────────────────────────────────────────── */

/** Activity timeline. Each verdict is a preview thumbnail plotted by its
 *  canon_date along the X axis. Canonized rise from a center axis,
 *  rejected fall below it. Date labels live in a dedicated middle band
 *  so thumbnails never trample them. The whole timeline pans
 *  horizontally and zooms in/out — you can scroll deep into a council
 *  round to see each verdict, or zoom out for the full canon arc. */
function SignalView({
  canon,
  rejected,
  filterKey,
  fromQs,
}: {
  canon: Work[];
  rejected: Work[];
  filterKey: string;
  fromQs?: string;
}) {
  type Event = { work: Work; status: "canon" | "rejected" };
  type PlacedEvent = Event & { xPx: number; row: number };

  // Caller has already applied filters; we just merge canon + rejected
  // into a single time-sorted event stream and skip events without dates.
  const events: Event[] = useMemo(() => {
    const all: Event[] = [
      ...canon.map((w) => ({ work: w, status: "canon" as const })),
      ...rejected.map((w) => ({ work: w, status: "rejected" as const })),
    ];
    return all
      .filter((e) => e.work.canon_date)
      .sort((a, b) =>
        a.work.canon_date! < b.work.canon_date! ? -1 : 1,
      );
  }, [canon, rejected]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  // Container width set by ResizeObserver so we can scale inner timeline
  // without locking it to a fixed px count up front.
  const [viewportWidth, setViewportWidth] = useState(1200);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Free-range pan + pinch-zoom on the canvas.
  //
  // Trackpad two-finger pan (no modifier) → moves the canvas in any direction.
  // Trackpad pinch (ctrlKey) or Cmd+scroll → zooms with cursor as focal point.
  // Native wheel listener with passive:false so we can preventDefault and
  // override the browser's default zoom + scroll behaviors.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Pinch-zoom — focal point at cursor stays anchored
        const view = viewportRef.current;
        if (!view) return;
        const rect = view.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        const clamped = Math.max(-50, Math.min(50, e.deltaY));

        setZoom((currentZoom) => {
          const factor = Math.exp(-clamped * 0.01);
          const next = Math.max(0.05, Math.min(25, currentZoom * factor));
          if (next === currentZoom) return currentZoom;
          // Adjust pan so the point under the cursor stays put.
          // contentX/Y at cursor = (cursorX - panX) * (innerOld / innerNew),
          // simplified for the linear case where the canvas grows uniformly:
          const ratio = next / currentZoom;
          setPan((currentPan) => ({
            x: cursorX - (cursorX - currentPan.x) * ratio,
            y: cursorY - (cursorY - currentPan.y) * ratio,
          }));
          return next;
        });
      } else {
        // Two-finger pan
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    }

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  // Drag-to-pan. Mousedown on the canvas (not on a thumbnail or button)
  // grabs the canvas; mousemove translates pan; mouseup releases. Real
  // drags (>4px) suppress the next click so dragging off-canvas onto a
  // link doesn't accidentally navigate.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    let active = false;
    let movedFar = false;
    let startClientX = 0;
    let startClientY = 0;
    let startPanX = 0;
    let startPanY = 0;

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("a, button")) return;
      active = true;
      movedFar = false;
      startClientX = e.clientX;
      startClientY = e.clientY;
      // Read latest pan from state via ref (closure-safe)
      startPanX = panRef.current.x;
      startPanY = panRef.current.y;
      setIsDragging(true);
      e.preventDefault();
    }

    function onMouseMove(e: MouseEvent) {
      if (!active) return;
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      if (!movedFar && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        movedFar = true;
      }
      setPan({ x: startPanX + dx, y: startPanY + dy });
    }

    function onMouseUp() {
      if (!active) return;
      active = false;
      setIsDragging(false);
      if (movedFar) {
        const handler = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
          window.removeEventListener("click", handler, true);
        };
        window.addEventListener("click", handler, true);
      }
    }

    viewport.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      viewport.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Keep a ref of the latest pan so the drag handler reads it correctly
  // without re-binding listeners on every pan change.
  const panRef = useRef(pan);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  // Fixed timeline range — Jan 1, 2026 (institution founding) running
  // forward to a rolling future horizon. Verdicts plot at their actual
  // dates within this span; empty stretches before the first verdict
  // and after the most recent are intentional, showing the institution's
  // pulse against its full chronological context.
  const minTime = useMemo(
    () => new Date("2026-01-01T00:00:00Z").getTime(),
    [],
  );
  const maxTime = useMemo(() => {
    // Latest of: most recent verdict + 30 days, OR today + 6 months.
    // Whichever pushes the right edge further into the future. Memoized
    // on event count so it's stable per render but advances over time as
    // new verdicts arrive.
    const latestVerdict =
      events[events.length - 1]
        ? new Date(events[events.length - 1].work.canon_date!).getTime()
        : 0;
    const sixMonthsOut =
      Date.now() + 6 * 30 * 24 * 60 * 60 * 1000;
    return Math.max(
      latestVerdict + 30 * 24 * 60 * 60 * 1000,
      sixMonthsOut,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);

  // Natural canvas width — fixed regardless of zoom. Zoom is applied
  // via transform:scale, so visual size of everything (thumbnails,
  // axis labels, spacing) scales uniformly. Width is sized to give
  // comfortable density at zoom=1 — ~10px per day in the data range,
  // floored at 1500px for very short spans.
  const PAD = 80;
  const totalDays = Math.max(
    1,
    (maxTime - minTime) / (1000 * 60 * 60 * 24),
  );
  const innerWidth = Math.max(1500, totalDays * 10 + PAD * 2);
  const usableWidth = innerWidth - PAD * 2;

  const dateToPx = (dateStr: string): number => {
    if (maxTime === minTime) return innerWidth / 2;
    const t = new Date(dateStr).getTime();
    return ((t - minTime) / (maxTime - minTime)) * usableWidth + PAD;
  };

  // Zoom buttons — focal point is the visible center of the viewport.
  function changeZoom(next: number) {
    const target = Math.max(0.05, Math.min(25, next));
    const view = viewportRef.current;
    if (!view) {
      setZoom(target);
      return;
    }
    const cursorX = view.clientWidth / 2;
    const cursorY = view.clientHeight / 2;
    setZoom((currentZoom) => {
      if (target === currentZoom) return currentZoom;
      const ratio = target / currentZoom;
      setPan((currentPan) => ({
        x: cursorX - (cursorX - currentPan.x) * ratio,
        y: cursorY - (cursorY - currentPan.y) * ratio,
      }));
      return target;
    });
  }

  // Reset view — fit the canon span to the viewport, axis centered.
  function resetView() {
    const view = viewportRef.current;
    if (!view) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const fitZoom = Math.max(
      0.2,
      Math.min(1.2, (view.clientWidth - 80) / innerWidth),
    );
    setZoom(fitZoom);
    setPan({
      x: view.clientWidth / 2 - (innerWidth * fitZoom) / 2,
      y:
        VIEWPORT_HEIGHT / 2 -
        (CANON_BAND_BOTTOM + AXIS_BAND / 2) * fitZoom,
    });
  }

  // Pixel-based stacking so spacing tracks zoom level: events that are
  // close in time at low zoom stack tall, then flatten as you zoom in.
  const MIN_SEP_CANON = 42;
  const MIN_SEP_REJECT = 32;
  const placed: PlacedEvent[] = useMemo(() => {
    const occupiedCanon: Array<{ x: number; row: number }> = [];
    const occupiedReject: Array<{ x: number; row: number }> = [];
    return events.map((e) => {
      const xPx = dateToPx(e.work.canon_date!);
      const occ = e.status === "canon" ? occupiedCanon : occupiedReject;
      const sep = e.status === "canon" ? MIN_SEP_CANON : MIN_SEP_REJECT;
      let row = 0;
      while (occ.some((p) => p.row === row && Math.abs(p.x - xPx) < sep)) {
        row++;
      }
      occ.push({ x: xPx, row });
      return { ...e, xPx, row };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, innerWidth, minTime, maxTime]);

  // Month tick labels — denser at higher zoom (we'll always show months,
  // but at zoom >= 4 we also drop in mid-month markers for orientation).
  const monthTicks = useMemo(() => {
    if (!minTime || !maxTime) return [];
    const start = new Date(minTime);
    const end = new Date(maxTime);
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const ticks: { label: string; xPx: number }[] = [];
    while (cur <= end) {
      const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-01`;
      ticks.push({
        label: `${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`,
        xPx: dateToPx(iso),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return ticks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minTime, maxTime, innerWidth]);

  const canonCount = events.filter((e) => e.status === "canon").length;
  const rejectedCount = events.filter((e) => e.status === "rejected").length;

  // Layout geometry (in px). The middle band holds the date labels and
  // is never entered by thumbnails. Inner canvas height grows to fit
  // however tall the stacks need to be — viewport scrolls vertically
  // when content exceeds it (drag-pan works in both axes).
  const VIEWPORT_HEIGHT = 600;
  const AXIS_BAND = 70; // px reserved for date labels + tick marks
  const THUMB = 38;
  const REJECT_THUMB = 30;
  const ROW_GAP = 4;
  const PADDING_Y = 28;

  const maxCanonRow = placed.reduce(
    (m, p) => (p.status === "canon" && p.row > m ? p.row : m),
    0,
  );
  const maxRejectRow = placed.reduce(
    (m, p) => (p.status === "rejected" && p.row > m ? p.row : m),
    0,
  );
  const canonStackHeight =
    (maxCanonRow + 1) * (THUMB + ROW_GAP) + PADDING_Y;
  const rejectStackHeight =
    (maxRejectRow + 1) * (REJECT_THUMB + ROW_GAP) + PADDING_Y;
  const computedHeight =
    canonStackHeight + AXIS_BAND + rejectStackHeight;
  const innerHeight = Math.max(VIEWPORT_HEIGHT, computedHeight);
  const CANON_BAND_BOTTOM = innerHeight - rejectStackHeight - AXIS_BAND;
  const REJECT_BAND_TOP = CANON_BAND_BOTTOM + AXIS_BAND;

  // Auto-center the canvas: on initial viewport measurement, and when
  // filters change (filterKey is a flat string of all active filters).
  // Picks an initial zoom that fits the canon span horizontally with a
  // little margin, so the user opens to a useful overview.
  useEffect(() => {
    if (viewportWidth < 100) return;
    const initialZoom = Math.max(
      0.2,
      Math.min(1.2, (viewportWidth - 80) / innerWidth),
    );
    setZoom(initialZoom);
    setPan({
      x: viewportWidth / 2 - (innerWidth * initialZoom) / 2,
      y:
        VIEWPORT_HEIGHT / 2 -
        (CANON_BAND_BOTTOM + AXIS_BAND / 2) * initialZoom,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, viewportWidth]);

  if (events.length === 0) {
    return (
      <div className="border border-ink/15 p-16 text-center">
        <p className="text-[13px] text-ink/60">
          No verdicts to plot under these filters.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-[11px] font-sans uppercase tracking-[0.22em] text-ink/65 mb-1.5">
            Signal — {events.length.toLocaleString()} verdicts
          </p>
          <p className="text-[12px] text-ink/55 max-w-md leading-relaxed">
            Every council verdict, plotted by date. Canonized rise above
            the line; rejected fall below. Pan and zoom to read clusters.
          </p>
        </div>
        <div className="flex items-center gap-5 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/65">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Canonized · {canonCount}
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full border border-ink/45 bg-bone" />
            Rejected · {rejectedCount}
          </span>
        </div>
      </div>

      <div className="relative bg-bone border border-ink/15">
        {/* Canvas controls — top-right, floating over viewport */}
        <div className="absolute top-3 right-3 z-30 flex items-stretch border border-ink/20 bg-bone/95 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => changeZoom(Math.max(0.05, zoom / 1.5))}
            disabled={zoom <= 0.05}
            className="px-3 py-1.5 text-[14px] font-sans text-ink/65 hover:text-ink disabled:opacity-30 disabled:hover:text-ink/65 transition-colors"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="flex items-center px-3 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 border-l border-r border-ink/20 tabular-nums min-w-[60px] justify-center">
            {(zoom * 100).toFixed(0)}%
          </span>
          <button
            type="button"
            onClick={() => changeZoom(Math.min(25, zoom * 1.5))}
            disabled={zoom >= 25}
            className="px-3 py-1.5 text-[14px] font-sans text-ink/65 hover:text-ink disabled:opacity-30 disabled:hover:text-ink/65 transition-colors"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={resetView}
            className="px-3 py-1.5 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/65 hover:text-ink border-l border-ink/20 transition-colors"
            aria-label="Reset view"
          >
            Reset
          </button>
        </div>

        {/* Viewport — overflow hidden; canvas inside is transform-translated
            so the user can pan freely in any direction past content edges,
            FigJam-style. Cursor flips to grabbing during drag. */}
        <div
          ref={viewportRef}
          className={`overflow-hidden select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          style={{ height: VIEWPORT_HEIGHT, touchAction: "none" }}
        >
          <div
            className="relative"
            style={{
              width: innerWidth,
              height: innerHeight,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              willChange: "transform",
            }}
          >
            {/* Top axis line (above date band) */}
            <div
              className="absolute left-0 right-0 h-px bg-ink/30"
              style={{ top: CANON_BAND_BOTTOM }}
            />
            {/* Bottom axis line (below date band) */}
            <div
              className="absolute left-0 right-0 h-px bg-ink/15"
              style={{ top: REJECT_BAND_TOP }}
            />

            {/* Date labels in the dedicated middle band */}
            {monthTicks.map((t, i) => (
              <div
                key={i}
                className="absolute flex flex-col items-center"
                style={{
                  left: t.xPx,
                  top: CANON_BAND_BOTTOM,
                  height: AXIS_BAND,
                  transform: "translateX(-50%)",
                }}
              >
                <span className="block w-px h-2 bg-ink/30" />
                <span className="mt-2 text-[9px] font-sans uppercase tracking-[0.22em] text-ink/45 whitespace-nowrap">
                  {t.label}
                </span>
              </div>
            ))}

            {/* Event thumbnails */}
            {placed.map((e, idx) => {
              const isCanon = e.status === "canon";
              const size = isCanon ? THUMB : REJECT_THUMB;
              const offset =
                e.row * (size + ROW_GAP) + size / 2 + 6;
              const yPx = isCanon
                ? CANON_BAND_BOTTOM - offset
                : REJECT_BAND_TOP + offset;
              const ringClass = isCanon
                ? "ring-1 ring-emerald-500/70 group-hover:ring-2"
                : "ring-1 ring-ink/30 opacity-75 group-hover:opacity-100";
              return (
                <Link
                  key={`${e.work.id}-${idx}`}
                  href={workHrefWithQs(e.work.id, fromQs)}
                  className="group absolute focus:outline-none"
                  style={{
                    left: e.xPx,
                    top: yPx,
                    width: size,
                    height: size,
                    transform: "translate(-50%, -50%)",
                    zIndex: isCanon ? 2 : 1,
                  }}
                  aria-label={`${e.work.title || e.work.id} by ${originatorLabel(e.work.originator_name, e.work.originator_id)}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/previews/${e.work.id}.png`}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className={`w-full h-full object-cover bg-ink ${ringClass} transition-all group-hover:scale-[1.6] group-hover:z-30`}
                  />
                  <span
                    className={`pointer-events-none absolute left-1/2 -translate-x-1/2 px-3 py-2 bg-ink text-bone whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity z-40 ${isCanon ? "mt-2" : "-mt-2 -translate-y-full"}`}
                    style={isCanon ? { top: "100%" } : { bottom: "100%" }}
                  >
                    <span className="block text-[9px] font-sans uppercase tracking-[0.22em] text-bone/55 mb-0.5">
                      {e.work.id} ·{" "}
                      {isCanon ? "Canonized" : "Rejected"}
                    </span>
                    <span className="block font-display italic text-[13px] text-bone leading-tight">
                      {e.work.title || "Untitled"}
                    </span>
                    <span className="block text-[10px] font-sans uppercase tracking-[0.18em] text-bone/65 mt-0.5">
                      {originatorLabel(e.work.originator_name, e.work.originator_id)} ·{" "}
                      {formatDate(e.work.canon_date!)}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/45 mt-3">
        Drag or two-finger scroll to pan · Pinch or ⌘-scroll to zoom · Click a thumbnail to read the work
      </p>
    </div>
  );
}
