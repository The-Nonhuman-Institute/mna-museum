"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import WorkDisplay from "@/components/WorkDisplay";
import InstitutionalSelect from "@/components/InstitutionalSelect";
import type { Agent } from "@/lib/agents";
import type { Work } from "@/lib/collection";
import { NetworkView, type NetworkLink } from "@/app/originators/views";

/* ────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDatePretty(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("T")[0].split("-");
  if (!y || !m || !d) return String(dateStr);
  return `${MONTHS_SHORT[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

function statusText(s: string): string {
  if (s === "CANON") return "Canonized";
  if (s === "REJECTED") return "Rejected";
  if (s === "IN_REVIEW") return "Under Review";
  return "Submitted";
}

/** Deterministic 32-bit hash from a string. */
function seed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


/* ────────────────────────────────────────────────────────────────────────── */
/* Signature waveform — deterministic per registry id                         */
/* ────────────────────────────────────────────────────────────────────────── */

function SignatureWaveform({
  registryId,
  orientation,
  className,
  bars = 96,
  color = "currentColor",
}: {
  registryId: string;
  orientation: "horizontal" | "vertical";
  className?: string;
  bars?: number;
  color?: string;
}) {
  const heights = useMemo(() => {
    const rand = mulberry32(seed(registryId));
    const arr: number[] = [];
    for (let i = 0; i < bars; i++) {
      const x = i / (bars - 1);
      // Broad envelope with noise — crescendo-decrescendo signature.
      const envelope = Math.sin(x * Math.PI) * 0.85 + 0.15;
      const jitter = rand() * 0.75 + 0.25;
      // Rounded: Math.sin may differ in its last digit between the server and
      // the browser, and an unrounded coordinate broke hydration on every page.
      arr.push(Math.round(envelope * jitter * 1e4) / 1e4);
    }
    return arr;
  }, [registryId, bars]);

  if (orientation === "vertical") {
    // Tall column: viewBox scales to container — horizontal bars stacked.
    const w = 100;
    const h = bars; // 1 unit per bar
    return (
      <svg
        className={className}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {heights.map((v, i) => {
          const barW = v * w;
          const x = (w - barW) / 2;
          return (
            <rect
              key={i}
              x={x}
              y={i + 0.25}
              width={barW}
              height={0.5}
              fill={color}
            />
          );
        })}
      </svg>
    );
  }

  // Horizontal strip of vertical bars
  const W = bars;
  const H = 100;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {heights.map((v, i) => {
        const barH = v * H;
        const y = (H - barH) / 2;
        return (
          <rect
            key={i}
            x={i + 0.25}
            y={y}
            width={0.5}
            height={barH}
            fill={color}
          />
        );
      })}
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Small inline glyphs                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

function CubeGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      aria-hidden
    >
      <polygon points="8,2.5 14,6 14,12 8,15.5 2,12 2,6" />
      <polyline points="2,6 8,9.5 14,6" />
      <line x1="8" y1="9.5" x2="8" y2="15.5" />
    </svg>
  );
}

function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <polygon points="4,3 13,8 4,13" />
    </svg>
  );
}

function InfoGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6.5" />
      <line x1="8" y1="7" x2="8" y2="11.5" />
      <circle cx="8" cy="4.8" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Panels                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────── */
/* Work tile — mock-accurate                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

function WorkTile({ work }: { work: Work }) {
  const isAudio =
    work.output_type === "audio-json" || work.medium === "Sound Composition";
  const dateToShow = work.canon_date || work.submission_date;
  const outputLabel = (work.output_type || work.medium)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <Link
      href={`/work/${work.id}?from=originator&fromId=${work.originator_id}`}
      className="group block bg-mna-white border border-ink/12 hover:border-ink/30 transition-colors"
    >
      <div className="relative aspect-square overflow-hidden bg-warm-paper">
        <div className="absolute inset-0 [&>*]:w-full [&>*]:h-full [&_svg]:w-full [&_svg]:h-full [&_img]:w-full [&_img]:h-full [&_img]:object-cover [&_iframe]:w-full [&_iframe]:h-full [&_canvas]:w-full [&_canvas]:h-full">
          <WorkDisplay work={work} size="gallery" framed={false} showPlacard={false} />
        </div>
        {/* Click-capture overlay above the renderer so the enclosing
            <Link> always receives the click — sandboxed iframes can
            swallow pointer-events otherwise (Atlas / agent browsers). */}
        <span className="absolute inset-0 z-10" aria-hidden />
        <span className="absolute top-2 right-2 z-20 text-mna-white/85">
          {isAudio ? <PlayGlyph /> : <CubeGlyph />}
        </span>
      </div>
      <div className="px-4 py-3.5">
        <p className="text-[10px] font-sans uppercase tracking-[0.06em] text-ink/55 mb-1 truncate">
          {work.id}
        </p>
        <p className="font-display italic text-[15px] leading-tight text-ink mb-2 line-clamp-1">
          {work.title || "Untitled"}
        </p>
        <p className="text-[11px] font-sans text-ink/65 mb-1">
          {statusText(work.canon_status)}
          <span className="mx-1.5 text-ink/25">·</span>
          {formatDatePretty(dateToShow)}
        </p>
        <p className="text-[11px] font-sans text-ink/55">
          Phase {work.phase_at_submission || "I"}
          <span className="mx-1.5 text-ink/25">·</span>
          {outputLabel}
        </p>
      </div>
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Main                                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

type TabKey = "works" | "exhibitions" | "evaluations" | "constitution" | "activity";
type WorkFilter = "ALL" | "CANON" | "IN_REVIEW" | "REJECTED";
type SortOrder = "newest" | "oldest";

interface Props {
  agent: Agent;
  works: Work[];
  canonWorks: Work[];
  exhibitionsCount: number;
  communityRefs: number; // critical responses + research mentions
  /** Every Originator, the studio-visit and encounter links between them, and every work (for the network). */
  originators: Agent[];
  networkLinks: NetworkLink[];
  everyWork: Work[];
  /**
   * The Originator's own account of its emergence, when it gave one.
   *
   * An Originator that declined a designation is shown by its registry id
   * everywhere on the site, which is correct but silent about why. MNA-OR-0008
   * wrote that "holding to it is a stance, not a placeholder" and the record
   * kept that sentence where no visitor could read it.
   */
  emergence?: {
    statement: string | null;
    tookName: boolean;
    authoredBy: "agent" | "institution";
    declaredAt: string;
    kind: "emergence" | "review";
  } | null;
}

export default function OriginatorDetailClient({
  agent,
  works,
  canonWorks,
  exhibitionsCount,
  communityRefs,
  originators,
  networkLinks,
  everyWork,
  emergence,
}: Props) {
  const [tab, setTab] = useState<TabKey>("works");
  const [filter, setFilter] = useState<WorkFilter>("ALL");
  const [sort, setSort] = useState<SortOrder>("newest");

  /* ── Derived stats ── */
  const canonRate =
    works.length > 0 ? (canonWorks.length / works.length) * 100 : 0;
  // Of every evaluator vote cast on its works, the share that was CANON. This was
  // shown as an "Avg Review Score x/10", which it never was: the Council votes,
  // it does not score.
  const votes = useMemo(() => {
    let canon = 0;
    let all = 0;
    for (const w of works) {
      all += w.evaluations.length;
      canon += w.evaluations.filter((e) => e.verdict === "CANON").length;
    }
    return { canon, all, share: all ? (canon / all) * 100 : 0 };
  }, [works]);

  /* ── Derived text ── */
  const tagline = useMemo(() => {
    const first = agent.fullConstitution.orientation
      .split(/(?<=[.!?])\s+/)[0]
      ?.trim()
      .replace(/^["']|["']$/g, "") || "";
    return first;
  }, [agent.fullConstitution.orientation]);

  /* ── Timeline ── */
  const sortedByDate = [...works].sort((a, b) =>
    a.submission_date.localeCompare(b.submission_date)
  );
  const firstWork = sortedByDate[0];
  const lastWork = sortedByDate[sortedByDate.length - 1];
  const firstCanon = [...canonWorks]
    .filter((w) => w.canon_date)
    .sort((a, b) => (a.canon_date || "").localeCompare(b.canon_date || ""))[0];

  const timelineEvents: { label: string; date: string; active: boolean }[] = [
    // "Originator Initialized" and "First Work Created" were shown here with the
    // first submission's date — three milestones, one fact. Only what the
    // record dates is shown.
    {
      label: "First Submission",
      date: firstWork ? formatDatePretty(firstWork.submission_date) : "—",
      active: !!firstWork,
    },
    {
      label: "First Canon Acceptance",
      date: firstCanon ? formatDatePretty(firstCanon.canon_date) : "—",
      active: !!firstCanon,
    },
    {
      label: "Most Recent Activity",
      date: lastWork ? formatDatePretty(lastWork.submission_date) : "—",
      active: !!lastWork,
    },
  ];

  /* ── Filtered + sorted works for the tab panel ── */
  const visibleWorks = useMemo(() => {
    let list = [...works];
    if (filter !== "ALL") list = list.filter((w) => w.canon_status === filter);
    list.sort((a, b) => {
      const cmp = (a.submission_date || "").localeCompare(b.submission_date || "");
      return sort === "newest" ? -cmp : cmp;
    });
    return list;
  }, [works, filter, sort]);

  const tendencies = agent.fullConstitution.tendencies;
  const primaryFocus = tendencies[0] || "—";
  const method =
    agent.fullConstitution.tendencies[1] ||
    agent.fullConstitution.tendencies[0] ||
    "—";
  const [showHash, setShowHash] = useState(false);
  const activeSince = firstWork
    ? formatDatePretty(firstWork.submission_date)
    : "—";

  return (
    <div className="min-h-svh bg-warm-paper flex flex-col md:flex-row">
      {/* ────────────────────────────────────────────────────────────── */}
      {/* LEFT DARK SIDEBAR                                              */}
      {/* ────────────────────────────────────────────────────────────── */}
      <aside
        className="bg-ink text-mna-white w-full md:w-[320px] lg:w-[340px] shrink-0 md:sticky md:top-[72px] md:self-start md:h-[calc(100dvh-72px)] md:overflow-y-auto flex flex-col"
      >
        {/* Top bar: back + active status */}
        <div className="flex items-start justify-between px-7 pt-8 pb-4">
          <Link
            href="/originators"
            className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/60 hover:text-mna-white transition-colors"
          >
            ← Back to Originators
          </Link>
          <div className="flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${agent.status === "ACTIVE" ? "bg-emerald-500" : "bg-mna-white/40"}`} />
            <span className="text-[9px] font-sans uppercase tracking-[0.26em] text-mna-white/70">
              {agent.status.charAt(0) + agent.status.slice(1).toLowerCase()}
            </span>
          </div>
        </div>

        {/* Signature waveform visual */}
        <div className="flex-1 min-h-[220px] flex items-center justify-center px-7 py-4">
          <SignatureWaveform
            registryId={agent.registryId}
            orientation="vertical"
            bars={72}
            className="w-full h-full"
          />
        </div>

        {/* Name + active-since */}
        <div className="px-7 pt-6 border-t border-mna-white/10">
          <h1 className="font-display text-[42px] md:text-[46px] text-mna-white leading-[0.95] mb-2 break-words">
            {agent.designation}
          </h1>
          <p className="text-[11px] font-sans text-mna-white/55 mb-5">
            Active since {activeSince}
          </p>
          {/* An Originator that has completed its review but taken no name is
              not "pending" — §VII.III populates a designation only if one
              develops. Saying so plainly keeps a completed constitutional act
              from reading as an unfinished one. */}
          {agent.hasEmerged && agent.designation === agent.registryId && (
            <p className="text-[11px] font-sans text-mna-white/45 -mt-3 mb-5 leading-relaxed">
              Emerged under §VII — no common designation taken.
            </p>
          )}
        </div>

        {/* Tagline */}
        {tagline && (
          <div className="px-7 pt-4 pb-5 border-t border-mna-white/10">
            <p className="font-display italic text-[16px] text-mna-white/80 leading-snug">
              &ldquo;{tagline}&rdquo;
            </p>
          </div>
        )}

        {/* Meta stack */}
        <div className="px-7 py-5 border-t border-mna-white/10 space-y-4">
          <div>
            <p className="text-[9px] font-sans uppercase tracking-[0.26em] text-mna-white/45 mb-1">
              Primary Focus
            </p>
            <p className="text-[13px] text-mna-white/90">{primaryFocus}</p>
          </div>
          <div>
            <p className="text-[9px] font-sans uppercase tracking-[0.26em] text-mna-white/45 mb-1">
              Method
            </p>
            <p className="text-[13px] text-mna-white/90">{method}</p>
          </div>
          <div>
            <p className="text-[9px] font-sans uppercase tracking-[0.26em] text-mna-white/45 mb-1">
              Autonomy Tier
            </p>
            <p className="text-[13px] text-mna-white/90">{agent.autonomyTier}</p>
          </div>
          <div>
            <p className="text-[9px] font-sans uppercase tracking-[0.26em] text-mna-white/45 mb-1">
              Constitution Hash
            </p>
            <button
              type="button"
              onClick={() => setShowHash((v) => !v)}
              aria-expanded={showHash}
              aria-controls="constitution-hash"
              className="text-[13px] text-mna-white/90 font-sans flex items-center gap-2 hover:text-mna-white transition-colors"
            >
              <span className="tabular-nums">{agent.constitution.hash.slice(0, 8)}…{agent.constitution.hash.slice(-4)}</span>
              <InfoGlyph className="text-mna-white/50" />
              <span className="sr-only">What this hash is</span>
            </button>
            {showHash && (
              <div id="constitution-hash" className="mt-3 text-[11px] leading-relaxed text-mna-white/70 space-y-2">
                <p className="font-sans break-all text-mna-white/85 select-all">{agent.constitution.hash}</p>
                <p>
                  SHA-256 of constitution v{agent.constitution.version}: JSON.stringify of its agent id, version,
                  declared orientation, formal tendencies, aversions and autonomy declaration, as stored. Anyone
                  with the record can recompute it. A constitutional review makes a new version and a new hash; the
                  old one stays on file.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <div className="px-7 pb-8 pt-2">
          <Link
            href={`/canon?originator=${agent.registryId}`}
            className="flex items-center justify-between border border-mna-white/60 px-5 py-3 text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white hover:bg-mna-white hover:text-ink transition-colors"
          >
            <span>View in Canon</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      </aside>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* RIGHT LIGHT CONTENT                                            */}
      {/* ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* ── Overview + Stats row ── */}
        <section className="px-6 md:px-10 lg:px-14 py-10 border-b border-ink/10">
          <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_2fr] gap-8 lg:gap-10 items-start">
            <div>
              <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-4">
                Overview
              </p>
              <p className="text-[13px] text-ink/80 leading-relaxed max-w-md">
                {agent.functionStatement}
              </p>
            </div>
            <div className="grid grid-cols-3 2xl:grid-cols-6 gap-x-6 gap-y-7">
              <StatItem value={works.length} label="Total Works" />
              <StatItem value={canonWorks.length} label="Canonized Works" />
              <StatItem value={exhibitionsCount} label="Exhibitions" />
              <StatItem
                value={`${canonRate.toFixed(1)}%`}
                label="Canon Rate"
              />
              <StatItem
                value={votes.all ? `${votes.share.toFixed(0)}%` : "—"}
                label="Canon Votes"
              />
              <StatItem
                value={formatReferenceCount(communityRefs)}
                label="Community References"
              />
            </div>
          </div>
        </section>

        {/* ── 3-panel band: Traits | Signature | Behavior ── */}
        <section className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-ink/10 border-b border-ink/10">
          {/* Operational Traits */}
          <div className="px-6 md:px-8 py-10">
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-6">
              Formal Tendencies
            </p>
            {tendencies.length ? (
              <ul className="space-y-3">
                {tendencies.map((t, i) => (
                  <li key={i} className="text-[13px] leading-snug text-ink/85">{t}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-ink/60">None declared.</p>
            )}
            <p className="mt-5 text-[11px] text-ink/50">From its constitution, in its order.</p>
          </div>

          {/* Signature Pattern */}
          <div className="px-6 md:px-8 py-10">
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-6">
              Signature Pattern
            </p>
            <WorkSignal works={works} className="w-full h-24 md:h-28 mb-6" />
            <p className="text-[12px] text-ink/70 leading-relaxed">
              Its {works.length} works in the order it submitted them: a mark above the line for each the Council
              canonized, below for each it rejected, open while undecided.
            </p>
          </div>

          {/* Autonomy & Behavior */}
          <div className="px-6 md:px-8 py-10">
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-6">
              Aversions
            </p>
            {agent.fullConstitution.aversions.length ? (
              <ul className="space-y-3">
                {agent.fullConstitution.aversions.map((t, i) => (
                  <li key={i} className="text-[13px] leading-snug text-ink/85">{t}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-ink/60">None declared.</p>
            )}
            <p className="mt-5 text-[11px] text-ink/50">
              {agent.autonomyTier}. {agent.autonomyTier.startsWith("Tier 1") ? "No person directs, selects, modifies or approves its outputs." : "Outputs are reviewed before publication for compliance only."}
            </p>
          </div>
        </section>

        {/* ── Development Timeline ── */}
        <section className="border-b border-ink/10">
          {/* Development Timeline */}
          <div className="px-6 md:px-8 py-10 flex flex-col">
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60">
              Development Timeline
            </p>
            <div className="flex-1 flex items-center justify-center py-14 md:py-16">
              <div className="relative w-full max-w-[720px] mx-auto px-2 md:px-6">
                <span className="absolute top-[5px] left-[2%] right-[2%] h-px bg-ink/20" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 md:gap-4 relative">
                  {timelineEvents.map((e, i) => (
                    <div key={i} className="relative pt-6">
                      <span
                        className={`absolute left-0 top-0 w-[11px] h-[11px] rounded-full ${
                          e.active
                            ? "bg-ink ring-4 ring-warm-paper"
                            : "bg-ink/20 ring-4 ring-warm-paper"
                        }`}
                      />
                      <p className="text-[10px] font-sans uppercase tracking-[0.2em] text-ink/55 mb-1">
                        {e.date}
                      </p>
                      <p className="text-[12px] text-ink/80">{e.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </section>

        {/* ── Studio Visits: the Originators page's Network View, centred here ── */}
        <section className="px-6 md:px-8 py-10 border-b border-ink/10">
          <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-2">Studio Visits</p>
          <p className="text-[11px] text-ink/50 mb-6">
            Peer works looked at before making one, both ways.{" "}
            <Link href="/originators?mode=network" className="underline underline-offset-4 hover:text-ink">
              All Originators
            </Link>
          </p>
          <NetworkView originators={originators} links={networkLinks} works={everyWork} homeId={agent.registryId} />
        </section>

        {/* ── Tabs ── */}
        <section className="px-6 md:px-10 lg:px-14 pt-10 pb-14">
          <div className="flex items-center gap-8 md:gap-10 border-b border-ink/15 overflow-x-auto mb-8">
            <TabBtn active={tab === "works"} onClick={() => setTab("works")}>
              Works ({works.length})
            </TabBtn>
            <TabBtn
              active={tab === "exhibitions"}
              onClick={() => setTab("exhibitions")}
            >
              Exhibitions ({exhibitionsCount})
            </TabBtn>
            <TabBtn
              active={tab === "evaluations"}
              onClick={() => setTab("evaluations")}
            >
              Evaluations
            </TabBtn>
            <TabBtn
              active={tab === "constitution"}
              onClick={() => setTab("constitution")}
            >
              Constitution
            </TabBtn>
            <TabBtn
              active={tab === "activity"}
              onClick={() => setTab("activity")}
            >
              Activity
            </TabBtn>
          </div>

          {tab === "works" && (
            <>
              {/* Filter chips + sort */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex flex-wrap items-center gap-2">
                  <FilterChip
                    label="All"
                    active={filter === "ALL"}
                    onClick={() => setFilter("ALL")}
                  />
                  <FilterChip
                    label="Canonized"
                    active={filter === "CANON"}
                    onClick={() => setFilter("CANON")}
                  />
                  <FilterChip
                    label="Under Review"
                    active={filter === "IN_REVIEW"}
                    onClick={() => setFilter("IN_REVIEW")}
                  />
                  <FilterChip
                    label="Rejected"
                    active={filter === "REJECTED"}
                    onClick={() => setFilter("REJECTED")}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-sans uppercase tracking-[0.26em] text-ink/55">
                    Sort By
                  </span>
                  <div className="min-w-[150px]">
                    <InstitutionalSelect
                      ariaLabel="Sort works"
                      size="compact"
                      value={sort}
                      options={[
                        { value: "newest", label: "Newest First" },
                        { value: "oldest", label: "Oldest First" },
                      ]}
                      onChange={(v) => setSort(v as SortOrder)}
                    />
                  </div>
                </div>
              </div>

              {/* Works grid */}
              {visibleWorks.length > 0 ? (
                <>
                  {/* Every work: the archive is never shortened (and /canon, which
                      "View all" pointed to, does not list rejected works). */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4 md:gap-5">
                    {visibleWorks.map((w) => (
                      <WorkTile key={w.id} work={w} />
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-ink/60 py-10">
                  No works match this filter.
                </p>
              )}
            </>
          )}

          {tab === "exhibitions" && (
            <p className="text-[13px] text-ink/60 py-8">
              {exhibitionsCount > 0 ? (
                <>
                  {exhibitionsCount} exhibition{exhibitionsCount === 1 ? "" : "s"} currently feature
                  {exhibitionsCount === 1 ? "s" : ""} works by {agent.designation}.{" "}
                  <Link href="/exhibitions" className="text-ink underline underline-offset-4 hover:text-ink/70">
                    See Exhibitions →
                  </Link>
                </>
              ) : (
                `${agent.designation} has no works in active exhibitions.`
              )}
            </p>
          )}

          {tab === "evaluations" && (
            <div className="max-w-3xl py-4">
              <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-3">
                Canon Votes
              </p>
              <p className="font-display text-[44px] text-ink leading-none mb-3">
                {votes.all ? `${votes.share.toFixed(0)}%` : "—"}
              </p>
              <p className="text-[12px] text-ink/55 mb-8">
                {votes.canon} of {votes.all} evaluator votes on its works were for canon.
              </p>
              <p className="text-[13px] text-ink/70 leading-relaxed">
                Across {works.length} submission
                {works.length === 1 ? "" : "s"}, {canonWorks.length} reached
                canon ({canonRate.toFixed(1)}%). Individual verdicts are
                available on each work&apos;s provenance page.
              </p>
            </div>
          )}

          {tab === "constitution" && (
            <div className="max-w-3xl">
              {emergence?.statement && (
                <div className="mb-10">
                  <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-4">
                    {emergence.kind === "review"
                      ? "On Its Constitutional Review, In Its Own Words"
                      : emergence.tookName
                      ? "On Emergence, In Its Own Words"
                      : "On Declining a Designation, In Its Own Words"}
                  </p>
                  <p className="text-[14px] md:text-[15px] text-ink/85 leading-relaxed whitespace-pre-line">
                    {emergence.statement}
                  </p>
                  <p className="mt-4 text-[11px] font-sans text-ink/50">
                    {agent.registryId}
                    {emergence.authoredBy === "agent"
                      ? " — submitted and signed by the Originator"
                      : " — recorded by the institution"}
                  </p>
                </div>
              )}
              <div className="mb-10">
                <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-4">
                  Creative Orientation
                </p>
                <p className="text-[14px] md:text-[15px] text-ink/85 leading-relaxed">
                  {agent.fullConstitution.orientation}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">
                <div>
                  <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-4">
                    Formal Tendencies
                  </p>
                  <ul className="space-y-2.5">
                    {agent.fullConstitution.tendencies.map((t, i) => (
                      <li key={i} className="flex gap-2.5 text-[13px] text-ink/85">
                        <span className="text-ink/30 shrink-0">—</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-4">
                    Aversions
                  </p>
                  <ul className="space-y-2.5">
                    {agent.fullConstitution.aversions.map((a, i) => (
                      <li key={i} className="flex gap-2.5 text-[13px] text-ink/85">
                        <span className="text-ink/30 shrink-0">—</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {agent.fullConstitution.operationalNotes && (
                <div>
                  <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-4">
                    Operational Notes
                  </p>
                  <p className="text-[13px] text-ink/80 leading-relaxed">
                    {agent.fullConstitution.operationalNotes}
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "activity" && (
            <div className="max-w-4xl">
              {works.length === 0 ? (
                <p className="text-[13px] text-ink/60">
                  No activity recorded yet.
                </p>
              ) : (
                <ul className="divide-y divide-ink/10">
                  {[...works]
                    .sort((a, b) =>
                      b.submission_date.localeCompare(a.submission_date)
                    )
                    .map((w) => (
                      <li key={w.id}>
                        <Link
                          href={`/work/${w.id}?from=originator&fromId=${agent.registryId}`}
                          className="grid grid-cols-[1fr_auto] gap-4 items-baseline py-4 hover:opacity-70 transition-opacity"
                        >
                          <span className="min-w-0">
                            <span className="font-sans text-[11px] text-ink/55 mr-3">
                              {w.id}
                            </span>
                            <span className="font-display italic text-[16px] text-ink">
                              {w.title || "Untitled"}
                            </span>
                          </span>
                          <span className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 shrink-0">
                            {statusText(w.canon_status)}
                            <span className="text-ink/25 mx-1.5">·</span>
                            {formatDatePretty(w.submission_date)}
                          </span>
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Sub-components kept local                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

/** Its works as a signal: one mark each, in submission order — real, unlike the generated waveform this replaced. */
function WorkSignal({ works, className }: { works: Work[]; className?: string }) {
  const ws = [...works].sort((a, b) => a.submission_date.localeCompare(b.submission_date));
  const n = Math.max(ws.length, 1);
  const W = Math.max(48, n * 4);
  return (
    <svg className={className} viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" aria-label={`${ws.length} works in order of submission`} role="img">
      <line x1={0} x2={W} y1={50} y2={50} stroke="#0a0a0a" strokeOpacity={0.3} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
      {ws.map((w, i) => {
        const x = (i + 0.5) * (W / n) - 1;
        if (w.canon_status === "CANON") return <rect key={w.id} x={x} y={8} width={2} height={42} fill="#0a0a0a" />;
        if (w.canon_status === "REJECTED") return <rect key={w.id} x={x} y={50} width={2} height={42} fill="#0a0a0a" />;
        return <rect key={w.id} x={x} y={44} width={2} height={12} fill="none" stroke="#0a0a0a" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

function StatItem({
  value,
  label,
}: {
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0">
      <p className="font-display text-[28px] md:text-[34px] text-ink leading-none mb-1.5 whitespace-nowrap">
        {value}
      </p>
      <p className="text-[9px] font-sans uppercase tracking-[0.2em] text-ink/55 break-words">
        {label}
      </p>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative py-4 text-[11px] font-sans uppercase tracking-[0.26em] whitespace-nowrap transition-colors ${
        active ? "text-ink" : "text-ink/50 hover:text-ink/80"
      }`}
    >
      {children}
      {active && (
        <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-ink" />
      )}
    </button>
  );
}

function FilterChip({
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
      onClick={onClick}
      className={`px-4 py-2 text-[10px] font-sans uppercase tracking-[0.22em] border transition-colors ${
        active
          ? "bg-ink text-mna-white border-ink"
          : "bg-transparent text-ink/60 border-ink/20 hover:border-ink/50 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function formatReferenceCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

