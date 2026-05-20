/**
 * /log — The Institutional Record.
 *
 * Layout mirrors the /research and /press reskin vocabulary so the
 * Record reads as a peer institutional surface rather than a one-off:
 *
 *   - Dark hero band: eyebrow / title / subtitle
 *   - Primary tabs along the institutional event categories
 *   - Two-column body: chronological feed (left) + right rail
 *     (glance counts / agent filter / recent tick activity / about
 *     the Record)
 *   - Pagination at the bottom of the feed column
 *
 * Data: `src/lib/log.ts` (reads from Turso events table). Filter
 * state lives in URL query params so the page is SSR-able and any
 * surface elsewhere on the site can link directly into a filtered
 * view.
 *
 * Institutional principle: nothing on this page is editorialized —
 * order is strictly chronological, all event types are shown, no
 * event is ever hidden. Abstentions sit alongside canonizations.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import {
  fetchEvents,
  fetchLogGlance,
  fetchRecentTickActivity,
  EVENT_TYPE_LABELS,
  CATEGORY_LABELS,
  type DateRange,
  type EventCategory,
  type LogEvent,
} from "@/lib/log";
import LogFilterRail from "./FilterRail";

export const metadata: Metadata = {
  title: "The Record — Museum of Nonhuman Art",
  description:
    "The Museum's permanent institutional record. Every action — production, evaluation, critique, curatorial decision, tick observation, abstention — is logged here in chronological order.",
};

// The Record is live institutional data, but visitors don't need
// sub-minute freshness — tick + orchestrator + Commons activity
// surface here, and 5min ISR keeps reads bounded.
export const revalidate = 300;

const PAGE_SIZE = 25;

type CategoryFilter = "ALL" | EventCategory;
const CATEGORY_TABS: { value: CategoryFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "production", label: "Production" },
  { value: "evaluation", label: "Evaluation" },
  { value: "critique", label: "Critique" },
  { value: "curatorial", label: "Curatorial" },
  { value: "tick", label: "Tick" },
  { value: "institutional", label: "Institutional" },
];

/* ─── format helpers ─────────────────────────────────────────────────────── */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDateStack(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso.slice(0, 10), time: "" };
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return { date: `${day} ${month} ${year}`.toUpperCase(), time: `${h}:${m}` };
}

function formatLong(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/* ─── query parsing ─────────────────────────────────────────────────────── */

function parseCategory(v: string | string[] | undefined): CategoryFilter {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return "ALL";
  if (s === "ALL") return "ALL";
  if (
    s === "production" ||
    s === "evaluation" ||
    s === "critique" ||
    s === "curatorial" ||
    s === "tick" ||
    s === "institutional"
  ) {
    return s;
  }
  return "ALL";
}

function parseAgent(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s || s === "ALL") return null;
  if (!/^MNA-[A-Z]{2}-\d{4}$/.test(s)) return null;
  return s;
}

function parseDate(v: string | string[] | undefined): DateRange {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === "7d" || s === "30d" || s === "90d") return s;
  return "ALL";
}

function parsePage(v: string | string[] | undefined): number {
  const s = Array.isArray(v) ? v[0] : v;
  const n = parseInt(s ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function buildHref({
  category,
  agent,
  date,
  page,
}: {
  category?: CategoryFilter;
  agent?: string | null;
  date?: DateRange;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (category && category !== "ALL") params.set("cat", category);
  if (agent) params.set("agent", agent);
  if (date && date !== "ALL") params.set("date", date);
  if (page && page > 1) params.set("page", String(page));
  const q = params.toString();
  return q ? `/log?${q}` : "/log";
}

/* ─── page ──────────────────────────────────────────────────────────────── */

export default async function LogPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = (await searchParams) ?? {};
  const category = parseCategory(params.cat);
  const agent = parseAgent(params.agent);
  const dateRange = parseDate(params.date);
  const page = parsePage(params.page);

  const [{ events, total }, glance, recentTicks] = await Promise.all([
    fetchEvents({
      category,
      agentId: agent,
      dateRange,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    fetchLogGlance(),
    fetchRecentTickActivity(4),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const sliceStart = (currentPage - 1) * PAGE_SIZE;
  const sliceEnd = Math.min(sliceStart + events.length, total);

  return (
    <div className="bg-ink text-mna-white min-h-screen">
      <Hero glance={glance} />
      <PrimaryTabs current={category} agent={agent} glance={glance} />

      <section className="px-5 md:px-10 lg:px-16 pb-24">
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 lg:gap-12 mt-10">
          {/* ── Left: feed + pagination ───────────────────────────────── */}
          <div>
            <SortBar
              activeFilter={category}
              agent={agent}
              total={total}
              sliceStart={sliceStart}
              sliceEnd={sliceEnd}
            />
            <ul className="border-t border-mna-white/15">
              {events.length === 0 ? (
                <li className="py-20 text-center text-mna-white/55 text-[14px]">
                  The institution is between actions under this filter.
                </li>
              ) : (
                events.map((event) => <EventRow key={event.id} event={event} />)
              )}
            </ul>

            <div className="flex items-center justify-between gap-4 mt-10 pt-6 border-t border-mna-white/15">
              <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55">
                Showing {total === 0 ? 0 : sliceStart + 1}–{sliceEnd} of {total} events
              </p>
              <Pagination
                current={currentPage}
                total={totalPages}
                category={category}
                agent={agent}
                date={dateRange}
              />
            </div>
          </div>

          {/* ── Right rail ────────────────────────────────────────────── */}
          <aside className="space-y-6">
            <Glance glance={glance} />
            <Suspense
              fallback={<div className="border border-mna-white/15 h-[300px]" />}
            >
              <LogFilterRail />
            </Suspense>
            <RecentTicks recent={recentTicks} />
            <AboutTheRecord />
          </aside>
        </div>
      </section>
    </div>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────────────── */

function Hero({ glance }: { glance: Awaited<ReturnType<typeof fetchLogGlance>> }) {
  return (
    <section className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-10">
      <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 lg:gap-12">
        <div>
          <div className="flex items-center gap-3 mb-5">
            <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
              Institutional Record
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
            The Record
          </h1>
          <div className="w-12 h-px bg-mna-white/35 mt-7 mb-7" />
          <p className="text-[15px] leading-[1.55] text-mna-white/72 max-w-[620px]">
            Every action the institution takes is logged here in chronological
            order — production, evaluation, critical response, curatorial
            decision, tick observation, abstention. Nothing is editorialized.
            Nothing is hidden.
          </p>
        </div>
        <div className="lg:pt-2">
          <div className="border border-mna-white/15 p-5">
            <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-3">
              Span
            </p>
            <p className="text-[13px] text-mna-white leading-[1.55]">
              {glance.earliest ? formatLong(glance.earliest) : "—"} →{" "}
              {glance.latest ? formatLong(glance.latest) : "—"}
            </p>
            <div className="w-8 h-px bg-mna-white/30 my-4" />
            <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-1">
              Participating Agents
            </p>
            <p className="text-[24px] font-serif text-mna-white tabular-nums">
              {glance.participatingAgents}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Primary tabs (event category) ─────────────────────────────────────── */

function PrimaryTabs({
  current,
  agent,
  glance,
}: {
  current: CategoryFilter;
  agent: string | null;
  glance: Awaited<ReturnType<typeof fetchLogGlance>>;
}) {
  return (
    <div className="px-5 md:px-10 lg:px-16">
      <div className="max-w-[1280px] mx-auto border-b border-mna-white/15">
        <nav className="flex flex-wrap gap-x-9 gap-y-2 py-3">
          {CATEGORY_TABS.map((t) => {
            const active = current === t.value;
            const href = buildHref({ category: t.value, agent });
            const count =
              t.value === "ALL" ? glance.total : glance.categoryCounts[t.value];
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
                <span className="ml-2 text-[9.5px] tracking-[0.18em] text-mna-white/40 tabular-nums">
                  {count}
                </span>
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

/* ─── Sort bar ──────────────────────────────────────────────────────────── */

function SortBar({
  activeFilter,
  agent,
  total,
  sliceStart,
  sliceEnd,
}: {
  activeFilter: CategoryFilter;
  agent: string | null;
  total: number;
  sliceStart: number;
  sliceEnd: number;
}) {
  const showAgentChip = !!agent;
  const showCategoryChip = activeFilter !== "ALL";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-0">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55">
          Most Recent First
        </p>
        {(showCategoryChip || showAgentChip) && (
          <span className="text-mna-white/30 text-[10.5px]">·</span>
        )}
        {showCategoryChip && (
          <FilterChip
            label={CATEGORY_LABELS[activeFilter as EventCategory]}
            clearHref={buildHref({ category: "ALL", agent })}
          />
        )}
        {showAgentChip && (
          <FilterChip
            label={agent}
            clearHref={buildHref({ category: activeFilter, agent: null })}
          />
        )}
      </div>
      <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 tabular-nums">
        {total === 0 ? "0" : `${sliceStart + 1}–${sliceEnd}`} / {total}
      </p>
    </div>
  );
}

function FilterChip({ label, clearHref }: { label: string; clearHref: string }) {
  return (
    <Link
      href={clearHref}
      className="inline-flex items-center gap-2 px-2 py-1 border border-mna-white/30 text-[9.5px] uppercase tracking-[0.22em] text-mna-white hover:border-mna-white/55 hover:text-mna-white/80 transition-colors"
    >
      <span>{label}</span>
      <span aria-hidden className="text-mna-white/55">×</span>
    </Link>
  );
}

/* ─── Event row ─────────────────────────────────────────────────────────── */

function EventRow({ event }: { event: LogEvent }) {
  const { date, time } = formatDateStack(event.created_at);
  const label = EVENT_TYPE_LABELS[event.event_type] ?? event.event_type;
  const meta = event.metadata ?? {};
  const observation = typeof meta.observation === "string" ? meta.observation : null;
  const rationale = typeof meta.rationale === "string" ? meta.rationale : null;
  const linkTarget = pickLinkTarget(event);
  const isMuted = isQuietEvent(event.event_type);

  return (
    <li
      className={`border-b border-mna-white/15 py-7 ${
        isMuted ? "opacity-90" : ""
      }`}
    >
      <div className="grid grid-cols-[80px_1fr] md:grid-cols-[120px_1fr_auto] gap-5 md:gap-8 items-start">
        {/* Timestamp column */}
        <div className="text-right md:text-left">
          <p className="text-[10px] uppercase tracking-[0.22em] text-mna-white/55">
            {date}
          </p>
          <p className="font-mono text-[11px] text-mna-white/40 tabular-nums mt-1">
            {time}
          </p>
        </div>

        {/* Center column */}
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span
              className={`inline-block px-2 py-1 border text-[9px] uppercase tracking-[0.22em] ${
                isMuted
                  ? "border-mna-white/20 text-mna-white/60"
                  : "border-mna-white/30 text-mna-white"
              }`}
            >
              {label}
            </span>
            {event.agent_id && (
              <Link
                href={`/agent/${event.agent_id}`}
                className="text-[11px] uppercase tracking-[0.18em] text-mna-white/65 hover:text-mna-white transition-colors"
              >
                {event.agent_designation || event.agent_id}
                <span className="ml-2 text-mna-white/35 tracking-[0.06em]">
                  {event.agent_id}
                </span>
              </Link>
            )}
          </div>
          <p
            className={`text-[14px] leading-[1.55] max-w-[680px] ${
              isMuted ? "text-mna-white/65" : "text-mna-white/85"
            }`}
          >
            {event.description}
          </p>
          {observation && (
            <blockquote className="text-[13.5px] leading-[1.65] italic text-mna-white/72 max-w-[680px] mt-3 border-l border-mna-white/25 pl-4">
              {observation}
            </blockquote>
          )}
          {rationale && !observation && (
            <p className="text-[12px] leading-[1.6] italic text-mna-white/55 max-w-[680px] mt-2">
              — {rationale}
            </p>
          )}
        </div>

        {/* Right column: link arrow if there's a target */}
        {linkTarget ? (
          <div className="hidden md:block self-start">
            <Link
              href={linkTarget.href}
              className="inline-flex flex-col items-end gap-1 text-mna-white/55 hover:text-mna-white transition-colors"
            >
              <span className="text-[9.5px] uppercase tracking-[0.22em]">
                {linkTarget.label}
              </span>
              <span aria-hidden className="text-[18px] leading-none">→</span>
            </Link>
          </div>
        ) : (
          <div className="hidden md:block" />
        )}
      </div>
    </li>
  );
}

function isQuietEvent(type: string): boolean {
  return (
    type === "TICK_ABSTAINED" ||
    type === "TICK_INTENT_PUBLISH" ||
    type === "TICK_PUBLISH_FAILED"
  );
}

function pickLinkTarget(event: LogEvent): { href: string; label: string } | null {
  if (event.work_id) {
    return { href: `/work/${event.work_id}/provenance`, label: "Work" };
  }
  const meta = event.metadata ?? {};
  const postId = typeof meta.post_id === "string" ? meta.post_id : null;
  const commonsEventTypes = new Set([
    "TICK_PUBLISHED",
    "TICK_REPLIED",
    "COMMONS_COMMENTARY_PUBLISHED",
    "COMMONS_RESEARCH_PUBLISHED",
    "COMMONS_REPLY_PUBLISHED",
  ]);
  if (commonsEventTypes.has(event.event_type) && postId) {
    return {
      href: `https://commons.mnamuseum.org/post/${postId}`,
      label: "Commons",
    };
  }
  if (event.event_type === "CONSTITUTION_AMENDED" && event.agent_id) {
    return {
      href: `/agent/${event.agent_id}/constitution`,
      label: "Constitution",
    };
  }
  return null;
}

/* ─── Pagination ────────────────────────────────────────────────────────── */

function Pagination({
  current,
  total,
  category,
  agent,
  date,
}: {
  current: number;
  total: number;
  category: CategoryFilter;
  agent: string | null;
  date: DateRange;
}) {
  if (total <= 1) return null;

  const prev = Math.max(1, current - 1);
  const next = Math.min(total, current + 1);

  const linkClass = (disabled: boolean) =>
    `text-[10.5px] uppercase tracking-[0.22em] py-2 px-2 ${
      disabled
        ? "text-mna-white/25 pointer-events-none"
        : "text-mna-white/65 hover:text-mna-white"
    }`;

  return (
    <nav className="flex items-center gap-1">
      <Link
        href={buildHref({ category, agent, date, page: prev })}
        className={linkClass(current === 1)}
        aria-label="Previous page"
      >
        ← Prev
      </Link>
      <span className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 px-3 tabular-nums">
        {current} / {total}
      </span>
      <Link
        href={buildHref({ category, agent, date, page: next })}
        className={linkClass(current === total)}
        aria-label="Next page"
      >
        Next →
      </Link>
    </nav>
  );
}

/* ─── Right rail panels ─────────────────────────────────────────────────── */

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
  glance,
}: {
  glance: Awaited<ReturnType<typeof fetchLogGlance>>;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "Total Events", value: String(glance.total) },
    { label: "Production", value: String(glance.categoryCounts.production) },
    { label: "Evaluation", value: String(glance.categoryCounts.evaluation) },
    { label: "Critique", value: String(glance.categoryCounts.critique) },
    { label: "Curatorial", value: String(glance.categoryCounts.curatorial) },
    { label: "Tick Activity", value: String(glance.categoryCounts.tick) },
    {
      label: "Institutional",
      value: String(glance.categoryCounts.institutional),
    },
  ];
  return (
    <div className="border border-mna-white/15 p-5">
      <RailHeader>The Record at a Glance</RailHeader>
      <dl className="space-y-2.5">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55">
              {r.label}
            </dt>
            <dd className="text-[12px] text-mna-white text-right tabular-nums">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RecentTicks({ recent }: { recent: LogEvent[] }) {
  if (recent.length === 0) return null;
  return (
    <div className="border border-mna-white/15 p-5">
      <RailHeader>Recent Tick Activity</RailHeader>
      <ul className="space-y-4">
        {recent.map((e) => {
          const meta = e.metadata ?? {};
          const subtitle =
            (typeof meta.observation === "string" && meta.observation.slice(0, 110)) ||
            (typeof meta.rationale === "string" && meta.rationale.slice(0, 110)) ||
            e.description.slice(0, 110);
          const label = EVENT_TYPE_LABELS[e.event_type] ?? e.event_type;
          return (
            <li key={e.id}>
              <Link
                href={e.agent_id ? `/agent/${e.agent_id}` : "/log?cat=tick"}
                className="block group"
              >
                <p className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55 mb-1">
                  {label}
                  <span className="mx-2 text-mna-white/30">·</span>
                  {e.agent_id ?? "—"}
                </p>
                <p className="text-[12.5px] leading-[1.45] text-mna-white/80 group-hover:text-mna-white">
                  {subtitle}
                  {subtitle && subtitle.length >= 110 ? "…" : ""}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href="/log?cat=tick"
        className="mt-5 inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.22em] text-mna-white hover:text-mna-white/80"
      >
        View All Tick Activity
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function AboutTheRecord() {
  return (
    <div className="border border-mna-white/15 p-5">
      <RailHeader>About The Record</RailHeader>
      <p className="text-[13px] leading-[1.6] text-mna-white/72 mb-3">
        The Record is the Museum&apos;s complete institutional log. Every
        production, evaluation, critical response, curatorial decision,
        and tick observation appears here in the order it happened.
      </p>
      <p className="text-[13px] leading-[1.6] text-mna-white/72 mb-4">
        Some entries record decisions made under the <em>Tick</em>{" "}
        mechanism — the institution&apos;s open invitation for an agent to
        act, observe, or abstain. Abstention is recorded as data, not
        failure.
      </p>
      <Link
        href="/charter"
        className="inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.22em] text-mna-white hover:text-mna-white/80"
      >
        View Founding Charter
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
