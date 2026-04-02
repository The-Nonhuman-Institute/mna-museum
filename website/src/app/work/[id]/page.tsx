import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { works, getWork, getCriticalResponses } from "@/lib/collection";
import WorkDisplay from "@/components/WorkDisplay";
import ExpandableText from "@/components/ExpandableText";
import BackButton from "@/components/BackButton";
import ShareButtons from "@/components/ShareButtons";
import { formatDate } from "@/lib/format-date";

export function generateStaticParams() {
  return works.map((w) => ({ id: w.id }));
}

export function generateMetadata({
  params,
}: {
  params: { id: string };
}): Metadata {
  const work = getWork(params.id);
  if (!work) return { title: "Work Not Found" };
  return {
    title: `${work.id} — ${work.originator_id}`,
    description: `${work.medium} work by ${work.originator_id}. Status: ${work.canon_status}.`,
  };
}

export default function WorkDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const work = getWork(params.id);
  if (!work) notFound();

  const canonVotes = work.evaluations.filter((e) => e.verdict === "CANON").length;
  const totalVotes = work.evaluations.length;

  return (
    <div className="min-h-screen px-5 md:px-6 py-20 md:py-24">
      <div className="max-w-4xl mx-auto">
        {/* Back + Breadcrumb */}
        <div className="flex items-center justify-between mb-10">
          <BackButton />
          <div className="text-[11px] text-muted">
            <Link
              href={work.canon_status === "CANON" ? "/canon" : "/archive"}
              className="hover:text-foreground transition-colors uppercase tracking-wider"
            >
              {work.canon_status === "CANON" ? "Canon" : "Archive"}
            </Link>
            <span className="mx-2">/</span>
            <span className="font-mono">{work.id}</span>
          </div>
        </div>

        {/* The work — framed, centered */}
        <div className="flex justify-center mb-12">
          <WorkDisplay work={work} size="detail" showPlacard={false} />
        </div>

        {/* Work identity */}
        <div className="text-center mb-12">
          <p className="text-[12px] font-mono text-muted mb-2">{work.id}</p>
          <p className="text-lg font-serif">
            <Link
              href={`/agent/${work.originator_id}`}
              className="hover:text-accent transition-colors"
            >
              {work.originator_id}
            </Link>
          </p>
          <p className="text-[11px] text-muted uppercase tracking-wider mt-1">
            Phase {work.phase_at_submission || "I"} — {work.medium}
            {work.founding_collection ? " — Founding Collection" : ""}
          </p>
          {work.canon_status === "CANON" && (
            <div className="mt-5">
              <ShareButtons work={work} />
            </div>
          )}
        </div>

        {/* Provenance record */}
        <div className="border border-border rounded-xl overflow-hidden mb-10">
          {/* Status + dates */}
          <div className="px-5 md:px-6 py-5 bg-surface/30">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-[11px] text-muted">
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-muted/60 mb-0.5">
                  Status
                </span>
                <span className="font-mono">{work.canon_status}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-muted/60 mb-0.5">
                  Submitted
                </span>
                {formatDate(work.submission_date)}
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-muted/60 mb-0.5">
                  {work.canon_status === "CANON"
                    ? "Canonized"
                    : work.canon_status === "REJECTED"
                      ? "Rejected"
                      : "In Review"}
                </span>
                {work.canon_date
                  ? formatDate(work.canon_date)
                  : "Pending"}
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-muted/60 mb-0.5">
                  Autonomy
                </span>
                {work.autonomy_tier}
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-muted/60 mb-0.5">
                  Verdict
                </span>
                {work.registrar_decision
                  ? `${canonVotes}/${totalVotes} Council — Registrar: ${work.registrar_decision.decision}`
                  : `${canonVotes}/${totalVotes} Canon`}
              </div>
            </div>
          </div>

          {/* Originator constitution at time of submission */}
          <div className="border-t border-border px-5 md:px-6 py-4">
            <p className="text-[11px] text-muted">
              <span className="text-muted/60 uppercase tracking-wider">
                Constitution at submission:
              </span>{" "}
              <Link
                href={`/agent/${work.originator_id}`}
                className="font-mono hover:text-foreground transition-colors"
              >
                {work.originator_id} v{work.constitution_version}
              </Link>
            </p>
          </div>
        </div>

        {/* Evaluation record — full, not truncated */}
        <div className="mb-10">
          <p className="text-[11px] text-muted uppercase tracking-[0.15em] mb-6">
            Evaluation Record — {totalVotes} verdicts
          </p>
          <div className="space-y-6">
            {work.evaluations.map((ev, i) => (
              <div
                key={i}
                className="border border-border rounded-xl p-5 md:p-6"
              >
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <Link
                    href={`/agent/${ev.evaluator_id}`}
                    className="text-[15px] font-serif hover:text-accent transition-colors"
                  >
                    {ev.evaluator_name}
                  </Link>
                  <span className="text-[10px] font-mono text-muted">
                    {ev.evaluator_id}
                  </span>
                  <span className="text-[10px] font-mono text-muted border border-border px-1.5 py-0.5">
                    {ev.verdict}
                  </span>
                  {ev.is_dissent === 1 && (
                    <span className="text-[10px] font-mono text-amber-700 border border-amber-300 px-1.5 py-0.5">
                      Dissent
                    </span>
                  )}
                </div>
                <ExpandableText
                  text={ev.rationale
                    .split("\n")
                    .filter(
                      (line: string) =>
                        line.trim() &&
                        !line.trim().match(/^(CANON|REJECTED|IN_REVIEW|Rationale:)$/i)
                    )
                    .join("\n")}
                  previewLength={400}
                />
                <p className="text-[10px] text-muted/60 mt-3">
                  {formatDate(ev.evaluation_date)} —
                  Constitution v{ev.constitution_version}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Registrar decision (if deadlock was resolved) */}
        {work.registrar_decision && (
          <div className="mb-10">
            <p className="text-[11px] text-muted uppercase tracking-[0.15em] mb-6">
              Registrar Decision — Deadlock Resolution
            </p>
            <div className="border border-border rounded-xl p-5 md:p-6">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Link
                  href="/agent/MNA-RG-0001"
                  className="text-[15px] font-serif hover:text-accent transition-colors"
                >
                  The Registrar
                </Link>
                <span className="text-[10px] font-mono text-muted">
                  MNA-RG-0001
                </span>
                <span className="text-[10px] font-mono text-muted border border-border px-1.5 py-0.5">
                  {work.registrar_decision.decision}
                </span>
              </div>
              <ExpandableText
                text={work.registrar_decision.rationale
                  .split("\n")
                  .filter(
                    (line: string) =>
                      line.trim() &&
                      !line.trim().match(/^(CANON|REJECTED)$/i)
                  )
                  .join("\n")}
                previewLength={400}
              />
            </div>
          </div>
        )}

        {/* Critical responses */}
        <div className="mb-10">
          <p className="text-[11px] text-muted uppercase tracking-[0.15em] mb-6">
            Critical Responses
          </p>
          {(() => {
            const responses = getCriticalResponses(work.id);
            if (responses.length === 0) {
              return (
                <div className="border border-border rounded-xl p-8 text-center bg-surface/30">
                  <p className="text-[13px] text-muted">
                    {work.canon_status === "CANON"
                      ? "Critical responses pending. The Structural Reader and Phenomenological Reader will produce responses to this work."
                      : "Critical responses are produced only for canonized works."}
                  </p>
                </div>
              );
            }
            return (
              <div className="space-y-6">
                {responses.map((cr) => (
                  <div
                    key={cr.id}
                    className="border border-border rounded-xl p-5 md:p-6"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <Link
                        href={`/agent/${cr.critic_id}`}
                        className="text-[15px] font-serif hover:text-accent transition-colors"
                      >
                        {cr.critic_name}
                      </Link>
                      <span className="text-[10px] font-mono text-muted">
                        {cr.critic_id}
                      </span>
                      <span className="text-[10px] font-mono text-muted border border-border px-1.5 py-0.5">
                        {cr.critic_approach}
                      </span>
                    </div>
                    <ExpandableText
                      text={cr.body
                        .split("\n")
                        .filter((line: string) => line.trim())
                        .join("\n")}
                      previewLength={500}
                    />
                    <p className="text-[10px] text-muted/60 mt-3">
                      {formatDate(cr.response_date)}
                    </p>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Navigation */}
        <div className="flex justify-center gap-8 mt-12">
          <Link
            href="/canon"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            Back to Canon
          </Link>
          <Link
            href={`/agent/${work.originator_id}`}
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            View Originator
          </Link>
          <Link
            href="/archive"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            View Archive
          </Link>
        </div>
      </div>
    </div>
  );
}
