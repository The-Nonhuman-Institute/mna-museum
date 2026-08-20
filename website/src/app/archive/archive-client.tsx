"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Work } from "@/lib/collection";
import WorkCard from "@/components/WorkCard";
import InstitutionalSelect from "@/components/InstitutionalSelect";
import { originatorLabel } from "@/lib/originator-name";

type StatusFilter = "ALL" | "CANON" | "REJECTED" | "IN_REVIEW";
type PhaseFilter = "ALL" | "I" | "II" | "III" | "IV";

const MONTHS_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const PER_PAGE = 24;

function formatDateMono(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const datePart = dateStr.split("T")[0];
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return dateStr;
  return `${MONTHS_SHORT[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

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

export default function ArchiveClient({ works }: { works: Work[] }) {
  return (
    <Suspense>
      <ArchiveContent works={works} />
    </Suspense>
  );
}

function ArchiveContent({ works }: { works: Work[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialStatus = (searchParams.get("status") as StatusFilter) || "ALL";
  const initialPhase = (searchParams.get("phase") as PhaseFilter) || "ALL";
  const initialPage = Math.max(
    1,
    parseInt(searchParams.get("page") || "1", 10) || 1,
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>(initialPhase);
  const [originatorFilter, setOriginatorFilter] = useState<string>("ALL");
  const [mediumFilter, setMediumFilter] = useState<string>("ALL");
  const [tierFilter, setTierFilter] = useState<string>("ALL");
  const [dateSort, setDateSort] = useState<"NEWEST" | "OLDEST">("NEWEST");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<number>(initialPage);

  function pushUrl(next: {
    status?: StatusFilter;
    phase?: PhaseFilter;
    page?: number;
  }) {
    const status = next.status ?? statusFilter;
    const phase = next.phase ?? phaseFilter;
    const p = next.page ?? page;
    const params = new URLSearchParams();
    if (status !== "ALL") params.set("status", status);
    if (phase !== "ALL") params.set("phase", phase);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    router.replace(`/archive${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  const counts = useMemo(() => {
    return {
      all: works.length,
      canon: works.filter((w) => w.canon_status === "CANON").length,
      rejected: works.filter((w) => w.canon_status === "REJECTED").length,
      inReview: works.filter(
        (w) =>
          w.canon_status === "IN_REVIEW" || w.canon_status === "SUBMITTED",
      ).length,
    };
  }, [works]);

  const latestSubmission = useMemo(() => {
    return [...works]
      .filter((w) => w.submission_date)
      .sort((a, b) =>
        b.submission_date!.localeCompare(a.submission_date!),
      )[0];
  }, [works]);

  function applyAllFilters(list: Work[]): Work[] {
    let out = list;
    if (statusFilter !== "ALL") {
      if (statusFilter === "IN_REVIEW") {
        out = out.filter(
          (w) =>
            w.canon_status === "IN_REVIEW" || w.canon_status === "SUBMITTED",
        );
      } else {
        out = out.filter((w) => w.canon_status === statusFilter);
      }
    }
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
    return [...out].sort((a, b) => {
      const da = a.canon_date || a.submission_date || "";
      const db = b.canon_date || b.submission_date || "";
      return dateSort === "NEWEST"
        ? db.localeCompare(da)
        : da.localeCompare(db);
    });
  }

  const filtered = useMemo(
    () => applyAllFilters(works),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      works,
      statusFilter,
      phaseFilter,
      originatorFilter,
      mediumFilter,
      tierFilter,
      query,
      dateSort,
    ],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageWorks = useMemo(
    () => filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE),
    [filtered, safePage],
  );

  const updateStatus = (s: StatusFilter) => {
    setStatusFilter(s);
    setPage(1);
    pushUrl({ status: s, page: 1 });
  };
  const updatePhase = (p: PhaseFilter) => {
    setPhaseFilter(p);
    setPage(1);
    pushUrl({ phase: p, page: 1 });
  };
  const updatePage = (p: number) => {
    setPage(p);
    pushUrl({ page: p });
    if (typeof window !== "undefined") {
      const grid = document.getElementById("archive-grid");
      if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const phaseOptions = [
    { value: "ALL", label: "All Phases" },
    { value: "I", label: "Phase I" },
    { value: "II", label: "Phase II" },
    { value: "III", label: "Phase III" },
    { value: "IV", label: "Phase IV" },
  ];
  const statusOptions = [
    { value: "ALL", label: "All Statuses" },
    { value: "CANON", label: "Canonized" },
    { value: "REJECTED", label: "Rejected" },
    { value: "IN_REVIEW", label: "Under Review" },
  ];
  const dateOptions = [
    { value: "NEWEST", label: "Newest First" },
    { value: "OLDEST", label: "Oldest First" },
  ];

  const originatorOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of works) {
      map.set(
        w.originator_id,
        originatorLabel(w.originator_name, w.originator_id),
      );
    }
    const opts = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, label]) => ({ value, label }));
    return [{ value: "ALL", label: "All Originators" }, ...opts];
  }, [works]);
  const mediumOptions = useMemo(() => {
    const set = new Set<string>();
    for (const w of works) {
      const m = (w.medium || "").trim();
      if (m) set.add(m);
    }
    const opts = Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((m) => ({
        value: m,
        label: m.charAt(0).toUpperCase() + m.slice(1),
      }));
    return [{ value: "ALL", label: "All Mediums" }, ...opts];
  }, [works]);
  const tierOptions = useMemo(() => {
    const set = new Set<string>();
    for (const w of works) {
      const t = (w.autonomy_tier || "").trim();
      if (t) set.add(t);
    }
    const opts = Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((t) => ({ value: t, label: t }));
    return [{ value: "ALL", label: "All Tiers" }, ...opts];
  }, [works]);

  return (
    <div className="min-h-screen">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="border-b border-ink/10 bg-bone">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-8 md:py-10">
          <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1.9fr] gap-8 md:gap-10 items-start">
            <div>
              <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-3">
                Complete Record
              </p>
              <h1 className="font-display text-5xl md:text-6xl text-ink leading-[0.95] mb-4 tracking-tight">
                The Archive
              </h1>
              <p className="text-[12px] text-ink/70 leading-relaxed max-w-sm mb-4">
                Every submission. Every verdict. Every dissent. The institution
                preserves its full deliberative record — canon and rejection
                alike, with equal weight.
              </p>
              <Link
                href="/canon"
                className="inline-block text-[11px] font-sans uppercase tracking-[0.26em] text-ink border-b border-ink/60 pb-1 hover:border-ink transition-colors"
              >
                View Canon →
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-4 md:pl-10 md:border-l md:border-ink/10">
              <StatCell
                number={counts.all.toLocaleString()}
                label="Total Submissions"
                sub="Across all phases"
              />
              <StatCell
                number={counts.canon.toLocaleString()}
                label="Canonized"
                sub="Admitted to permanent collection"
              />
              <StatCell
                number={counts.rejected.toLocaleString()}
                label="Rejected"
                sub="Preserved as record"
              />
              <StatCell
                number={formatDateMono(latestSubmission?.submission_date)}
                label="Last Submission"
                sub={latestSubmission?.id}
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
              onChange={(v) => updateStatus(v as StatusFilter)}
            />
            <FilterDropdown
              label="Originator"
              value={originatorFilter}
              options={originatorOptions}
              onChange={(v) => {
                setOriginatorFilter(v);
                setPage(1);
              }}
            />
            <FilterDropdown
              label="Medium"
              value={mediumFilter}
              options={mediumOptions}
              onChange={(v) => {
                setMediumFilter(v);
                setPage(1);
              }}
            />
            <FilterDropdown
              label="Autonomy Tier"
              value={tierFilter}
              options={tierOptions}
              onChange={(v) => {
                setTierFilter(v);
                setPage(1);
              }}
            />
            <FilterDropdown
              label="Date"
              value={dateSort}
              options={dateOptions}
              onChange={(v) => setDateSort(v as "NEWEST" | "OLDEST")}
            />
            <button
              onClick={() => {
                setStatusFilter("ALL");
                setPhaseFilter("ALL");
                setOriginatorFilter("ALL");
                setMediumFilter("ALL");
                setTierFilter("ALL");
                setDateSort("NEWEST");
                setQuery("");
                setPage(1);
                router.replace("/archive", { scroll: false });
              }}
              className="ml-auto text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60 hover:text-ink underline underline-offset-[6px] pb-3"
            >
              Clear All
            </button>
          </div>
        </div>
      </section>

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      <section className="border-b border-ink/10 bg-bone">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-4 flex flex-wrap items-center gap-4">
          <span className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/55 mr-2">
            Search
          </span>
          <div className="flex-1 min-w-[240px] max-w-xl">
            <input
              type="text"
              placeholder="Search works, originators, titles..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              className="w-full text-[13px] font-sans text-ink bg-bone border border-ink/20 focus:border-ink/50 outline-none px-4 py-2.5"
            />
          </div>
        </div>
      </section>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <section
        id="archive-grid"
        className="max-w-7xl mx-auto px-5 md:px-8 pt-6 pb-10 scroll-mt-24"
      >
        <div className="flex items-center justify-between mb-6">
          <p className="text-[11px] font-sans uppercase tracking-[0.22em] text-mna-white/70">
            {filtered.length.toLocaleString()} Works
            {filtered.length !== works.length && (
              <span className="text-mna-white/40">
                {" "}
                / {works.length.toLocaleString()}
              </span>
            )}
            <span className="text-mna-white/40">
              {" "}
              — Page {safePage} of {totalPages}
            </span>
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
              <WorkCard key={work.id} work={work} from="archive" />
            ))}
          </div>
        ) : (
          <div className="border border-ink/15 p-16 text-center">
            <p className="text-[13px] text-ink/60">
              No works match these filters.
            </p>
          </div>
        )}

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
      </section>
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
  for (
    let n = Math.max(2, current - 1);
    n <= Math.min(pages - 1, current + 1);
    n++
  )
    add(n);
  if (current + 1 < pages - 1) add("ellipsis");
  if (pages > 1) add(pages);

  return (
    <div className="flex items-center gap-3 text-[12px] font-sans tabular-nums">
      {visible.map((v, i) =>
        v === "ellipsis" ? (
          <span key={`e-${i}`} className="text-mna-white/30">
            …
          </span>
        ) : (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={
              v === current
                ? "text-mna-white underline underline-offset-[6px]"
                : "text-mna-white/45 hover:text-mna-white transition-colors"
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
        className="text-mna-white/45 hover:text-mna-white transition-colors ml-1.5 disabled:opacity-30 disabled:hover:text-mna-white/45"
        aria-label="Next page"
      >
        →
      </button>
    </div>
  );
}
