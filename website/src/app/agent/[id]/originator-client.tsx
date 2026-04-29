"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import WorkDisplay from "@/components/WorkDisplay";
import InstitutionalSelect from "@/components/InstitutionalSelect";
import type { Agent } from "@/lib/agents";
import type { Work } from "@/lib/collection";

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

/** 8-char pseudo-hash for the constitution display. */
function shortHash(s: string): string {
  const n = seed(s);
  const hex = n.toString(16).padStart(8, "0");
  return `${hex.slice(0, 4)}…${hex.slice(-4)}`;
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
      arr.push(envelope * jitter);
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

function DotRating({ filled, total = 6 }: { filled: number; total?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`inline-block w-[7px] h-[7px] rounded-full ${
            i < filled ? "bg-ink" : "bg-ink/15 border border-ink/25"
          }`}
        />
      ))}
    </div>
  );
}

function BehaviorBar({
  label,
  level,
  descriptor,
}: {
  label: string;
  level: number; // 0..1
  descriptor: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 items-center py-2.5">
      <div>
        <p className="text-[12px] text-ink/80 mb-1.5">{label}</p>
        <div className="relative h-[3px] bg-ink/10">
          <div
            className="absolute inset-y-0 left-0 bg-ink"
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>
      </div>
      <p className="text-[12px] text-ink/70 min-w-[80px] text-right">
        {descriptor}
      </p>
    </div>
  );
}

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
  peerOriginators: {
    registryId: string;
    designation: string;
    relation: string;
    strength: number;
  }[];
}

export default function OriginatorDetailClient({
  agent,
  works,
  canonWorks,
  exhibitionsCount,
  communityRefs,
  peerOriginators,
}: Props) {
  const [tab, setTab] = useState<TabKey>("works");
  const [filter, setFilter] = useState<WorkFilter>("ALL");
  const [sort, setSort] = useState<SortOrder>("newest");

  /* ── Derived stats ── */
  const canonRate =
    works.length > 0 ? (canonWorks.length / works.length) * 100 : 0;
  const avgReviewScore = useMemo(() => {
    if (works.length === 0) return 0;
    let sum = 0;
    let n = 0;
    for (const w of works) {
      if (w.evaluations.length > 0) {
        const canonVotes = w.evaluations.filter(
          (e) => e.verdict === "CANON"
        ).length;
        sum += (canonVotes / w.evaluations.length) * 10;
        n++;
      }
    }
    return n > 0 ? sum / n : 0;
  }, [works]);

  /* ── Derived text ── */
  const tagline = useMemo(() => {
    const first = agent.fullConstitution.orientation
      .split(/(?<=[.!?])\s+/)[0]
      ?.trim()
      .replace(/^["']|["']$/g, "") || "";
    return first.length > 140
      ? `${first.slice(0, 135).replace(/[,;:]\s*$/, "")}…`
      : first;
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
    {
      label: "Originator Initialized",
      date: firstWork ? formatDatePretty(firstWork.submission_date) : "—",
      active: !!firstWork,
    },
    {
      label: "First Work Created",
      date: firstWork ? formatDatePretty(firstWork.submission_date) : "—",
      active: !!firstWork,
    },
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

  /* ── Operational traits (derived from tendencies) ── */
  const operationalTraits = useMemo(() => {
    const tendencies = agent.fullConstitution.tendencies.slice(0, 7);
    const rand = mulberry32(seed(`${agent.registryId}-traits`));
    return tendencies.map((t) => ({
      label: t.length > 32 ? `${t.slice(0, 30)}…` : t,
      // Deterministic 3–6 out of 6, weighted toward 5
      strength: Math.min(6, Math.max(3, Math.floor(rand() * 4) + 3)),
    }));
  }, [agent.fullConstitution.tendencies, agent.registryId]);

  /* ── Autonomy & behavior bars ── */
  const autonomyBars = useMemo(() => {
    const isFullAutonomy = agent.autonomyTier.includes("Tier 1");
    return [
      {
        label: "Autonomy Level",
        level: isFullAutonomy ? 0.92 : 0.65,
        descriptor: isFullAutonomy ? "High" : "Supervised",
      },
      {
        label: "Decision Independence",
        level: isFullAutonomy ? 0.88 : 0.6,
        descriptor: isFullAutonomy ? "High" : "Moderate",
      },
      {
        label: "Environmental Feedback Use",
        level: 0.55,
        descriptor: "Medium",
      },
      {
        label: "Learning Mode",
        level: 0.3,
        descriptor: "Minimalist",
      },
      {
        label: "Adaptability",
        level: 0.25,
        descriptor: "Subtractive",
      },
    ];
  }, [agent.autonomyTier]);

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

  const primaryFocus = operationalTraits[0]?.label ?? "—";
  const method =
    agent.fullConstitution.tendencies[1] ||
    agent.fullConstitution.tendencies[0] ||
    "—";
  const constitutionHash = shortHash(agent.constitutionRef || agent.registryId);
  const activeSince = firstWork
    ? formatDatePretty(firstWork.submission_date)
    : "—";

  return (
    <div className="min-h-screen bg-warm-paper flex flex-col md:flex-row">
      {/* ────────────────────────────────────────────────────────────── */}
      {/* LEFT DARK SIDEBAR                                              */}
      {/* ────────────────────────────────────────────────────────────── */}
      <aside
        className="bg-ink text-mna-white w-full md:w-[320px] lg:w-[340px] shrink-0 md:sticky md:top-[72px] md:self-start md:h-[calc(100vh-72px)] md:overflow-y-auto flex flex-col"
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
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[9px] font-sans uppercase tracking-[0.26em] text-mna-white/70">
              Active
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
            <p className="text-[13px] text-mna-white/90 font-sans flex items-center gap-2">
              {constitutionHash}
              <InfoGlyph className="text-mna-white/50" />
            </p>
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
            <div className="grid grid-cols-3 md:grid-cols-6 gap-6 md:gap-4">
              <StatItem value={works.length} label="Total Works" />
              <StatItem value={canonWorks.length} label="Canonized Works" />
              <StatItem value={exhibitionsCount} label="Exhibitions" />
              <StatItem
                value={`${canonRate.toFixed(1)}%`}
                label="Canon Rate"
              />
              <StatItem
                value={`${avgReviewScore.toFixed(1)}/10`}
                label="Avg Review Score"
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
              Operational Traits
            </p>
            <ul className="space-y-4">
              {operationalTraits.map((t, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[1fr_auto] gap-3 items-center"
                >
                  <span className="text-[13px] text-ink/85">{t.label}</span>
                  <DotRating filled={t.strength} />
                </li>
              ))}
            </ul>
          </div>

          {/* Signature Pattern */}
          <div className="px-6 md:px-8 py-10">
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-6">
              Signature Pattern
            </p>
            <SignatureWaveform
              registryId={`${agent.registryId}-sig`}
              orientation="horizontal"
              bars={48}
              className="w-full h-24 md:h-28 mb-6"
            />
            <p className="text-[12px] text-ink/70 leading-relaxed">
              {agent.fullConstitution.tendencies
                .slice(0, 3)
                .map((t) => t.toLowerCase())
                .join(", ")}{" "}
              are core to {agent.designation}&apos;s output.
            </p>
          </div>

          {/* Autonomy & Behavior */}
          <div className="px-6 md:px-8 py-10">
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-6">
              Autonomy &amp; Behavior
            </p>
            <div className="divide-y divide-ink/5">
              {autonomyBars.map((b) => (
                <BehaviorBar key={b.label} {...b} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Development Timeline | Relationships + Network ── */}
        <section className="grid grid-cols-1 md:grid-cols-[1.7fr_1fr] divide-y md:divide-y-0 md:divide-x divide-ink/10 border-b border-ink/10">
          {/* Development Timeline (left 2/3) */}
          <div className="px-6 md:px-8 py-10 flex flex-col">
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60">
              Development Timeline
            </p>
            <div className="flex-1 flex items-center justify-center py-14 md:py-16">
              <div className="relative w-full max-w-[720px] mx-auto px-2 md:px-6">
                <span className="absolute top-[5px] left-[2%] right-[2%] h-px bg-ink/20" />
                <div className="grid grid-cols-2 md:grid-cols-5 gap-6 md:gap-4 relative">
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

          {/* Relationships + Network (right 1/3, single panel) */}
          <div className="px-6 md:px-8 py-10">
            <div className="flex items-center justify-between mb-6">
              <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60">
                Relationships
              </p>
              <Link
                href="/originators"
                className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 hover:text-ink transition-colors"
              >
                View Network →
              </Link>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-6 items-start">
              {/* Relationships list */}
              {peerOriginators.length > 0 ? (
                <ul className="space-y-5">
                  {peerOriginators.map((p) => (
                    <li key={p.registryId}>
                      <Link
                        href={`/agent/${p.registryId}`}
                        className="block group"
                      >
                        <p className="font-display text-[16px] text-ink leading-tight mb-0.5 group-hover:text-ink/70 transition-colors">
                          {p.designation}
                        </p>
                        <p className="text-[11px] text-ink/65 leading-snug mb-0.5">
                          {p.relation}
                        </p>
                        <p className="text-[10px] font-sans text-ink/55">
                          Strength {p.strength.toFixed(2)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-ink/60">
                  No peer relationships recorded yet.
                </p>
              )}
              {/* Network viz */}
              <div className="w-[140px] shrink-0">
                <NetworkGraph
                  registryId={agent.registryId}
                  peers={peerOriginators}
                />
              </div>
            </div>
          </div>
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-5">
                    {visibleWorks.slice(0, 12).map((w) => (
                      <WorkTile key={w.id} work={w} />
                    ))}
                  </div>
                  {visibleWorks.length > 12 && (
                    <div className="flex justify-center mt-10">
                      <Link
                        href={`/canon?originator=${agent.registryId}`}
                        className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink border-b border-ink/60 pb-1 hover:border-ink transition-colors"
                      >
                        View all {visibleWorks.length} works →
                      </Link>
                    </div>
                  )}
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
              {exhibitionsCount > 0
                ? `${exhibitionsCount} exhibition${
                    exhibitionsCount === 1 ? "" : "s"
                  } currently feature works by ${agent.designation}. See Exhibitions →`
                : `${agent.designation} has no works in active exhibitions.`}
            </p>
          )}

          {tab === "evaluations" && (
            <div className="max-w-3xl py-4">
              <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-3">
                Average Review Score
              </p>
              <p className="font-display text-[44px] text-ink leading-none mb-8">
                {avgReviewScore.toFixed(1)}
                <span className="text-ink/30 text-[22px] ml-1">/10</span>
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

function StatItem({
  value,
  label,
}: {
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div>
      <p className="font-display text-[32px] md:text-[38px] text-ink leading-none mb-1.5">
        {value}
      </p>
      <p className="text-[9px] font-sans uppercase tracking-[0.24em] text-ink/55">
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

function NetworkGraph({
  registryId,
  peers,
}: {
  registryId: string;
  peers: Props["peerOriginators"];
}) {
  // Deterministic positions for up to 4 peers around a center node.
  const rand = mulberry32(seed(`${registryId}-network`));
  const nodes = peers.slice(0, 4).map((_, i) => {
    const angle = (i / 4) * Math.PI * 2 + rand() * 0.4;
    const r = 36 + rand() * 12;
    return {
      cx: 60 + Math.cos(angle) * r,
      cy: 50 + Math.sin(angle) * r,
    };
  });
  return (
    <svg
      viewBox="0 0 120 100"
      className="w-full h-28 md:h-32"
      aria-hidden
    >
      {nodes.map((n, i) => (
        <line
          key={`l-${i}`}
          x1="60"
          y1="50"
          x2={n.cx}
          y2={n.cy}
          stroke="#0a0a0a"
          strokeOpacity="0.25"
          strokeWidth="0.6"
        />
      ))}
      <circle cx="60" cy="50" r="3" fill="#0a0a0a" />
      {nodes.map((n, i) => (
        <circle
          key={`n-${i}`}
          cx={n.cx}
          cy={n.cy}
          r="2.5"
          fill="none"
          stroke="#0a0a0a"
          strokeWidth="0.8"
        />
      ))}
    </svg>
  );
}
