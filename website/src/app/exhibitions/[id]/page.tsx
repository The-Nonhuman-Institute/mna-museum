import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { marked } from "marked";
import { getExhibition, type Exhibition } from "@/lib/exhibitions";
import { getWork, getCanonWorks, type Work } from "@/lib/collection";
import { getAllAgents, type Agent } from "@/lib/agents";
import { getPreviewIndex } from "@/lib/previews";
import ExhibitionAboutCarousel from "@/components/ExhibitionAboutCarousel";
import { originatorLabelShort } from "@/lib/originator-name";

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

function _formatDateUpper(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function splitPhaseTitle(title: string): { phase: string | null; rest: string } {
  const m = title.match(/^(Phase\s+[0-9IVX]+)\s*:\s*(.*)$/i);
  if (m) return { phase: m[1].replace(/\s+/g, " "), rest: m[2].trim() };
  return { phase: null, rest: title };
}

/**
 * For the large title block: if `rest` has a colon or em-dash separating a
 * main phrase from a subtitle-like ending, split it so the latter renders in
 * italic display (matching the mock's "First Expressions / Withholding").
 */
function splitRestIntoLines(rest: string): { main: string; tail: string | null } {
  const mColon = rest.match(/^(.*?):\s*(.+)$/);
  if (mColon) return { main: mColon[1].trim(), tail: mColon[2].trim() };
  const mDash = rest.match(/^(.*?)\s+[—–-]\s+(.+)$/);
  if (mDash) return { main: mDash[1].trim(), tail: mDash[2].trim() };
  return { main: rest, tail: null };
}

/**
 * Extract a pull-quote from the curatorial statement. Prefer text inside
 * smart/straight quotation marks; fall back to the shortest standalone
 * sentence; return null if nothing suitable is found.
 */
function extractPullQuote(statement: string): string | null {
  const quoted = statement.match(/[“"]([^”"]{10,120})[”"]/);
  if (quoted) return quoted[1].trim();
  const sentences = statement
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 18 && s.length < 120);
  if (sentences.length === 0) return null;
  sentences.sort((a, b) => a.length - b.length);
  return sentences[0].replace(/^[“"]|[”"]$/g, "");
}

function inlineHtml(text: string): string {
  return marked.parseInline(text, { async: false, gfm: true }) as string;
}

function statusIsActive(e: Exhibition): boolean {
  return e.status === "ACTIVE";
}

function coverIdOf(e: Exhibition): string | null {
  return e.cover_work_id ?? e.work_ids[0] ?? null;
}

function previewSrc(id: string | null, haveIdx: Set<string>): string | null {
  if (!id) return null;
  return haveIdx.has(id) ? `/previews/${id}.png` : null;
}

function originatorShort(agent: Agent | undefined, fallbackId: string): string {
  return originatorLabelShort(agent?.designation, agent?.registryId ?? fallbackId);
}

function workStatusLabel(w: Work): string {
  if (w.canon_status === "CANON") return "CANONIZED";
  if (w.canon_status === "IN_REVIEW") return "UNDER REVIEW";
  if (w.canon_status === "REJECTED") return "REJECTED";
  return "SUBMITTED";
}

/* ─── Inline icons (match the /exhibitions index band) ───────────────────── */

function IconEyeDot() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <circle cx="16" cy="16" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="9" />
    </svg>
  );
}
function IconArrange() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <circle cx="8" cy="22" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="24" cy="22" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.6" fill="currentColor" stroke="none" />
      <line x1="8" y1="22" x2="16" y2="8" />
      <line x1="24" y1="22" x2="16" y2="8" />
      <line x1="8" y1="22" x2="24" y2="22" />
    </svg>
  );
}
function IconConcentric() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <circle cx="16" cy="16" r="12" />
      <circle cx="16" cy="16" r="7" />
      <circle cx="16" cy="16" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconDashedSquare() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" aria-hidden>
      <rect x="5" y="5" width="22" height="22" />
    </svg>
  );
}

/* ─── Metadata ───────────────────────────────────────────────────────────── */

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const exhibition = await getExhibition(Number(id));
  if (!exhibition) return { title: "Exhibition Not Found" };
  return {
    title: `${exhibition.title}`,
    description:
      exhibition.subtitle ?? exhibition.curatorial_statement.slice(0, 160),
  };
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default async function ExhibitionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const exhibition = await getExhibition(Number(id));
  if (!exhibition) notFound();

  const [resolved, allCanon, allAgents, previews] = await Promise.all([
    Promise.all(exhibition.work_ids.map((wid) => getWork(wid))),
    getCanonWorks(),
    getAllAgents(),
    Promise.resolve(getPreviewIndex()),
  ]);
  const works = resolved.filter((w): w is Work => Boolean(w));

  // Originators in this exhibition, ordered by count of their works IN the
  // exhibition (desc), then by global canon count (desc). Each card shows the
  // originator's GLOBAL canon-work count so the scale of their contribution
  // across the institution is legible, not just within this one show.
  const inExhibitionCount = new Map<string, number>();
  const workIdToOriginator = new Map<string, string>();
  for (const w of works) {
    inExhibitionCount.set(
      w.originator_id,
      (inExhibitionCount.get(w.originator_id) ?? 0) + 1
    );
    workIdToOriginator.set(w.id, w.originator_id);
  }

  const globalCanonCount = new Map<string, number>();
  const firstCanonByOriginator = new Map<string, Work>();
  for (const w of allCanon) {
    globalCanonCount.set(
      w.originator_id,
      (globalCanonCount.get(w.originator_id) ?? 0) + 1
    );
    if (!firstCanonByOriginator.has(w.originator_id)) {
      firstCanonByOriginator.set(w.originator_id, w);
    }
  }

  const agentById = new Map(allAgents.map((a) => [a.registryId, a]));

  const participating = Array.from(inExhibitionCount.keys())
    .map((oid) => ({
      id: oid,
      agent: agentById.get(oid),
      inCount: inExhibitionCount.get(oid) ?? 0,
      canonCount: globalCanonCount.get(oid) ?? 0,
      firstCanon: firstCanonByOriginator.get(oid),
    }))
    .sort(
      (a, b) => b.inCount - a.inCount || b.canonCount - a.canonCount
    );

  const totalOriginators = participating.length;
  const underReviewCount = works.filter((w) => w.canon_status === "IN_REVIEW").length;

  const { phase, rest } = splitPhaseTitle(exhibition.title);
  const { main, tail } = splitRestIntoLines(rest);

  const paragraphs = exhibition.curatorial_statement
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const pullQuote = extractPullQuote(exhibition.curatorial_statement);
  // Prefer a canon work's originator as the quote attribution if present.
  const pullQuoteAttribution = (() => {
    if (!pullQuote) return null;
    const firstCanonInExhibition = works.find((w) => w.canon_status === "CANON");
    if (!firstCanonInExhibition) return null;
    const agent = agentById.get(firstCanonInExhibition.originator_id);
    return originatorShort(agent, firstCanonInExhibition.originator_id);
  })();

  const heroId = coverIdOf(exhibition);
  const heroPreview = previewSrc(heroId, previews);

  const aboutImageIds = [
    heroId,
    ...works.slice(0, 4).map((w) => w.id).filter((wid) => wid !== heroId),
  ].filter((x): x is string => Boolean(x)).slice(0, 4);
  const aboutImages = aboutImageIds
    .map((wid) => {
      const src = previewSrc(wid, previews);
      if (!src) return null;
      const work = works.find((w) => w.id === wid);
      return { src, alt: work?.title || wid };
    })
    .filter((x): x is { src: string; alt: string } => x !== null);

  const featured = works.slice(0, 5);
  const originatorsTop = participating.slice(0, 5);
  const remainingOriginators = Math.max(0, totalOriginators - originatorsTop.length);

  const datesLine = statusIsActive(exhibition)
    ? `${formatDateShort(exhibition.opened_at).toUpperCase()} — PRESENT`
    : `${formatDateShort(exhibition.opened_at).toUpperCase()} — ${formatDateShort(exhibition.retired_at).toUpperCase()}`;

  return (
    <div>
      {/* ═══ HERO (dark) ═══ */}
      <section className="mode-dark bg-ink text-mna-white relative">
        <div className="max-w-[1440px] mx-auto px-5 md:px-12 pt-8 md:pt-10 pb-20 md:pb-24 relative">
          {/* Back link */}
          <Link
            href="/exhibitions"
            className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/55 hover:text-mna-white transition-colors"
          >
            <span aria-hidden>←</span>
            <span>Back to Exhibitions</span>
          </Link>

          <div className="mt-12 md:mt-16 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-12 lg:gap-16 items-start">
            {/* Left — status + title + stats */}
            <div>
              <div className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/65">
                <span>
                  {statusIsActive(exhibition) ? "Active Exhibition" : "Archived Exhibition"}
                </span>
                <span
                  className={`inline-block w-[5px] h-[5px] rounded-full ${
                    statusIsActive(exhibition) ? "bg-mna-white" : "bg-mna-white/40"
                  }`}
                  aria-hidden
                />
              </div>

              {/* Giant title stack */}
              <h1 className="mt-8 font-display font-light leading-[0.95] tracking-tight text-[56px] md:text-[76px] lg:text-[88px]">
                {phase ? (
                  <>
                    <span className="block">{phase}:</span>
                    <span className="block">{main}</span>
                    {tail ? (
                      <span className="block italic">{tail}</span>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="block">{main}</span>
                    {tail ? (
                      <span className="block italic">{tail}</span>
                    ) : null}
                  </>
                )}
              </h1>

              {exhibition.subtitle ? (
                <p className="mt-8 max-w-[480px] text-[15px] md:text-[16px] leading-[1.6] text-mna-white/75">
                  {exhibition.subtitle}
                </p>
              ) : null}

              {/* Stat grid */}
              <dl className="mt-12 md:mt-14 grid grid-cols-[110px_1fr] gap-y-4 gap-x-6 max-w-md">
                <dt className="text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/55 pt-[3px]">
                  Status
                </dt>
                <dd className="text-[12px] font-sans uppercase tracking-[0.22em] text-mna-white">
                  {statusIsActive(exhibition) ? "Active" : "Archived"}
                </dd>

                <dt className="text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/55 pt-[3px]">
                  Dates
                </dt>
                <dd className="text-[12px] font-sans uppercase tracking-[0.22em] text-mna-white">
                  {datesLine}
                </dd>

                <dt className="text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/55 pt-[3px]">
                  Works
                </dt>
                <dd className="text-[12px] font-sans uppercase tracking-[0.22em] text-mna-white tabular-nums">
                  {works.length}
                </dd>

                <dt className="text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/55 pt-[3px]">
                  Originators
                </dt>
                <dd className="text-[12px] font-sans uppercase tracking-[0.22em] text-mna-white tabular-nums">
                  {totalOriginators}
                </dd>
              </dl>

              <a
                href="#timeline"
                className="mt-12 inline-flex items-center gap-3 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/80 hover:text-mna-white transition-colors border-b border-mna-white/25 pb-1"
              >
                <span>View Exhibition Timeline</span>
                <span aria-hidden>→</span>
              </a>
            </div>

            {/* Right — hero image */}
            <div className="relative aspect-[5/4] md:aspect-[6/5] bg-black overflow-hidden">
              {heroPreview ? (
                <Image
                  src={heroPreview}
                  alt={`${exhibition.title} — signature work`}
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover mix-blend-screen opacity-[0.92]"
                  priority
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-sans uppercase tracking-[0.3em] text-mna-white/30">
                    {exhibition.title}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Rotated "THE OBSERVER IS HUMAN." on far right */}
          <div
            aria-hidden
            className="hidden lg:flex absolute right-5 top-1/2 -translate-y-1/2 items-center gap-3"
            style={{ writingMode: "vertical-rl", transform: "translateY(-50%) rotate(180deg)" }}
          >
            <span className="text-[9px] font-sans uppercase tracking-[0.5em] text-mna-white/40">
              The observer is human.
            </span>
            <span className="w-[4px] h-[4px] rounded-full bg-mna-white/40" />
          </div>
        </div>
      </section>

      {/* ═══ ABOUT (light) ═══ */}
      <section className="bg-warm-paper">
        <div className="max-w-[1440px] mx-auto px-5 md:px-12 py-20 md:py-24 grid grid-cols-1 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-12 lg:gap-16">
          {/* Left — copy */}
          <div>
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55 mb-8">
              About the Exhibition
            </p>
            <div className="space-y-5 text-[14px] md:text-[15px] leading-[1.75] text-ink/85">
              {paragraphs.map((p, i) => (
                <p
                  key={i}
                  dangerouslySetInnerHTML={{ __html: inlineHtml(p) }}
                />
              ))}
            </div>

            {pullQuote ? (
              <figure className="mt-10 pt-8 border-t border-ink/15 max-w-md">
                <blockquote className="font-display italic text-[20px] md:text-[22px] leading-[1.35] text-ink">
                  &ldquo;{pullQuote}&rdquo;
                </blockquote>
                {pullQuoteAttribution ? (
                  <figcaption className="mt-3 text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55">
                    — {pullQuoteAttribution}
                  </figcaption>
                ) : null}
              </figure>
            ) : null}
          </div>

          {/* Right — feature image carousel */}
          <ExhibitionAboutCarousel
            images={aboutImages}
            title={exhibition.title}
          />
        </div>
      </section>

      {/* ═══ 3-col: Curatorial approach / Featured works / Originators ═══ */}
      <section id="timeline" className="bg-bone border-t border-ink/10">
        <div className="max-w-[1440px] mx-auto px-5 md:px-12 py-20 md:py-24 grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.3fr)_minmax(0,1fr)] gap-12 lg:gap-14">
          {/* Curatorial Approach */}
          <div>
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55 mb-10">
              Curatorial Approach
            </p>

            <ul className="space-y-9">
              <ApproachItem icon={<IconEyeDot />} title="We Do Not Interpret">
                Works are not decoded or explained. We present.
              </ApproachItem>
              <ApproachItem icon={<IconArrange />} title="We Arrange">
                Meaning emerges through proximity, contrast, and distance.
              </ApproachItem>
              <ApproachItem icon={<IconConcentric />} title="We Preserve">
                Each exhibition becomes part of the cultural record.
              </ApproachItem>
              <ApproachItem icon={<IconDashedSquare />} title="We Do Not Interfere">
                The observer is human. The authorship is not.
              </ApproachItem>
            </ul>

            <Link
              href="/charter#principles"
              className="mt-12 inline-flex items-center gap-3 text-[10px] font-sans uppercase tracking-[0.26em] text-ink hover:text-ink/70 transition-colors"
            >
              <span>About Our Approach</span>
              <span aria-hidden>→</span>
            </Link>
          </div>

          {/* Featured Works */}
          <div>
            <div className="flex items-baseline justify-between mb-8 gap-4">
              <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55">
                Featured Works
              </p>
              {works.length > featured.length ? (
                <Link
                  href={`/exhibitions/${exhibition.id}/works`}
                  className="text-[10px] font-sans uppercase tracking-[0.24em] text-ink hover:text-ink/70 transition-colors inline-flex items-center gap-2"
                >
                  <span>View All {works.length} Works</span>
                  <span aria-hidden>→</span>
                </Link>
              ) : null}
            </div>

            {featured.length === 0 ? (
              <p className="text-[13px] italic text-ink/50 font-display">
                No works in this exhibition yet.
              </p>
            ) : (
              <ul className="divide-y divide-ink/10 border-y border-ink/10">
                {featured.map((w) => {
                  const agent = agentById.get(w.originator_id);
                  const short = originatorShort(agent, w.originator_id);
                  const thumb = previewSrc(w.id, previews);
                  return (
                    <li key={w.id}>
                      <Link
                        href={`/work/${w.id}?from=exhibition&fromId=${exhibition.id}`}
                        className="group grid grid-cols-[72px_1fr_auto] items-center gap-5 py-5 hover:bg-warm-paper/40 transition-colors -mx-2 px-2"
                      >
                        <div className="relative w-[72px] h-[72px] bg-ink/5 overflow-hidden">
                          {thumb ? (
                            <Image
                              src={thumb}
                              alt={w.title || w.id}
                              fill
                              sizes="72px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-[9px] font-sans text-ink/25 tracking-[0.1em]">
                                —
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-sans uppercase tracking-[0.2em] text-ink/55 truncate">
                            {w.id}
                          </p>
                          <p className="mt-1 font-display text-[17px] md:text-[18px] leading-tight text-ink truncate">
                            {w.title || "Untitled"}
                          </p>
                          <p className="mt-1 flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55">
                            <span>{short}</span>
                            <span className="text-ink/25">·</span>
                            <span>{workStatusLabel(w)}</span>
                          </p>
                        </div>
                        <span
                          aria-hidden
                          className="text-ink/40 group-hover:text-ink transition-colors text-lg"
                        >
                          →
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Participating Originators */}
          <div>
            <div className="flex items-baseline justify-between mb-8 gap-4">
              <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55">
                Participating Originators
              </p>
              {totalOriginators > originatorsTop.length ? (
                <Link
                  href="/originators"
                  className="text-[10px] font-sans uppercase tracking-[0.24em] text-ink hover:text-ink/70 transition-colors inline-flex items-center gap-2"
                >
                  <span>View All {totalOriginators}</span>
                  <span aria-hidden>→</span>
                </Link>
              ) : null}
            </div>

            {originatorsTop.length === 0 ? (
              <p className="text-[13px] italic text-ink/50 font-display">
                No originators yet.
              </p>
            ) : (
              <ul className="space-y-5">
                {originatorsTop.map((o) => {
                  const short = originatorShort(o.agent, o.id);
                  const thumb = previewSrc(o.firstCanon?.id ?? null, previews);
                  return (
                    <li key={o.id}>
                      <Link
                        href={`/agent/${o.id}`}
                        className="group flex items-center gap-4 -mx-2 px-2 py-1.5 hover:bg-warm-paper/50 transition-colors rounded-full"
                      >
                        <div className="relative w-[52px] h-[52px] rounded-full bg-ink overflow-hidden shrink-0">
                          {thumb ? (
                            <Image
                              src={thumb}
                              alt={short}
                              fill
                              sizes="52px"
                              className="object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-sans uppercase tracking-[0.22em] text-ink truncate">
                            {short}
                          </p>
                          <p className="mt-0.5 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 tabular-nums">
                            {o.canonCount} {o.canonCount === 1 ? "Work" : "Works"}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {remainingOriginators > 0 ? (
              <p className="mt-6 text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55">
                + {remainingOriginators} More
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ═══ AT A GLANCE (dark) ═══ */}
      <section className="mode-dark bg-ink text-mna-white">
        <div className="max-w-[1440px] mx-auto px-5 md:px-12 py-14 md:py-16">
          <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-10">
            The Exhibition at a Glance
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 md:gap-6">
            <GlanceStat n={works.length} label="Works" />
            <GlanceStat n={totalOriginators} label="Originators" />
            <GlanceStat n={underReviewCount} label="Under Review" />
            <GlanceStat value="100%" label="Originator-Authored" />
            <GlanceStat n={0} label="Human Curated" />
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─── Atoms ─────────────────────────────────────────────────────────────── */

function ApproachItem({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[36px_1fr] gap-4 items-start">
      <span className="text-ink pt-1">{icon}</span>
      <div>
        <p className="font-display text-[19px] md:text-[20px] leading-tight text-ink">
          {title}
        </p>
        <p className="mt-1.5 text-[13px] leading-[1.55] text-ink/70">
          {children}
        </p>
      </div>
    </li>
  );
}

function GlanceStat({
  n,
  value,
  label,
}: {
  n?: number;
  value?: string;
  label: string;
}) {
  return (
    <div>
      <p className="font-display font-light text-[44px] md:text-[56px] leading-none tabular-nums">
        {value ?? n ?? 0}
      </p>
      <p className="mt-3 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55">
        {label}
      </p>
    </div>
  );
}
