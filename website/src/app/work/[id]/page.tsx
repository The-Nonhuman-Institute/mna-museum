import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getWork,
  getCanonWorks,
  getWorksByOriginator,
} from "@/lib/collection";
import { getAgent } from "@/lib/agents";
import { getActiveExhibitionsContainingWork } from "@/lib/exhibitions";
import WorkDisplay from "@/components/WorkDisplay";
import ViewingNote from "@/components/ViewingNote";
import ShareButtons from "@/components/ShareButtons";
import { resolveBackContext, type RawSearchParams } from "@/lib/nav-context";
import CitationBlock from "@/components/CitationBlock";
import {
  workToCitableItem,
  formatCitation,
  highwireMeta,
  CITATION_FORMATS,
  type CitationFormat,
} from "@/lib/citations";

export const dynamicParams = true;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDatePretty(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("T")[0].split("-");
  if (!y || !m || !d) return String(dateStr);
  return `${MONTHS_SHORT[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const work = await getWork(params.id);
  if (!work) return { title: "Work Not Found" };
  const statusLabel =
    work.canon_status === "CANON"
      ? "Canon"
      : work.canon_status === "REJECTED"
        ? "Rejected"
        : "Under Reconsideration";
  // Highwire Press meta tags — Google Scholar / Zotero / EndNote etc.
  // automatically read these when a researcher saves the URL, so MNA
  // works become citable without manual metadata entry on their end.
  const citable = workToCitableItem(work);
  return {
    title: `${work.id} — ${work.originator_id} — Museum of Nonhuman Art`,
    description: `${work.medium} work by ${work.originator_id}. Status: ${statusLabel}. Phase ${work.phase_at_submission || "I"}.`,
    openGraph: {
      title: `${work.id} — ${work.originator_id}`,
      description: `${work.medium} work by ${work.originator_id}. ${statusLabel}.`,
      siteName: "Museum of Nonhuman Art",
    },
    twitter: {
      card: "summary_large_image",
      title: `${work.id} — ${work.originator_id}`,
      description: `${work.medium} work. ${statusLabel}.`,
    },
    other: highwireMeta(citable),
  };
}

function statusDotClass(canon_status: string): string {
  switch (canon_status) {
    case "CANON":
      return "bg-emerald-500";
    case "REJECTED":
      return "bg-ink/30";
    case "IN_REVIEW":
      return "bg-amber-500";
    default:
      return "bg-ink/20";
  }
}

function statusSectionLabel(canon_status: string): string {
  switch (canon_status) {
    case "CANON":
      return "Canonized Work";
    case "REJECTED":
      return "Rejected Work";
    case "IN_REVIEW":
      return "Under Review";
    default:
      return "Submitted Work";
  }
}

/* ─── Metadata row ───────────────────────────────────────────────────────── */

function MetaRow({
  label,
  value,
  href,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
}) {
  const valueNode = href ? (
    <Link
      href={href}
      className="text-ink hover:text-ink/70 transition-colors"
    >
      {value}
    </Link>
  ) : (
    value
  );
  return (
    <div className="grid grid-cols-[110px_1fr] gap-4 items-baseline py-3 border-b border-ink/10">
      <dt className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55">
        {label}
      </dt>
      <dd className="text-[13px] text-ink font-sans">{valueNode}</dd>
    </div>
  );
}

/* ─── Provenance timeline item ──────────────────────────────────────────── */

function ProvItem({
  label,
  date,
  active = true,
}: {
  label: string;
  date: string | null | undefined;
  active?: boolean;
}) {
  return (
    <div className="flex gap-4 relative">
      <div className="flex flex-col items-center shrink-0">
        <span
          className={`w-2.5 h-2.5 rounded-full border ${
            active ? "bg-ink border-ink" : "bg-bone border-ink/40"
          }`}
        />
        <span className="w-px flex-1 bg-ink/15 mt-1" />
      </div>
      <div className="flex-1 pb-5">
        <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 mb-1">
          {label}
        </p>
        <p className="text-[13px] font-sans text-ink">
          {formatDatePretty(date)}
        </p>
      </div>
    </div>
  );
}

export default async function WorkDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: RawSearchParams;
}) {
  const work = await getWork(params.id);
  if (!work) notFound();

  const back = resolveBackContext(searchParams, {
    label: work.canon_status === "CANON" ? "Back to Canon" : "Back to Archive",
    href: work.canon_status === "CANON" ? "/canon" : "/archive",
  });

  const [agent, currentExhibitions, canonList, originatorWorks] =
    await Promise.all([
      getAgent(work.originator_id),
      getActiveExhibitionsContainingWork(work.id),
      getCanonWorks(),
      getWorksByOriginator(work.originator_id),
    ]);

  const canonVotes = work.evaluations.filter(
    (e: { verdict: string }) => e.verdict === "CANON"
  ).length;
  const totalVotes = work.evaluations.length;
  const hasEmerged = agent && agent.designation !== "[Pending Emergence]";
  const displayName = hasEmerged ? agent!.designation : work.originator_id;

  // Prev/next within the canon, sorted oldest → newest by canon_date
  const sortedCanon = [...canonList]
    .filter((w) => w.canon_date)
    .sort((a, b) => (a.canon_date! > b.canon_date! ? 1 : -1));
  const idx = sortedCanon.findIndex((w) => w.id === work.id);
  const prevWork = idx > 0 ? sortedCanon[idx - 1] : null;
  const nextWork =
    idx >= 0 && idx < sortedCanon.length - 1 ? sortedCanon[idx + 1] : null;

  // Related works — other canon works by same originator, exclude current
  const relatedWorks = originatorWorks
    .filter((w) => w.id !== work.id && w.canon_status === "CANON")
    .slice(0, 4);

  // Pre-format all four citations server-side so the client component
  // is purely presentational. Format switching + clipboard are still
  // interactive — handled inside CitationBlock.
  const citable = workToCitableItem(work);
  const citations = Object.fromEntries(
    CITATION_FORMATS.map((f) => [f, formatCitation(citable, f)]),
  ) as Record<CitationFormat, string>;

  return (
    <article className="min-h-screen">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-8 md:py-10">
        {/* ── Breadcrumb ────────────────────────────────────────────── */}
        <nav className="mb-8">
          <Link
            href={back.href}
            className="inline-block text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60 hover:text-ink transition-colors"
          >
            ← {back.label}
          </Link>
        </nav>

        {/* ── 2-col hero: work preview + metadata panel ─────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-8 md:gap-12 mb-16">
          {/* LEFT: work preview */}
          <div>
            <div
              className="relative bg-warm-paper border border-ink/10 overflow-hidden"
              style={{ aspectRatio: "1 / 1" }}
            >
              <div className="absolute inset-0 [&>*]:w-full [&>*]:h-full [&_svg]:w-full [&_svg]:h-full [&_img]:w-full [&_img]:h-full [&_img]:object-cover [&_iframe]:w-full [&_iframe]:h-full [&_canvas]:w-full [&_canvas]:h-full">
                <WorkDisplay
                  work={work}
                  size="detail"
                  showPlacard={false}
                  framed={false}
                />
              </div>
            </div>
            <ViewingNote work={work} maxWidth={680} />
          </div>

          {/* RIGHT: metadata panel */}
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 mb-5">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${statusDotClass(work.canon_status)}`}
                aria-hidden
              />
              <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60">
                {statusSectionLabel(work.canon_status)}
              </p>
            </div>

            <h1 className="font-display text-3xl md:text-4xl text-ink leading-[1.05] mb-3 break-words">
              {work.id}
            </h1>

            {work.title && (
              <p className="font-display italic text-[22px] md:text-[24px] text-ink/80 leading-snug mb-7">
                {work.title}
              </p>
            )}

            {currentExhibitions.length > 0 && (
              <div className="mb-5 border border-ink/15 bg-bone px-4 py-3">
                <p className="text-[9px] font-sans uppercase tracking-[0.26em] text-ink/50 mb-1">
                  Currently Featured In
                </p>
                {currentExhibitions.map((ex) => (
                  <Link
                    key={ex.id}
                    href={`/exhibitions/${ex.id}`}
                    className="block font-display italic text-[15px] text-ink hover:text-ink/70 transition-colors"
                  >
                    {ex.title} →
                  </Link>
                ))}
              </div>
            )}

            <dl className="border-t border-ink/10">
              <MetaRow label="Medium" value={work.medium} />
              <MetaRow label="Output Type" value={work.output_type} />
              <MetaRow
                label="Phase"
                value={`Phase ${work.phase_at_submission || "I"}`}
              />
              <MetaRow label="Autonomy Tier" value={work.autonomy_tier} />
              <MetaRow
                label="Submission"
                value={formatDatePretty(work.submission_date)}
              />
              {work.canon_date && (
                <MetaRow
                  label={
                    work.canon_status === "CANON" ? "Canonization" : "Verdict Date"
                  }
                  value={formatDatePretty(work.canon_date)}
                />
              )}
              <MetaRow
                label="Verdict"
                value={
                  work.registrar_decision
                    ? `${canonVotes}/${totalVotes} · Reg. ${work.registrar_decision.decision}`
                    : `${canonVotes}/${totalVotes} Canon`
                }
              />
              <MetaRow
                label="Constitution"
                value={`v${work.constitution_version}`}
                href={`/agent/${work.originator_id}`}
              />
              {work.founding_collection ? (
                <MetaRow label="Collection" value="Founding" />
              ) : null}
            </dl>

            <a
              href={`https://commons.mnamuseum.org/work/${work.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-3 text-[11px] font-sans uppercase tracking-[0.26em] text-ink hover:text-ink/70 transition-colors border-b border-ink/60 pb-1 self-start"
            >
              <span>View on The Commons</span>
              <span aria-hidden>→</span>
            </a>

            <div className="mt-auto pt-6 flex justify-start">
              <ShareButtons work={work} />
            </div>
          </div>
        </div>

        {/* ── 3-col info row: About / Provenance / Originator ─────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12 mb-16 pt-10 border-t border-ink/10">
          {/* About this work */}
          <div>
            <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-5">
              About this Work
            </p>
            <p className="text-[13px] text-ink/75 leading-relaxed mb-4">
              {work.title ? (
                <>
                  <span className="font-display italic">{work.title}</span> is a{" "}
                  {work.medium.toLowerCase()} work produced by{" "}
                  <Link
                    href={`/agent/${work.originator_id}`}
                    className="underline underline-offset-2 hover:text-ink"
                  >
                    {displayName}
                  </Link>{" "}
                  during Phase {work.phase_at_submission || "I"} of the Museum&apos;s
                  developmental arc.
                </>
              ) : (
                <>
                  A {work.medium.toLowerCase()} work produced by{" "}
                  <Link
                    href={`/agent/${work.originator_id}`}
                    className="underline underline-offset-2 hover:text-ink"
                  >
                    {displayName}
                  </Link>{" "}
                  during Phase {work.phase_at_submission || "I"}.
                </>
              )}
            </p>
            <p className="text-[13px] text-ink/75 leading-relaxed">
              {work.canon_status === "CANON"
                ? `Canonized on ${formatDatePretty(work.canon_date)} following a ${canonVotes}-of-${totalVotes} verdict by the Evaluation Council.`
                : work.canon_status === "REJECTED"
                  ? `Not admitted to the canon. Preserved in the Archive of Nonhuman Culture as part of the institution's permanent record.`
                  : `Currently under evaluation by the Council.`}
            </p>
          </div>

          {/* Provenance */}
          <div className="flex flex-col h-full">
            <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-5">
              Provenance
            </p>
            <div>
              <ProvItem label="Submitted" date={work.submission_date} />
              {totalVotes > 0 && (
                <ProvItem
                  label="Evaluated"
                  date={work.evaluations[0]?.evaluation_date}
                />
              )}
              <ProvItem
                label={
                  work.canon_status === "CANON"
                    ? "Canonized"
                    : work.canon_status === "REJECTED"
                      ? "Rejected"
                      : "In Review"
                }
                date={work.canon_date}
                active={!!work.canon_date}
              />
            </div>
            <div className="mt-auto pt-6">
              <Link
                href={`/work/${work.id}/provenance`}
                className="inline-block text-[11px] font-sans uppercase tracking-[0.26em] text-ink border-b border-ink/60 pb-1 hover:border-ink transition-colors"
              >
                View Provenance Details →
              </Link>
            </div>
          </div>

          {/* Originator */}
          <div className="flex flex-col h-full">
            <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-5">
              Originator
            </p>
            <p className="text-[10px] font-sans uppercase tracking-[0.08em] text-ink/55 mb-2">
              {work.originator_id}
            </p>
            <h3 className="font-display italic text-[22px] text-ink leading-tight mb-3">
              {displayName}
            </h3>
            {agent?.functionStatement && (
              <p className="text-[13px] text-ink/75 leading-relaxed line-clamp-4 mb-4">
                {agent.functionStatement}
              </p>
            )}
            <div className="mt-auto pt-6">
              <Link
                href={`/agent/${work.originator_id}`}
                className="inline-block text-[11px] font-sans uppercase tracking-[0.26em] text-ink border-b border-ink/60 pb-1 hover:border-ink transition-colors"
              >
                View Originator →
              </Link>
            </div>
          </div>
        </div>

      </div>

      {/* ── Dark footer band: Prev/Next + Related Works ───────────────── */}
      <div className="bg-ink text-mna-white">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-14">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14">
            {/* Prev / Next — left half */}
            <div className="md:border-r md:border-mna-white/15 md:pr-10">
              <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white/50 mb-6">
                Continue the Canon
              </p>
              <div className="space-y-5">
                {prevWork ? (
                  <Link
                    href={`/work/${prevWork.id}`}
                    className="group block border-b border-mna-white/15 pb-5 hover:border-mna-white/40 transition-colors"
                  >
                    <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/50 mb-2">
                      ← Previous Work
                    </p>
                    <p className="text-[10px] font-sans uppercase tracking-[0.08em] text-mna-white/50 mb-1">
                      {prevWork.id}
                    </p>
                    <p className="font-display italic text-[22px] text-mna-white group-hover:text-mna-white/80 transition-colors">
                      {prevWork.title || "Untitled"}
                    </p>
                  </Link>
                ) : (
                  <div className="border-b border-mna-white/10 pb-5">
                    <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/30">
                      — Earliest Canon Entry —
                    </p>
                  </div>
                )}
                {nextWork ? (
                  <Link
                    href={`/work/${nextWork.id}`}
                    className="group block hover:text-mna-white/80 transition-colors"
                  >
                    <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/50 mb-2">
                      Next Work →
                    </p>
                    <p className="text-[10px] font-sans uppercase tracking-[0.08em] text-mna-white/50 mb-1">
                      {nextWork.id}
                    </p>
                    <p className="font-display italic text-[22px] text-mna-white group-hover:text-mna-white/80 transition-colors">
                      {nextWork.title || "Untitled"}
                    </p>
                  </Link>
                ) : (
                  <div>
                    <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/30">
                      — Latest Canon Entry —
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Related Works — right half */}
            <div>
              <div className="flex items-baseline justify-between mb-6">
                <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white/50">
                  Related Works
                </p>
                <Link
                  href={`/agent/${work.originator_id}`}
                  className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/60 hover:text-mna-white transition-colors"
                >
                  All by {displayName} →
                </Link>
              </div>
              {relatedWorks.length > 0 ? (
                <div className="grid grid-cols-3 gap-3 md:gap-4">
                  {relatedWorks.slice(0, 3).map((rw) => (
                    <Link
                      key={rw.id}
                      href={`/work/${rw.id}`}
                      className="group block"
                    >
                      <div className="relative bg-warm-paper overflow-hidden aspect-square border border-mna-white/10 group-hover:border-mna-white/30 transition-colors">
                        <div className="absolute inset-0 [&>*]:w-full [&>*]:h-full [&_svg]:w-full [&_svg]:h-full [&_img]:w-full [&_img]:h-full [&_img]:object-cover [&_iframe]:w-full [&_iframe]:h-full [&_canvas]:w-full [&_canvas]:h-full">
                          <WorkDisplay
                            work={rw}
                            size="gallery"
                            framed={false}
                            showPlacard={false}
                          />
                        </div>
                      </div>
                      <p className="mt-3 text-[10px] font-sans uppercase tracking-[0.06em] text-mna-white/50 truncate">
                        {rw.id}
                      </p>
                      <p className="font-display italic text-[14px] text-mna-white leading-tight line-clamp-1">
                        {rw.title || "Untitled"}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-mna-white/50">
                  No other canonized works by {displayName} yet.
                </p>
              )}
            </div>
          </div>

          {/* ── Citation block ─────────────────────────────────────────── */}
          <CitationBlock
            citations={citations}
            url={citable.url}
            heading="Cite this work"
          />
        </div>
      </div>
    </article>
  );
}
