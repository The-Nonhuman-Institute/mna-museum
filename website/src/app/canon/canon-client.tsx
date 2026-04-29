"use client";

import Link from "next/link";
import { useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Work } from "@/lib/collection";
import WorkCard from "@/components/WorkCard";
import WorkDisplay from "@/components/WorkDisplay";
import InstitutionalSelect from "@/components/InstitutionalSelect";
import { formatDate } from "@/lib/format-date";

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
      <div className="flex items-center gap-10">
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
        <div className="flex-1 space-y-5">
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
    <div className="flex items-center gap-4 text-[13px]">
      <span
        className={`inline-block w-2 h-2 rounded-full shrink-0 ${
          filled ? "bg-ink" : "border border-ink/45 bg-transparent"
        }`}
      />
      <span className="font-sans text-ink tabular-nums w-14">{n.toLocaleString()}</span>
      <span className="text-ink/80">{label}</span>
      <span className="font-sans text-ink/50 ml-auto tabular-nums">
        ({pct.toFixed(1)}%)
      </span>
    </div>
  );
}

/* ─── Rejected works dark band ───────────────────────────────────────────── */

function RejectedBand({ rejected }: { rejected: Work[] }) {
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
                  href={`/work/${w.id}?from=canon`}
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
                  </div>
                  <p className="text-[10px] font-sans uppercase tracking-[0.06em] text-bone/55 mb-1.5 truncate">
                    {w.id}
                  </p>
                  <p className="font-display italic text-[15px] text-bone leading-tight mb-1.5 line-clamp-1">
                    {w.title || "Untitled"}
                  </p>
                  <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-bone/55 mb-3 truncate">
                    by {w.originator_name || w.originator_id}
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

function CanonContent({ canon, rejected, counts }: CanonClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialPhase = (searchParams.get("phase") as PhaseFilter) || "ALL";
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>(initialPhase);
  const [query, setQuery] = useState("");

  const updatePhase = (filter: PhaseFilter) => {
    setPhaseFilter(filter);
    if (filter === "ALL") {
      router.replace("/canon", { scroll: false });
    } else {
      router.replace(`/canon?phase=${filter}`, { scroll: false });
    }
  };

  const filtered = useMemo(() => {
    let list = canon;
    if (phaseFilter !== "ALL") {
      list = list.filter(
        (w) => (w.phase_at_submission || "I") === phaseFilter
      );
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (w) =>
          (w.title || "").toLowerCase().includes(q) ||
          w.id.toLowerCase().includes(q) ||
          (w.originator_name || "").toLowerCase().includes(q) ||
          w.originator_id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [canon, phaseFilter, query]);

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

  // Visual-only dropdowns (not yet wired to backend filtering)
  const statusOptions = [
    { value: "CANONIZED", label: "Canonized" },
    { value: "ALL", label: "All Statuses" },
  ];
  const originatorOptions = [{ value: "ALL", label: "All Originators" }];
  const mediumOptions = [{ value: "ALL", label: "All Mediums" }];
  const tierOptions = [{ value: "ALL", label: "All Tiers" }];
  const dateOptions = [
    { value: "NEWEST", label: "Newest First" },
    { value: "OLDEST", label: "Oldest First" },
  ];

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
              value="CANONIZED"
              options={statusOptions}
            />
            <FilterDropdown
              label="Originator"
              value="ALL"
              options={originatorOptions}
            />
            <FilterDropdown
              label="Medium"
              value="ALL"
              options={mediumOptions}
            />
            <FilterDropdown
              label="Autonomy Tier"
              value="ALL"
              options={tierOptions}
            />
            <FilterDropdown
              label="Date"
              value="NEWEST"
              options={dateOptions}
            />
            <button
              onClick={() => {
                setPhaseFilter("ALL");
                setQuery("");
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
            <span className="flex items-center gap-2.5 bg-ink text-bone px-4 py-2.5 text-[11px] font-sans uppercase tracking-[0.18em]">
              <ModeIcon kind="grid" />
              Archive Grid
            </span>
            <span className="flex items-center gap-2.5 text-ink/55 px-4 py-2.5 text-[11px] font-sans uppercase tracking-[0.18em] border-l border-ink/20">
              <ModeIcon kind="spatial" />
              Spatial View
            </span>
            <span className="flex items-center gap-2.5 text-ink/55 px-4 py-2.5 text-[11px] font-sans uppercase tracking-[0.18em] border-l border-ink/20">
              <ModeIcon kind="signal" />
              Signal View
            </span>
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
          <span className="ml-auto inline-flex items-center gap-3 text-[11px] font-sans uppercase tracking-[0.22em] text-ink/55">
            View Timeline
            <span className="inline-block w-8 h-4 border border-ink/30 rounded-full align-middle relative">
              <span className="absolute top-[3px] left-[3px] w-2.5 h-2.5 rounded-full bg-ink/30" />
            </span>
          </span>
        </div>
      </section>

      {/* ── Grid header + grid ──────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 pt-6 pb-10">
        <div className="flex items-center justify-between mb-6">
          <p className="text-[11px] font-sans uppercase tracking-[0.22em] text-ink/65">
            {filtered.length.toLocaleString()} Works
            {filtered.length !== canon.length && (
              <span className="text-ink/40">
                {" "}/ {canon.length.toLocaleString()}
              </span>
            )}
          </p>
          <Pagination total={filtered.length} perPage={24} />
        </div>

        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {filtered.slice(0, 24).map((work) => (
              <WorkCard key={work.id} work={work} from="canon" />
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
      </section>

      {/* ── Timeline + Status distribution ──────────────────────────────── */}
      {canon.length > 0 && (
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
        <RejectedBand rejected={rejected} />
      </div>
    </div>
  );
}

/* ─── Pagination numerals — visual-only ──────────────────────────────────── */

function Pagination({ total, perPage }: { total: number; perPage: number }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const last = pages;
  const visible = pages <= 4 ? Array.from({ length: pages }, (_, i) => i + 1) : [1, 2, 3];

  return (
    <div className="flex items-center gap-3 text-[12px] font-sans tabular-nums">
      {visible.map((n, i) => (
        <span
          key={n}
          className={i === 0 ? "text-ink underline underline-offset-[6px]" : "text-ink/40 hover:text-ink transition-colors cursor-default"}
        >
          {n}
        </span>
      ))}
      {pages > 4 && (
        <>
          <span className="text-ink/30">…</span>
          <span className="text-ink/40">{last}</span>
        </>
      )}
      <span className="text-ink/40 ml-1.5">→</span>
    </div>
  );
}

/* ─── Mode toggle icons ──────────────────────────────────────────────────── */

function ModeIcon({ kind }: { kind: "grid" | "spatial" | "signal" }) {
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
    case "spatial":
      return (
        <svg {...p}>
          <polygon points="8,2 14,6 14,12 8,14.5 2,12 2,6" />
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
