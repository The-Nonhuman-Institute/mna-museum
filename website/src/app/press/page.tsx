/**
 * /press — Institutional Voice index.
 *
 * Mock #128: same shell as /research (dark hero, primary tabs, list,
 * right rail) but tuned for press items. Right rail panels:
 *   - Press at a Glance (totals broken out by type)
 *   - Filter Press (type / format / agent / date range)
 *   - Recent Additions
 *
 * Data: src/data/press.json. Filter state lives in URL query params.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { pressDocuments, pressTypeLabels } from "@/lib/press";
import type { PressDocument } from "@/lib/press";
import MNAGlyph, { pickFamily } from "@/components/MNAGlyph";
import PressFilterRail from "./FilterRail";

export const metadata: Metadata = {
  title: "Press — Museum of Nonhuman Art",
  description:
    "Interviews, stewardship records, and institutional statements. The public voice of the Museum of Nonhuman Art.",
};

const PAGE_SIZE = 5;

type TypeFilter = "ALL" | PressDocument["document_type"];

const PRIMARY_TABS: { value: TypeFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "interview", label: "Interviews" },
  { value: "stewardship-record", label: "Stewardship Records" },
  { value: "statement", label: "Statements" },
];

function formatLong(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso ?? "—";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShort(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso ?? "—";
  return d
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
}

function excerpt(body: string, max = 170): string {
  const cleaned = body
    .replace(/^#+\s+.*$/gm, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1).trimEnd() + "…";
}

function readMinutes(body: string): number {
  const words = body.replace(/\s+/g, " ").trim().split(" ").length;
  return Math.max(1, Math.round(words / 220));
}

export default function PressPage({
  searchParams,
}: {
  searchParams?: { [k: string]: string | string[] | undefined };
}) {
  const get = (k: string): string | undefined => {
    const v = searchParams?.[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const type = (get("type") as TypeFilter) || "ALL";
  const pageNum = Math.max(1, parseInt(get("page") ?? "1", 10) || 1);

  const filtered = pressDocuments
    .filter((d) => type === "ALL" || d.document_type === type)
    .sort((a, b) => b.publication_date.localeCompare(a.publication_date));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(pageNum, totalPages);
  const sliceStart = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(sliceStart, sliceStart + PAGE_SIZE);

  const recent = [...pressDocuments]
    .sort((a, b) => b.publication_date.localeCompare(a.publication_date))
    .slice(0, 3);

  const counts = {
    total: pressDocuments.length,
    interview: pressDocuments.filter((d) => d.document_type === "interview")
      .length,
    stewardship: pressDocuments.filter(
      (d) => d.document_type === "stewardship-record",
    ).length,
    statement: pressDocuments.filter((d) => d.document_type === "statement")
      .length,
  };
  const latestPub = pressDocuments.reduce(
    (max, d) => (d.publication_date > max ? d.publication_date : max),
    pressDocuments[0]?.publication_date ?? "",
  );

  return (
    <div className="bg-ink text-mna-white min-h-screen">
      <Hero />
      <PrimaryTabs current={type} />

      <section className="px-5 md:px-10 lg:px-16 pb-24">
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 lg:gap-12 mt-10">
          {/* ── Left: list + pagination ─────────────────────────────────── */}
          <div>
            <SortBar />
            <ul className="border-t border-mna-white/15">
              {visible.length === 0 ? (
                <li className="py-20 text-center text-mna-white/55 text-[14px]">
                  No press items match this filter.
                </li>
              ) : (
                visible.map((doc) => (
                  <PressRow key={doc.id} doc={doc} />
                ))
              )}
            </ul>

            <div className="flex items-center justify-between gap-4 mt-10 pt-6 border-t border-mna-white/15">
              <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55">
                Showing {filtered.length === 0 ? 0 : sliceStart + 1}–
                {Math.min(sliceStart + visible.length, filtered.length)} of{" "}
                {filtered.length} items
              </p>
              <Pagination
                current={currentPage}
                total={totalPages}
                type={type}
              />
            </div>
          </div>

          {/* ── Right rail ──────────────────────────────────────────────── */}
          <aside className="space-y-6">
            <Glance counts={counts} latest={latestPub} updated={latestPub} />
            <Suspense
              fallback={
                <div className="border border-mna-white/15 h-[300px]" />
              }
            >
              <PressFilterRail />
            </Suspense>
            <Recent recent={recent} />
          </aside>
        </div>
      </section>
    </div>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-10">
      <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 lg:gap-12">
        <div>
          <div className="flex items-center gap-3 mb-5">
            <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
              Institutional Voice
            </p>
            <ScratchMark />
          </div>
          <h1
            className="font-serif font-light text-mna-white"
            style={{
              fontSize: "clamp(46px, 7vw, 86px)",
              lineHeight: "1.02",
              letterSpacing: "-0.005em",
            }}
          >
            Press
          </h1>
          <div className="w-12 h-px bg-mna-white/35 mt-7 mb-7" />
          <p className="text-[15px] leading-[1.55] text-mna-white/72 max-w-[580px]">
            Interviews, stewardship records, and institutional statements. The
            public voice of the Museum of Nonhuman Art.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── Tabs ──────────────────────────────────────────────────────────────── */

function PrimaryTabs({ current }: { current: TypeFilter }) {
  return (
    <div className="px-5 md:px-10 lg:px-16">
      <div className="max-w-[1280px] mx-auto border-b border-mna-white/15">
        <nav className="flex flex-wrap gap-x-9 gap-y-2 py-3">
          {PRIMARY_TABS.map((t) => {
            const active = current === t.value;
            const href = buildHref({ type: t.value });
            return (
              <Link
                key={t.value}
                href={href}
                className={`relative text-[10.5px] uppercase tracking-[0.22em] py-2.5 transition-colors ${
                  active
                    ? "text-mna-white"
                    : "text-mna-white/55 hover:text-mna-white/80"
                }`}
              >
                {t.label.toUpperCase()}
                {active ? (
                  <span className="absolute -bottom-px left-0 right-0 h-px bg-mna-white" />
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

/* ─── Sort + view bar ───────────────────────────────────────────────────── */

function SortBar() {
  return (
    <div className="flex items-center justify-between gap-6 mb-5">
      <div className="flex items-center gap-3">
        <span className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55">
          Sort by:
        </span>
        <span className="text-[11px] uppercase tracking-[0.18em] text-mna-white inline-flex items-center gap-2">
          Most Recent
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </span>
      </div>
      <div className="inline-flex items-center text-mna-white/65">
        <span
          className="inline-flex items-center justify-center w-7 h-7 border border-mna-white/35 text-mna-white"
          aria-current="true"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <line x1="3" y1="4" x2="13" y2="4" stroke="currentColor" />
            <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" />
            <line x1="3" y1="12" x2="13" y2="12" stroke="currentColor" />
          </svg>
        </span>
        <span className="inline-flex items-center justify-center w-7 h-7 border border-l-0 border-mna-white/20 text-mna-white/50">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <rect
              x="3"
              y="3"
              width="4"
              height="4"
              stroke="currentColor"
              strokeWidth="1"
            />
            <rect
              x="9"
              y="3"
              width="4"
              height="4"
              stroke="currentColor"
              strokeWidth="1"
            />
            <rect
              x="3"
              y="9"
              width="4"
              height="4"
              stroke="currentColor"
              strokeWidth="1"
            />
            <rect
              x="9"
              y="9"
              width="4"
              height="4"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

/* ─── Press row ─────────────────────────────────────────────────────────── */

function PressRow({ doc }: { doc: PressDocument }) {
  const family = pickFamily(doc.id);
  const minutes = readMinutes(doc.body);
  const badge = pressTypeLabels[doc.document_type].toUpperCase();
  const formatLabel = pressTypeLabels[doc.document_type];

  return (
    <li className="border-b border-mna-white/15 py-7">
      <Link
        href={`/press/${doc.id}`}
        className="grid grid-cols-[110px_1fr_auto] gap-6 items-start group"
      >
        {/* Thumbnail */}
        <div className="w-[110px] h-[110px] bg-black border border-mna-white/15 flex items-center justify-center text-mna-white/85">
          <MNAGlyph family={family} seed={doc.id} size={92} />
        </div>

        {/* Center column */}
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-block px-2 py-1 border border-mna-white/30 text-[9px] uppercase tracking-[0.22em] text-mna-white">
              {badge}
            </span>
            <span className="text-[11px] uppercase tracking-[0.18em] text-mna-white/55">
              {doc.id}
            </span>
          </div>
          <h2 className="font-serif text-[22px] md:text-[24px] leading-[1.18] text-mna-white mb-3 group-hover:text-mna-white">
            {doc.title}
          </h2>
          {doc.subtitle ? (
            <p className="text-[13px] leading-[1.55] text-mna-white/65 italic max-w-[560px] mb-4">
              {doc.subtitle}
            </p>
          ) : (
            <p className="text-[13px] leading-[1.55] text-mna-white/65 max-w-[560px] mb-4">
              {excerpt(doc.body, 170)}
            </p>
          )}
          <p className="text-[11px] uppercase tracking-[0.18em] text-mna-white/55">
            {doc.conducted_by}
            <span className="mx-2 text-mna-white/30">·</span>
            {formatLong(doc.publication_date)}
            <span className="mx-2 text-mna-white/30">·</span>
            {minutes} min read
          </p>
        </div>

        {/* Right column */}
        <div className="text-left min-w-[140px] flex flex-col gap-3 pl-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-mna-white/55">
              Format
            </p>
            <p className="text-[12px] tracking-[0.04em] text-mna-white mt-1">
              {formatLabel}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-mna-white/55">
              Published
            </p>
            <p className="text-[12px] tracking-[0.04em] text-mna-white mt-1">
              {formatLong(doc.publication_date)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-mna-white/55">
              Read Time
            </p>
            <p className="text-[12px] tracking-[0.04em] text-mna-white mt-1">
              {minutes} min
            </p>
          </div>
          <span
            aria-hidden
            className="text-mna-white/55 group-hover:text-mna-white text-[18px] mt-2"
          >
            →
          </span>
        </div>
      </Link>
    </li>
  );
}

/* ─── Pagination ────────────────────────────────────────────────────────── */

function Pagination({
  current,
  total,
  type,
}: {
  current: number;
  total: number;
  type: TypeFilter;
}) {
  if (total <= 1) return null;
  const items = pageRange(current, total);
  const cls =
    "inline-flex items-center justify-center min-w-8 h-8 px-2 text-[11px] uppercase tracking-[0.18em] border border-transparent transition-colors";
  return (
    <nav className="flex items-center gap-1.5">
      <PageLink
        type={type}
        page={Math.max(1, current - 1)}
        disabled={current === 1}
        className={cls}
        ariaLabel="Previous page"
      >
        Prev
      </PageLink>
      {items.map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e${i}`} className={`${cls} text-mna-white/45`}>
            …
          </span>
        ) : (
          <PageLink
            key={p}
            type={type}
            page={p}
            className={`${cls} ${
              p === current
                ? "border-mna-white text-mna-white"
                : "text-mna-white/65 hover:text-mna-white"
            }`}
            ariaLabel={`Page ${p}`}
            ariaCurrent={p === current ? "page" : undefined}
          >
            {p}
          </PageLink>
        ),
      )}
      <PageLink
        type={type}
        page={Math.min(total, current + 1)}
        disabled={current === total}
        className={cls}
        ariaLabel="Next page"
      >
        Next
      </PageLink>
    </nav>
  );
}

function PageLink({
  page,
  type,
  disabled,
  className,
  children,
  ariaLabel,
  ariaCurrent,
}: {
  page: number;
  type: TypeFilter;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
  ariaCurrent?: "page";
}) {
  if (disabled) {
    return (
      <span
        aria-label={ariaLabel}
        className={`${className} text-mna-white/25`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={buildHref({ type, page })}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
      className={className}
    >
      {children}
    </Link>
  );
}

function pageRange(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items: (number | "ellipsis")[] = [];
  items.push(1);
  if (current > 3) items.push("ellipsis");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    items.push(i);
  }
  if (current < total - 2) items.push("ellipsis");
  items.push(total);
  return items;
}

/* ─── Right rail ────────────────────────────────────────────────────────── */

function RailHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-mna-white/15 pb-3 mb-4">
      <h3 className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white">
        {children}
      </h3>
      <span aria-hidden className="flex-1 ml-2 h-px bg-mna-white/15" />
      <ScratchMark />
    </div>
  );
}

function ScratchMark() {
  return (
    <svg
      width="22"
      height="6"
      viewBox="0 0 22 6"
      fill="none"
      aria-hidden
      className="text-mna-white/45 shrink-0"
    >
      <line x1="0" y1="3" x2="14" y2="3" stroke="currentColor" strokeWidth="0.6" />
      <line x1="16" y1="2" x2="22" y2="4" stroke="currentColor" strokeWidth="0.6" />
    </svg>
  );
}

function Glance({
  counts,
  latest,
  updated,
}: {
  counts: { total: number; interview: number; stewardship: number; statement: number };
  latest: string;
  updated: string;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "Total Items", value: String(counts.total) },
    { label: "Interviews", value: String(counts.interview) },
    { label: "Stewardship Records", value: String(counts.stewardship) },
    { label: "Statements", value: String(counts.statement) },
    { label: "Latest Publication", value: formatLong(latest).toUpperCase() },
    { label: "Last Updated", value: formatLong(updated).toUpperCase() },
    { label: "Access", value: "PUBLIC ARCHIVE" },
  ];
  return (
    <div className="border border-mna-white/15 p-5">
      <RailHeader>Press at a Glance</RailHeader>
      <dl className="space-y-2.5">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55">
              {r.label}
            </dt>
            <dd className="text-[12px] text-mna-white text-right">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Recent({ recent }: { recent: PressDocument[] }) {
  return (
    <div className="border border-mna-white/15 p-5">
      <RailHeader>Recent Additions</RailHeader>
      <ul className="space-y-4">
        {recent.map((d) => (
          <li key={d.id}>
            <Link href={`/press/${d.id}`} className="block group">
              <p className="text-[13px] leading-[1.35] text-mna-white group-hover:text-mna-white/80 mb-1">
                {d.title}
              </p>
              <p className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55">
                {d.id}
                <span className="mx-2 text-mna-white/30">·</span>
                {formatLong(d.publication_date)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/press"
        className="mt-5 inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.22em] text-mna-white hover:text-mna-white/80"
      >
        View All Recent
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function buildHref({
  type,
  page,
}: {
  type: TypeFilter;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (type && type !== "ALL") params.set("type", type);
  if (page && page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/press?${qs}` : "/press";
}
