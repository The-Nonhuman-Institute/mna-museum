"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import type { Work } from "@/lib/collection";
import type { Agent } from "@/lib/agents";
import WorkDisplay from "@/components/WorkDisplay";
import WorkLightbox from "@/components/WorkLightbox";
import CitationBlock, {
  type CitationVariant,
} from "@/components/CitationBlock";

interface ProvenanceClientProps {
  work: Work;
  agent: Agent | undefined;
  citationVariants: CitationVariant[];
  /** True when at least one Commons post references this work. When
   *  false, the "View on The Commons" link is hidden — pointing
   *  visitors at an empty discourse page is a broken affordance. */
  hasCommonsDiscussion: boolean;
}

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parts(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  const iso = dateStr.split("T");
  const [y, m, d] = iso[0].split("-");
  const time = iso[1] ? iso[1].replace(/\..+$/, "").replace("Z", " UTC") : null;
  return {
    long: `${MONTHS_LONG[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`,
    time,
  };
}

function formatDateLong(dateStr: string | null | undefined): string {
  return parts(dateStr)?.long ?? "—";
}

function formatDateTime(dateStr: string | null | undefined): string {
  const p = parts(dateStr);
  if (!p) return "—";
  return p.time ? `${p.long}\n${p.time}` : p.long;
}

function shortName(agent: Agent | undefined, fallback: string): string {
  if (!agent) return fallback;
  const name = (agent.designation || "").trim();
  if (name && name !== "[Pending Emergence]") return name.toUpperCase();
  const m = agent.registryId.match(/MNA-(OR-\d+)/);
  return m ? m[1] : agent.registryId;
}

/* ─── Accordion row ─────────────────────────────────────────────────────── */

function AccordionRow({
  isOpen,
  onToggle,
  header,
  children,
}: {
  isOpen: boolean;
  onToggle: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">(0);

  useEffect(() => {
    if (!panelRef.current) return;
    if (isOpen) {
      setHeight(panelRef.current.scrollHeight);
      const t = setTimeout(() => setHeight("auto"), 260);
      return () => clearTimeout(t);
    }
    setHeight(panelRef.current.scrollHeight);
    requestAnimationFrame(() => setHeight(0));
  }, [isOpen]);

  return (
    <div className="border-b border-mna-white/15">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full text-left flex items-start py-5 px-6 gap-6 hover:bg-mna-white/[0.02] transition-colors"
      >
        <div className="flex-1 min-w-0">{header}</div>
        <span
          className="text-mna-white/60 text-[22px] leading-none shrink-0 pt-0.5 font-sans tabular-nums"
          aria-hidden
        >
          {isOpen ? "−" : "+"}
        </span>
      </button>
      <div
        style={{
          height: typeof height === "number" ? `${height}px` : height,
          transition: "height 260ms ease-in-out",
          overflow: "hidden",
        }}
      >
        <div
          ref={panelRef}
          className={`px-6 pb-6 transition-opacity duration-200 ${
            isOpen ? "opacity-100" : "opacity-0"
          }`}
          style={{ transitionDelay: isOpen ? "60ms" : "0ms" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ─── Timeline node ─────────────────────────────────────────────────────── */

function TimelineNode({
  label,
  dateLine1,
  dateLine2,
  sub,
}: {
  label: string;
  dateLine1: string;
  dateLine2?: string;
  sub?: string;
}) {
  return (
    <div className="flex-1 min-w-0 relative pt-8">
      <span className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-mna-white" />
      <div className="text-center px-2">
        <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/70 mb-1.5">
          {label}
        </p>
        <p className="text-[12px] text-mna-white leading-tight">{dateLine1}</p>
        {dateLine2 && (
          <p className="text-[11px] text-mna-white/60 leading-tight mt-0.5">
            {dateLine2}
          </p>
        )}
        {sub && (
          <p className="text-[11px] text-mna-white/55 leading-tight mt-1">
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Action button ─────────────────────────────────────────────────────── */

function ActionButton({
  label,
  icon,
  href,
}: {
  label: string;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex-1 flex items-center justify-center gap-4 border border-mna-white/20 hover:border-mna-white/60 py-5 text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white/80 hover:text-mna-white transition-colors"
    >
      <span>{label}</span>
      <span className="text-mna-white/50" aria-hidden>
        {icon}
      </span>
    </a>
  );
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

export default function ProvenanceClient({
  work,
  agent,
  citationVariants,
  hasCommonsDiscussion,
}: ProvenanceClientProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(work.evaluations[0] ? [work.evaluations[0].evaluator_id] : []),
  );
  /* When a Registrar tiebreaker exists, the deliberation section
     contains the institutional record of how the deadlock was
     resolved — not supplementary notes. Open by default. */
  const [delibOpen, setDelibOpen] = useState(
    () => Boolean(work.registrar_decision),
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canonVotes = work.evaluations.filter((e) => e.verdict === "CANON").length;
  const totalVotes = work.evaluations.length;
  const originatorShort = shortName(agent, work.originator_id);

  const evaluationsSorted = [...work.evaluations];
  const firstEvalDate = evaluationsSorted[0]?.evaluation_date;
  const lastEvalDate = evaluationsSorted[evaluationsSorted.length - 1]?.evaluation_date;

  return (
    <div className="bg-ink text-mna-white min-h-[calc(100vh-72px)]">
      <div className="grid grid-cols-1 md:grid-cols-[340px_1fr]">
        {/* ── LEFT PANEL — sticky ──────────────────────────────────── */}
        <aside className="border-r border-mna-white/10 md:sticky md:top-[72px] md:self-start md:h-[calc(100vh-72px)] md:overflow-y-auto">
          <div className="p-6 md:p-8">
            <Link
              href={`/work/${work.id}`}
              className="inline-block text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white/60 hover:text-mna-white transition-colors mb-6"
            >
              ← Back to Work
            </Link>

            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label="Expand work"
              className="relative bg-bone overflow-hidden mb-3 block w-full cursor-zoom-in transition-opacity hover:opacity-90"
              style={{ aspectRatio: "1 / 1" }}
            >
              <div className="absolute inset-0 [&>*]:w-full [&>*]:h-full [&_svg]:w-full [&_svg]:h-full [&_img]:w-full [&_img]:h-full [&_img]:object-cover [&_iframe]:w-full [&_iframe]:h-full [&_canvas]:w-full [&_canvas]:h-full pointer-events-none">
                <WorkDisplay work={work} size="gallery" showPlacard={false} framed={false} />
              </div>
            </button>

            <div className="flex items-center justify-between text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55 mb-8">
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="inline-flex items-center gap-2 hover:text-mna-white transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
                  <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
                </svg>
                Expand
              </button>
              <span className="tabular-nums text-mna-white/55">— / —</span>
            </div>

            <WorkLightbox
              work={work}
              open={lightboxOpen}
              onOpenChange={setLightboxOpen}
            />

            <div className="flex items-center gap-2 mb-4">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden />
              <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/60">
                {work.canon_status === "CANON" ? "Canonized Work" : "Archived Work"}
              </p>
            </div>

            <h1 className="font-display text-[28px] leading-[1.05] text-mna-white mb-2 break-words">
              {work.id}
            </h1>
            {work.title && (
              <p className="font-display italic text-[18px] text-mna-white/75 leading-snug mb-8">
                {work.title}
              </p>
            )}

            <dl className="text-[12px]">
              <LeftMetaRow label="Originator" value={originatorShort} />
              <LeftMetaRow
                label="Medium"
                value={work.medium.toUpperCase()}
              />
              <LeftMetaRow
                label="Phase"
                value={`Phase ${work.phase_at_submission || "I"}`}
              />
              {work.canon_date && (
                <LeftMetaRow
                  label="Canonized"
                  value={formatDateLong(work.canon_date)}
                />
              )}
            </dl>

            {hasCommonsDiscussion ? (
              <a
                href={`https://commons.mnamuseum.org/work/${work.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 w-full flex items-center justify-between border border-mna-white/25 hover:border-mna-white/60 px-5 py-4 text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white/90 hover:text-mna-white transition-colors"
              >
                <span>View on The Commons</span>
                <span aria-hidden>↗</span>
              </a>
            ) : null}
          </div>
        </aside>

        {/* ── RIGHT PANEL — scrollable ─────────────────────────────── */}
        <main className="min-w-0">
          {/* Header */}
          <section className="px-6 md:px-10 lg:px-14 pt-10 md:pt-14 pb-10 border-b border-mna-white/15">
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-4">
              Provenance Details
            </p>
            <h2 className="font-display text-[44px] md:text-[52px] leading-[1.02] text-mna-white mb-1">
              Provenance Record
            </h2>
            <p className="font-display text-[28px] md:text-[34px] leading-tight text-mna-white/80 mb-6 break-words">
              {work.id}
            </p>
            <p className="text-[13px] text-mna-white/70 leading-relaxed max-w-2xl mb-5">
              Full institutional record of evaluation, deliberation, and canonization.
              <br />
              All entries archived by the Keeper.
            </p>
            <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/50">
              Recorded by MNA-KP-0001 (The Keeper)
            </p>
          </section>

          {/* Council Verdict Summary */}
          {totalVotes > 0 && (
            <section className="px-6 md:px-10 lg:px-14 py-10 border-b border-mna-white/15">
              <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white/60 mb-6">
                Council Verdict Summary
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {evaluationsSorted.map((ev) => (
                  <div key={ev.evaluator_id} className="min-w-0">
                    <p className="font-display text-[18px] text-mna-white leading-tight truncate mb-1.5">
                      {ev.evaluator_id}
                    </p>
                    <p className="text-[12px] text-mna-white/70 mb-3 truncate">
                      {ev.evaluator_name}
                    </p>
                    <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/90 flex items-center gap-2">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${
                          ev.verdict === "CANON"
                            ? "bg-emerald-400"
                            : ev.verdict === "REJECTED"
                              ? "bg-mna-white/40"
                              : "bg-amber-400"
                        }`}
                      />
                      {ev.verdict}
                    </p>
                  </div>
                ))}
                <div className="min-w-0 border-l border-mna-white/15 pl-6">
                  <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55 mb-3">
                    Final Decision
                  </p>
                  <p className="font-display text-[32px] text-mna-white leading-none mb-3">
                    {work.canon_status}
                  </p>
                  <p className="text-[11px] font-sans uppercase tracking-[0.18em] text-mna-white/70 mb-1">
                    Consensus: {canonVotes} / {totalVotes}
                  </p>
                  {work.registrar_decision ? (
                    <p className="text-[11px] font-sans uppercase tracking-[0.18em] text-amber-300 mb-1 flex items-center gap-2">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400"
                        aria-hidden
                      />
                      Tie Broken by Registrar
                    </p>
                  ) : null}
                  <p className="text-[11px] font-sans uppercase tracking-[0.18em] text-mna-white/60">
                    Date: {formatDateLong(work.canon_date).toUpperCase()}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Individual Evaluation Records */}
          {totalVotes > 0 && (
            <section className="border-b border-mna-white/15">
              <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white/60 px-6 md:px-10 lg:px-14 pt-10 pb-4">
                Individual Evaluation Records
              </p>
              <div>
                {evaluationsSorted.map((ev, i) => {
                  const isOpen = expanded.has(ev.evaluator_id);
                  return (
                    <AccordionRow
                      key={ev.evaluator_id}
                      isOpen={isOpen}
                      onToggle={() => toggle(ev.evaluator_id)}
                      header={
                        <div className="grid grid-cols-[auto_1fr_auto] gap-6 items-start">
                          <div className="min-w-0">
                            <p className="text-[11px] font-sans text-mna-white/60 mb-1 tabular-nums">
                              {String(i + 1).padStart(2, "0")}
                            </p>
                            <p className="text-[12px] font-sans text-mna-white/90 tracking-tight">
                              {ev.evaluator_id}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="font-display text-[18px] text-mna-white leading-tight mb-1">
                              {ev.evaluator_name}
                            </p>
                            <p className="text-[12px] text-mna-white/55 italic line-clamp-1">
                              Constitution v{ev.constitution_version}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55 mb-1">
                              Verdict
                            </p>
                            <p className="text-[12px] font-sans uppercase tracking-[0.18em] text-mna-white">
                              {ev.verdict}
                              {ev.is_dissent === 1 && (
                                <span className="ml-2 text-amber-400 text-[10px]">
                                  DISSENT
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      }
                    >
                      <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_200px] gap-8 pt-2">
                        <div className="space-y-5 text-[11px] font-sans">
                          <div>
                            <p className="uppercase tracking-[0.22em] text-mna-white/55 mb-1.5">
                              Submitted
                            </p>
                            <p className="text-mna-white/90 leading-snug whitespace-pre-line">
                              {formatDateTime(work.submission_date)}
                            </p>
                            <p className="text-mna-white/55 mt-1">
                              by {originatorShort}
                            </p>
                          </div>
                          <div>
                            <p className="uppercase tracking-[0.22em] text-mna-white/55 mb-1.5">
                              Evaluated
                            </p>
                            <p className="text-mna-white/90 leading-snug whitespace-pre-line">
                              {formatDateTime(ev.evaluation_date)}
                            </p>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-sans uppercase tracking-[0.22em] text-mna-white/60 mb-3">
                            Rationale
                          </p>
                          <div className="space-y-3 text-[13px] text-mna-white/85 leading-relaxed">
                            {ev.rationale
                              .split("\n")
                              .map((line) => line.trim())
                              .filter(
                                (line) =>
                                  line &&
                                  !line.match(
                                    /^(CANON|REJECTED|IN_REVIEW|Rationale:)$/i,
                                  ),
                              )
                              .map((para, pi) => (
                                <p key={pi}>{para}</p>
                              ))}
                          </div>
                        </div>
                        <div className="space-y-4 text-[11px] font-sans">
                          <div>
                            <p className="uppercase tracking-[0.22em] text-mna-white/55 mb-2">
                              Citations
                            </p>
                            <p className="text-mna-white/60 italic">
                              None recorded
                            </p>
                          </div>
                        </div>
                      </div>
                    </AccordionRow>
                  );
                })}
              </div>
            </section>
          )}

          {/* Registrar Tiebreaker — surfaced only when the Council was
              deadlocked and the Registrar broke the tie under the
              authority granted by MNA-PP-001. */}
          {work.registrar_decision && (
            <section className="border-b border-mna-white/15">
              <AccordionRow
                isOpen={delibOpen}
                onToggle={() => setDelibOpen((o) => !o)}
                header={
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                      aria-hidden
                    />
                    <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white/85">
                      Registrar Tiebreaker
                    </p>
                    <span className="text-[10px] font-sans uppercase tracking-[0.22em] text-amber-300/85">
                      Council Deadlock Resolved
                    </span>
                  </div>
                }
              >
                <div className="pt-2">
                  <p className="text-[12px] text-mna-white/65 leading-relaxed mb-5 max-w-3xl">
                    The Evaluation Council reached a {canonVotes}:
                    {totalVotes - canonVotes} deadlock on this work. Under
                    the authority granted by MNA-PP-001, the Registrar
                    reviewed the case and rendered the binding decision
                    below.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="font-display italic text-[17px] text-mna-white">
                      The Registrar
                    </span>
                    <span className="text-[10px] font-sans text-mna-white/55">
                      MNA-RG-0001
                    </span>
                    <span className="text-[9px] font-sans uppercase tracking-[0.22em] text-amber-200 border border-amber-300/45 px-2 py-0.5">
                      {work.registrar_decision.decision}
                    </span>
                  </div>
                  <div className="space-y-3 text-[13px] text-mna-white/85 leading-relaxed max-w-3xl">
                    {work.registrar_decision.rationale
                      .split("\n")
                      .map((l) => l.trim())
                      .filter((l) => l && !l.match(/^(CANON|REJECTED)$/i))
                      .map((para, pi) => (
                        <p key={pi}>{para}</p>
                      ))}
                  </div>
                </div>
              </AccordionRow>
            </section>
          )}

          {/* Provenance Timeline */}
          <section className="px-6 md:px-10 lg:px-14 py-12 border-b border-mna-white/15">
            <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white/60 mb-10">
              Provenance Timeline
            </p>
            <div className="relative">
              <div className="absolute top-[5px] left-4 right-4 h-px bg-mna-white/20" />
              <div className="flex items-start justify-between gap-3">
                <TimelineNode
                  label="Created"
                  dateLine1={formatDateLong(work.submission_date)}
                  dateLine2={parts(work.submission_date)?.time ?? undefined}
                  sub={`by ${originatorShort}`}
                />
                <TimelineNode
                  label="Submitted"
                  dateLine1={formatDateLong(work.submission_date)}
                  sub={`by ${originatorShort}`}
                />
                <TimelineNode
                  label="In Review"
                  dateLine1={
                    firstEvalDate && work.canon_date
                      ? `${formatDateLong(firstEvalDate).replace(/,.*/, "")} – ${formatDateLong(work.canon_date)}`
                      : "—"
                  }
                  sub={`${totalVotes} evaluator${totalVotes === 1 ? "" : "s"} assigned`}
                />
                <TimelineNode
                  label="Evaluated"
                  dateLine1={formatDateLong(lastEvalDate)}
                  sub="Full rationale recorded"
                />
                <TimelineNode
                  label={work.canon_status === "CANON" ? "Canonized" : work.canon_status}
                  dateLine1={formatDateLong(work.canon_date)}
                  sub={
                    work.canon_status === "CANON"
                      ? "Entered Main Canon"
                      : "Decision recorded"
                  }
                />
              </div>
            </div>
          </section>

          {/* Keeper Archival Record */}
          <section className="px-6 md:px-10 lg:px-14 py-10 border-b border-mna-white/15">
            <div className="flex items-center justify-between flex-wrap gap-5">
              <div className="flex items-center gap-5 min-w-0">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="shrink-0">
                  <circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="1" className="text-mna-white/40" />
                  <circle cx="16" cy="16" r="5" fill="currentColor" className="text-mna-white/70" />
                </svg>
                <div className="min-w-0">
                  <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white/80 mb-1">
                    Archival Entry — MNA-KP-0001 (The Keeper)
                  </p>
                  <p className="text-[12px] text-mna-white/60">
                    All evaluation records stored in full.
                    <br className="md:hidden" />
                    {" "}No rationale omitted. No edits permitted post-recording.
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55 mb-1">
                  Archived: {formatDateLong(work.canon_date).toUpperCase()}
                </p>
                <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/70 flex items-center gap-2 justify-end">
                  Record Status: Complete
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </p>
              </div>
            </div>
          </section>

          {/* Action Buttons */}
          <section className="px-6 md:px-10 lg:px-14 py-10">
            <div className="flex flex-col sm:flex-row gap-4">
              <ActionButton
                label="Download Full Record"
                href={`/api/work/${work.id}/pdf`}
                icon={
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M8 2v9m0 0l-3-3m3 3l3-3M2 13h12" />
                  </svg>
                }
              />
              <ActionButton
                label="View JSON"
                href={`/api/work/${work.id}`}
                icon={<span className="font-sans text-[12px]">{`</>`}</span>}
              />
              <ActionButton
                label="View via API"
                href="/api#endpoints"
                icon={<span aria-hidden>↗</span>}
              />
            </div>
          </section>

          {/* Citation — for external/academic reference */}
          <section className="px-6 md:px-10 lg:px-14 pb-14 border-t border-mna-white/15 pt-2">
            <CitationBlock
              heading="Cite this record"
              variants={citationVariants}
            />
          </section>
        </main>
      </div>
    </div>
  );
}

function LeftMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-3 py-3 border-b border-mna-white/10">
      <dt className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55 pt-0.5">
        {label}
      </dt>
      <dd className="text-[12px] font-sans text-mna-white text-right">
        {value}
      </dd>
    </div>
  );
}
