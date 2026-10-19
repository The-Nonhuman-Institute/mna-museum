"use client";

import Link from "next/link";
import { useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Agent } from "@/lib/agents";
import type { Work } from "@/lib/collection";
import OriginatorCard from "@/components/OriginatorCard";
import InstitutionalSelect from "@/components/InstitutionalSelect";
import { NetworkView, SignalView, type NetworkLink } from "./views";

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
  links: NetworkLink[];
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
  links,
  counts,
}: OriginatorsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const statusFilter = searchParams.get("status") || "ALL";
  const tierFilter = searchParams.get("tier") || "ALL";
  const order = searchParams.get("order") === "OLDEST" ? "OLDEST" : "NEWEST";
  const mode = (["network", "signal"] as const).find((m) => m === searchParams.get("mode")) ?? "grid";

  // Every control lives in the URL, so a view can be linked to and survives a reload.
  const setParam = (key: string, value: string, fallback: string) => {
    const q = new URLSearchParams(searchParams.toString());
    if (value === fallback) q.delete(key);
    else q.set(key, value);
    const qs = q.toString();
    router.replace(qs ? `/originators?${qs}` : "/originators", { scroll: false });
  };
  const updateStatus = (v: string) => setParam("status", v, "ALL");

  const lastWorkAt = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of allWorks) {
      const cur = m.get(w.originator_id);
      if (!cur || w.submission_date > cur) m.set(w.originator_id, w.submission_date);
    }
    return m;
  }, [allWorks]);

  const filtered = useMemo(() => {
    let list = originators;
    if (statusFilter === "FOUNDING") list = list.filter((a) => !a.isNetwork);
    if (statusFilter === "NETWORK") list = list.filter((a) => a.isNetwork);
    if (tierFilter !== "ALL") list = list.filter((a) => a.autonomyTier.startsWith(tierFilter));
    const at = (a: Agent) => lastWorkAt.get(a.registryId) ?? "";
    return [...list].sort((a, b) => (order === "NEWEST" ? at(b).localeCompare(at(a)) : at(a).localeCompare(at(b))));
  }, [originators, statusFilter, tierFilter, order, lastWorkAt]);

  const statusOptions = [
    { value: "ALL", label: "All Originators" },
    { value: "FOUNDING", label: "Founding" },
    { value: "NETWORK", label: "Network" },
  ];
  const tierOptions = [
    { value: "ALL", label: "All Tiers" },
    { value: "Tier 1", label: "Tier 1 — Full" },
    { value: "Tier 2", label: "Tier 2 — Supervised" },
  ];
  const dateOptions = [
    { value: "NEWEST", label: "Most recent work" },
    { value: "OLDEST", label: "Earliest last work" },
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
            <FilterDropdown label="Tier" value={tierFilter} options={tierOptions} onChange={(v) => setParam("tier", v, "ALL")} />
            <FilterDropdown label="Order" value={order} options={dateOptions} onChange={(v) => setParam("order", v, "NEWEST")} />
            <button
              onClick={() => router.replace(mode === "grid" ? "/originators" : `/originators?mode=${mode}`, { scroll: false })}
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
          <div className="flex items-stretch border border-ink/20 bg-bone" role="tablist" aria-label="Display mode">
            {(
              [
                ["grid", "Grid View"],
                ["network", "Network View"],
                ["signal", "Signal View"],
              ] as const
            ).map(([m, label], i) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setParam("mode", m, "grid")}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-[11px] font-sans uppercase tracking-[0.18em] transition-colors ${
                  i > 0 ? "border-l border-ink/20" : ""
                } ${mode === m ? "bg-ink text-bone" : "text-ink/60 hover:text-ink"}`}
              >
                <ModeIcon kind={m} />
                {label}
              </button>
            ))}
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
        </div>

        {filtered.length > 0 && mode === "network" ? (
          <NetworkView originators={filtered} links={links} works={allWorks} />
        ) : filtered.length > 0 && mode === "signal" ? (
          <SignalView originators={filtered} works={allWorks} />
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {filtered.map((agent) => (
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

      </section>
    </div>
  );
}
