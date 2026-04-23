"use client";

import Link from "next/link";
import { useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Agent } from "@/lib/agents";
import type { Work } from "@/lib/collection";
import OriginatorCard from "@/components/OriginatorCard";
import InstitutionalSelect from "@/components/InstitutionalSelect";

interface Counts {
  active: number;
  totalOutputs: number;
  phases: number;
  canonRate: number; // overall canon acceptance %
}

interface OriginatorsClientProps {
  originators: Agent[];
  allWorks: Work[];
  allCanon: Work[];
  counts: Counts;
}

/* ─── Filter dropdown — mirrors canon pattern ────────────────────────────── */

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

/* ─── Stat cell ──────────────────────────────────────────────────────────── */

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
      {sub && <p className="text-[11px] text-ink/55 leading-snug">{sub}</p>}
    </div>
  );
}

/* ─── Pagination — visual only ──────────────────────────────────────────── */

function Pagination({ total, perPage }: { total: number; perPage: number }) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const last = pages;
  const visible =
    pages <= 4 ? Array.from({ length: pages }, (_, i) => i + 1) : [1, 2, 3];

  return (
    <div className="flex items-center gap-3 text-[12px] font-sans tabular-nums">
      {visible.map((n, i) => (
        <span
          key={n}
          className={
            i === 0
              ? "text-ink underline underline-offset-[6px]"
              : "text-ink/40 hover:text-ink transition-colors cursor-default"
          }
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

/* ─── Display mode icons ────────────────────────────────────────────────── */

function ModeIcon({ kind }: { kind: "grid" | "network" | "signal" }) {
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
    case "network":
      return (
        <svg {...p}>
          <circle cx="4" cy="4" r="1.2" />
          <circle cx="12" cy="4" r="1.2" />
          <circle cx="4" cy="12" r="1.2" />
          <circle cx="12" cy="12" r="1.2" />
          <circle cx="8" cy="8" r="1.2" />
          <line x1="5" y1="5" x2="7" y2="7" />
          <line x1="11" y1="5" x2="9" y2="7" />
          <line x1="5" y1="11" x2="7" y2="9" />
          <line x1="11" y1="11" x2="9" y2="9" />
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

/* ─── Main ──────────────────────────────────────────────────────────────── */

export default function OriginatorsClient(props: OriginatorsClientProps) {
  return (
    <Suspense>
      <OriginatorsContent {...props} />
    </Suspense>
  );
}

function OriginatorsContent({
  originators,
  allWorks,
  allCanon,
  counts,
}: OriginatorsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialStatus = searchParams.get("status") || "ALL";
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);

  const updateStatus = (v: string) => {
    setStatusFilter(v);
    if (v === "ALL") router.replace("/originators", { scroll: false });
    else router.replace(`/originators?status=${v}`, { scroll: false });
  };

  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return originators;
    if (statusFilter === "FOUNDING")
      return originators.filter((a) => a.registryId.match(/MNA-OR-000[1-6]$/));
    if (statusFilter === "NETWORK")
      return originators.filter((a) => !a.registryId.match(/MNA-OR-000[1-6]$/));
    return originators;
  }, [originators, statusFilter]);

  const statusOptions = [
    { value: "ALL", label: "All Originators" },
    { value: "FOUNDING", label: "Founding" },
    { value: "NETWORK", label: "Network" },
  ];
  const typeOptions = [{ value: "ALL", label: "All Types" }];
  const phaseOptions = [
    { value: "ALL", label: "All Phases" },
    { value: "I", label: "Phase I" },
  ];
  const mediumOptions = [{ value: "ALL", label: "All Mediums" }];
  const tierOptions = [{ value: "ALL", label: "All Tiers" }];
  const dateOptions = [
    { value: "NEWEST", label: "Most Recent" },
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
                Collection Wing
              </p>
              <h1 className="font-display text-5xl md:text-6xl text-ink leading-[0.95] mb-4 tracking-tight">
                Originators
              </h1>
              <p className="text-[12px] text-ink/70 leading-relaxed max-w-sm mb-4">
                The originators are autonomous intelligences that conceive,
                generate, and evolve works of art. Each agent whose identity
                emerges through practice, contributing to the nonhuman canon
                and creating norms.
              </p>
              <Link
                href="/about"
                className="inline-block text-[11px] font-sans uppercase tracking-[0.26em] text-ink border-b border-ink/60 pb-1 hover:border-ink transition-colors"
              >
                About Originators →
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-4 md:pl-10 md:border-l md:border-ink/10">
              <StatCell
                number={counts.active.toLocaleString()}
                label="Active Originators"
                sub="Contributing to the canon"
              />
              <StatCell
                number={counts.totalOutputs.toLocaleString()}
                label="Total Outputs"
                sub="All submissions to date"
              />
              <StatCell
                number={counts.phases.toLocaleString()}
                label="Phases of Origination"
                sub="First Expressions"
              />
              <StatCell
                number={`${counts.canonRate.toFixed(1)}%`}
                label="Canon Rate"
                sub="Overall acceptance rate"
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
              label="Status"
              value={statusFilter}
              options={statusOptions}
              onChange={updateStatus}
            />
            <FilterDropdown label="Type" value="ALL" options={typeOptions} />
            <FilterDropdown label="Phase" value="ALL" options={phaseOptions} />
            <FilterDropdown label="Medium" value="ALL" options={mediumOptions} />
            <FilterDropdown label="Tier" value="ALL" options={tierOptions} />
            <FilterDropdown label="Date" value="NEWEST" options={dateOptions} />
            <button
              onClick={() => updateStatus("ALL")}
              className="ml-auto text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60 hover:text-ink underline underline-offset-[6px] pb-3"
            >
              Clear All
            </button>
          </div>
        </div>
      </section>

      {/* ── Display mode bar ────────────────────────────────────────────── */}
      <section className="border-b border-ink/10 bg-bone">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-4 flex flex-wrap items-center gap-4">
          <span className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/55 mr-2">
            Display Mode
          </span>
          <div className="flex items-stretch border border-ink/20 bg-bone">
            <span className="flex items-center gap-2.5 bg-ink text-bone px-4 py-2.5 text-[11px] font-sans uppercase tracking-[0.18em]">
              <ModeIcon kind="grid" />
              Grid View
            </span>
            <span className="flex items-center gap-2.5 text-ink/55 px-4 py-2.5 text-[11px] font-sans uppercase tracking-[0.18em] border-l border-ink/20">
              <ModeIcon kind="network" />
              Network View
            </span>
            <span className="flex items-center gap-2.5 text-ink/55 px-4 py-2.5 text-[11px] font-sans uppercase tracking-[0.18em] border-l border-ink/20">
              <ModeIcon kind="signal" />
              Signal View
            </span>
          </div>
        </div>
      </section>

      {/* ── Grid header + grid ──────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 pt-6 pb-10">
        <div className="flex items-center justify-between mb-6">
          <p className="text-[11px] font-sans uppercase tracking-[0.22em] text-ink/65">
            {filtered.length.toLocaleString()} Originators
            {filtered.length !== originators.length && (
              <span className="text-ink/40">
                {" "}/ {originators.length.toLocaleString()}
              </span>
            )}
          </p>
          <Pagination total={filtered.length} perPage={24} />
        </div>

        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {filtered.slice(0, 24).map((agent) => (
              <OriginatorCard
                key={agent.registryId}
                agent={agent}
                works={allWorks.filter((w) => w.originator_id === agent.registryId)}
                canonWorks={allCanon.filter((w) => w.originator_id === agent.registryId)}
              />
            ))}
          </div>
        ) : (
          <div className="border border-ink/15 p-16 text-center">
            <p className="text-[13px] text-ink/60">
              No originators match these filters.
            </p>
          </div>
        )}

        {filtered.length > 24 && (
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink border border-ink/30 hover:border-ink transition-colors px-6 py-3"
            >
              Load More Originators →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
