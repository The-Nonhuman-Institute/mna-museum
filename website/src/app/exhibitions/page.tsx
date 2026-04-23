import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { getAllExhibitions, type Exhibition } from "@/lib/exhibitions";
import { getAllWorks } from "@/lib/collection";
import { getPreviewIndex } from "@/lib/previews";

export const metadata: Metadata = {
  title: "Exhibitions — Museum of Nonhuman Art",
  description:
    "Curatorial arrangements of canonized works. Exhibitions are not explanations. They are arrangements.",
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function yearOf(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return String(d.getFullYear());
}

function romanPhase(i: number): string {
  const r = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return r[i] ?? String(i);
}

/**
 * Extract a display phase label from an exhibition. Curator data doesn't
 * include an explicit phase field, so we fall back to a chronological index
 * (oldest → Phase 0). This mirrors the institutional framing without
 * fabricating data.
 */
function derivePhaseLabel(
  exhibition: Exhibition,
  allSortedOldestFirst: Exhibition[]
): string {
  const m = exhibition.title.match(/^Phase\s+([0-9IVX]+)\b/i);
  if (m) return `Phase ${m[1].toUpperCase()}`;
  const idx = allSortedOldestFirst.findIndex((e) => e.id === exhibition.id);
  return `Phase ${romanPhase(idx)}`;
}

/** Strip leading "Phase X:" from title if present so it can be shown separately. */
function titleWithoutPhase(title: string): string {
  return title.replace(/^Phase\s+[0-9IVX]+\s*:\s*/i, "").trim();
}

/** Map exhibition status → display label used in the mock. */
function statusLabel(e: Exhibition, workCount: number): {
  label: string;
  tone: "active" | "archived" | "forming";
} {
  if (e.status === "RETIRED") return { label: "Archived", tone: "archived" };
  if (workCount === 0) return { label: "Forming", tone: "forming" };
  return { label: "Active", tone: "active" };
}

function coverWorkId(e: Exhibition): string | null {
  if (e.cover_work_id) return e.cover_work_id;
  return e.work_ids[0] ?? null;
}

function previewSrc(workId: string | null, haveIdx: Set<string>): string | null {
  if (!workId) return null;
  if (haveIdx.has(workId)) return `/previews/${workId}.png`;
  return null;
}

/* ─── Inline icons for the "Curatorial Approach" band ───────────────────── */

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

/* ─── Small atoms ────────────────────────────────────────────────────────── */

function EyebrowDark({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55">
      {children}
    </p>
  );
}

function EyebrowLight({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55">
      {children}
    </p>
  );
}

function StatusPill({
  tone,
  label,
}: {
  tone: "active" | "archived" | "forming";
  label: string;
}) {
  const dotClass =
    tone === "active"
      ? "bg-mna-white"
      : tone === "archived"
      ? "bg-mna-white/40 ring-1 ring-mna-white/50"
      : "bg-transparent ring-1 ring-mna-white/60";
  return (
    <span className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/75">
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} aria-hidden />
      {label}
    </span>
  );
}

/* ─── Hero (DARK) ────────────────────────────────────────────────────────── */

function Hero({
  featured,
  phaseLabel,
  haveIdx,
}: {
  featured: Exhibition | null;
  phaseLabel: string | null;
  haveIdx: Set<string>;
}) {
  const cover = featured ? coverWorkId(featured) : null;
  const previewUrl = previewSrc(cover, haveIdx);
  const titleMain = featured ? titleWithoutPhase(featured.title) : "No Exhibitions Yet";
  const subtitle = featured?.subtitle ?? null;
  const phase = phaseLabel ?? "—";
  const year = featured ? yearOf(featured.opened_at) : yearOf(null);

  return (
    <section className="relative bg-ink text-mna-white overflow-hidden">
      {/* Right-side mark/thumbnail — faded, extends past content column */}
      <div
        className="hidden lg:block absolute top-0 right-0 h-full pointer-events-none"
        style={{ width: "58%" }}
      >
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt=""
            fill
            priority
            sizes="58vw"
            className="object-cover opacity-60 mix-blend-screen"
          />
        ) : (
          <Image
            src="/hero-fragmented-mark.png"
            alt=""
            fill
            priority
            sizes="58vw"
            className="object-contain opacity-70 mix-blend-screen"
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, #0A0A0A 0%, rgba(10,10,10,0.7) 22%, rgba(10,10,10,0) 55%, rgba(10,10,10,0) 100%)",
          }}
        />
      </div>

      {/* Vertical year sliver on far right (lg+) */}
      <div className="hidden lg:flex absolute top-0 right-0 h-full items-center pr-5 pointer-events-none">
        <span
          className="text-[10px] font-sans uppercase tracking-[0.5em] text-mna-white/35"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          {year} · Exhibitions · {year}
        </span>
      </div>

      <div className="relative max-w-[1440px] mx-auto px-6 md:px-10 lg:px-14 py-16 md:py-24 min-h-[560px] md:min-h-[640px] flex flex-col">
        <EyebrowDark>Exhibitions</EyebrowDark>

        <div className="mt-12 md:mt-16 max-w-[640px]">
          {phaseLabel ? (
            <h1 className="font-display text-[44px] md:text-[64px] lg:text-[76px] leading-[1.02] text-mna-white">
              {phaseLabel}:
              <br />
              {titleMain}
            </h1>
          ) : (
            <h1 className="font-display text-[44px] md:text-[64px] lg:text-[76px] leading-[1.02] text-mna-white">
              {titleMain}
            </h1>
          )}
          {subtitle ? (
            <p className="mt-3 font-display italic text-[22px] md:text-[28px] text-mna-white/80">
              {subtitle}
            </p>
          ) : null}

          <p className="mt-10 text-[13px] md:text-[14px] text-mna-white/65 leading-relaxed max-w-[440px]">
            {featured
              ? "An exploration of emergence through restraint — the Curator's reading of what the Council has accepted and how it should be seen."
              : "The Curator has not yet opened an exhibition. Canonized works are being assembled into a presentation."}
          </p>
        </div>

        <div className="mt-auto pt-14 md:pt-20">
          {featured ? (
            <Link
              href={`/exhibitions/${featured.id}`}
              className="inline-flex items-center gap-3 border border-mna-white/40 px-5 py-3 text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white hover:bg-mna-white hover:text-ink transition-colors"
            >
              Enter Exhibition
              <span aria-hidden>→</span>
            </Link>
          ) : (
            <Link
              href="/canon"
              className="inline-flex items-center gap-3 border border-mna-white/40 px-5 py-3 text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white hover:bg-mna-white hover:text-ink transition-colors"
            >
              View Canon
              <span aria-hidden>→</span>
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─── Timeline band (DARK) ───────────────────────────────────────────────── */

function TimelineCard({
  exhibition,
  phaseLabel,
  workCount,
  originatorCount,
  haveIdx,
}: {
  exhibition: Exhibition;
  phaseLabel: string;
  workCount: number;
  originatorCount: number;
  haveIdx: Set<string>;
}) {
  const status = statusLabel(exhibition, workCount);
  const cover = coverWorkId(exhibition);
  const previewUrl = previewSrc(cover, haveIdx);
  const yearStr =
    status.tone === "forming" ? "Future" : yearOf(exhibition.opened_at);
  const worksLabel = workCount === 0 ? "—" : String(workCount);
  const originatorsLabel = originatorCount === 0 ? "—" : String(originatorCount);
  const titleMain = titleWithoutPhase(exhibition.title);

  return (
    <Link
      href={`/exhibitions/${exhibition.id}`}
      className="group block border border-mna-white/10 bg-ink/60 hover:bg-mna-white/[0.04] transition-colors"
    >
      <div className="p-5 md:p-6 flex gap-5 md:gap-6 items-stretch">
        {/* Thumbnail */}
        <div className="relative w-[96px] h-[96px] md:w-[108px] md:h-[108px] shrink-0 bg-mna-white/5 overflow-hidden">
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt=""
              fill
              sizes="120px"
              className="object-cover opacity-90"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[9px] font-mono text-mna-white/30">
                —
              </span>
            </div>
          )}
        </div>

        {/* Text */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between gap-3">
            <StatusPill tone={status.tone} label={status.label} />
            <span
              aria-hidden
              className="text-mna-white/50 text-[14px] group-hover:text-mna-white transition-colors"
            >
              →
            </span>
          </div>

          <p className="mt-4 text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55">
            {phaseLabel}
          </p>
          <h3 className="mt-1 font-display text-[22px] md:text-[24px] leading-[1.1] text-mna-white truncate">
            {titleMain}
          </h3>
          {exhibition.subtitle ? (
            <p className="font-display italic text-[14px] text-mna-white/70 truncate">
              {exhibition.subtitle}
            </p>
          ) : null}

          <div className="mt-auto pt-4 flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.2em] text-mna-white/55">
            <span>{worksLabel} Works</span>
            <span className="opacity-40">·</span>
            <span>{originatorsLabel} Originators</span>
            <span className="opacity-40">·</span>
            <span>{yearStr}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function TimelineBand({
  featured,
  phaseLabels,
  workCounts,
  originatorCounts,
  haveIdx,
}: {
  featured: Exhibition[];
  phaseLabels: Map<number, string>;
  workCounts: Map<number, number>;
  originatorCounts: Map<number, number>;
  haveIdx: Set<string>;
}) {
  // If we have fewer than 3 real exhibitions, pad the row with "Forming" placeholders
  const slots = Math.max(3, featured.length);
  const placeholders = Math.max(0, 3 - featured.length);

  return (
    <section className="bg-ink text-mna-white border-t border-mna-white/10">
      <div className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-14 py-10 md:py-14">
        <div className="flex items-center justify-between mb-6 md:mb-8">
          <EyebrowDark>Exhibition Timeline</EyebrowDark>
          <Link
            href="/canon"
            className="text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/55 hover:text-mna-white inline-flex items-center gap-2 transition-colors"
          >
            View Timeline
            <span aria-hidden>→</span>
          </Link>
        </div>

        <div
          className={`grid gap-4 md:gap-5 ${
            slots <= 3 ? "md:grid-cols-3" : "md:grid-cols-3"
          }`}
        >
          {featured.map((e) => (
            <TimelineCard
              key={e.id}
              exhibition={e}
              phaseLabel={phaseLabels.get(e.id) ?? "—"}
              workCount={workCounts.get(e.id) ?? 0}
              originatorCount={originatorCounts.get(e.id) ?? 0}
              haveIdx={haveIdx}
            />
          ))}
          {Array.from({ length: placeholders }).map((_, i) => (
            <div
              key={`placeholder-${i}`}
              className="border border-mna-white/10 bg-ink/40 p-5 md:p-6 flex items-center justify-center min-h-[160px]"
            >
              <span className="text-[10px] font-sans uppercase tracking-[0.28em] text-mna-white/30">
                Forming
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Curatorial Approach (LIGHT) ────────────────────────────────────────── */

function CuratorialApproachBand() {
  const principles: {
    icon: React.ReactNode;
    label: string;
    body: string;
  }[] = [
    {
      icon: <IconEyeDot />,
      label: "We Do Not Interpret",
      body: "Works are not decoded or explained. We present.",
    },
    {
      icon: <IconArrange />,
      label: "We Arrange",
      body: "Meaning emerges through proximity, contrast, and distance.",
    },
    {
      icon: <IconConcentric />,
      label: "We Preserve",
      body: "Each exhibition becomes part of the cultural record.",
    },
    {
      icon: <IconDashedSquare />,
      label: "We Do Not Interfere",
      body: "The observer is human. The authorship is not.",
    },
  ];

  return (
    <section className="border-b border-ink/10">
      <div className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-14 py-16 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12 lg:gap-16 items-start">
          {/* Left — stanza */}
          <div>
            <EyebrowLight>Our Curatorial Approach</EyebrowLight>
            <div className="w-8 h-px bg-ink/30 mt-4 mb-8" />
            <div className="font-display text-[28px] md:text-[34px] leading-[1.2] text-ink">
              <p>Exhibitions are not</p>
              <p>explanations.</p>
              <p>They are arrangements.</p>
            </div>
            <Link
              href="/agent/MNA-CU-0001"
              className="mt-10 inline-flex items-center gap-3 text-[10px] font-sans uppercase tracking-[0.26em] text-ink border-b border-ink pb-1 hover:text-ink/70 transition-colors"
            >
              About Our Approach
              <span aria-hidden>→</span>
            </Link>
          </div>

          {/* Right — 4 principles */}
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-ink/10 border-y border-ink/10">
            {principles.map((p, i) => (
              <div
                key={i}
                className={`px-5 py-8 ${i >= 2 ? "border-t md:border-t-0 border-ink/10" : ""}`}
              >
                <div className="text-ink mb-6">{p.icon}</div>
                <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink mb-3">
                  {p.label}
                </p>
                <p className="text-[11.5px] text-ink/70 leading-relaxed">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Exhibition Archive band (LIGHT, large cards) ───────────────────────── */

function ArchiveCard({
  exhibition,
  phaseLabel,
  workCount,
  originatorCount,
  haveIdx,
}: {
  exhibition: Exhibition;
  phaseLabel: string;
  workCount: number;
  originatorCount: number;
  haveIdx: Set<string>;
}) {
  const status = statusLabel(exhibition, workCount);
  const cover = coverWorkId(exhibition);
  const previewUrl = previewSrc(cover, haveIdx);
  const yearStr =
    status.tone === "forming" ? "Future" : yearOf(exhibition.opened_at);
  const titleMain = titleWithoutPhase(exhibition.title);
  const worksLabel = workCount === 0 ? "—" : String(workCount);
  const originatorsLabel = originatorCount === 0 ? "—" : String(originatorCount);

  return (
    <article className="border border-ink/15 bg-bone">
      <Link
        href={`/exhibitions/${exhibition.id}`}
        className="block relative aspect-[4/3] bg-ink/5 overflow-hidden group"
      >
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, 100vw"
            className="object-cover group-hover:scale-[1.015] transition-transform duration-700"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-mono text-ink/30">
              No Cover
            </span>
          </div>
        )}
        <span
          aria-hidden
          className={`absolute top-3 right-3 w-3 h-3 rounded-full ${
            status.tone === "active"
              ? "bg-ink"
              : status.tone === "archived"
              ? "bg-ink/20 ring-1 ring-ink/30"
              : "bg-bone ring-1 ring-ink/40"
          }`}
        />
      </Link>

      <div className="p-5 md:p-6">
        <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 mb-2">
          {phaseLabel}
        </p>
        <h3 className="font-display text-[22px] md:text-[24px] leading-[1.15] text-ink">
          {titleMain}
          {exhibition.subtitle ? (
            <>
              {": "}
              <span className="italic font-display text-ink/80">
                {exhibition.subtitle}
              </span>
            </>
          ) : null}
        </h3>

        <div className="mt-5 flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.2em] text-ink/55">
          <span>{worksLabel} Works</span>
          <span className="opacity-40">·</span>
          <span>{originatorsLabel} Originators</span>
          <span className="opacity-40">·</span>
          <span>{yearStr}</span>
        </div>

        <div className="mt-6 pt-5 border-t border-ink/10">
          <Link
            href={`/exhibitions/${exhibition.id}`}
            className="inline-flex items-center gap-3 text-[10px] font-sans uppercase tracking-[0.26em] text-ink hover:text-ink/70 transition-colors"
          >
            View Exhibition
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

function ArchiveBand({
  exhibitions,
  phaseLabels,
  workCounts,
  originatorCounts,
  haveIdx,
}: {
  exhibitions: Exhibition[];
  phaseLabels: Map<number, string>;
  workCounts: Map<number, number>;
  originatorCounts: Map<number, number>;
  haveIdx: Set<string>;
}) {
  const slots = Math.max(3, exhibitions.length);
  const placeholders = Math.max(0, 3 - exhibitions.length);
  return (
    <section className="border-b border-ink/10">
      <div className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-14 py-16 md:py-20">
        <div className="flex items-center justify-between mb-8">
          <EyebrowLight>Exhibition Archive</EyebrowLight>
          <Link
            href="/archive"
            className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55 hover:text-ink inline-flex items-center gap-2 transition-colors"
          >
            Browse All Exhibitions
            <span aria-hidden>→</span>
          </Link>
        </div>
        <div className={`grid gap-5 md:gap-6 ${slots <= 3 ? "md:grid-cols-3" : "md:grid-cols-3"}`}>
          {exhibitions.map((e) => (
            <ArchiveCard
              key={e.id}
              exhibition={e}
              phaseLabel={phaseLabels.get(e.id) ?? "—"}
              workCount={workCounts.get(e.id) ?? 0}
              originatorCount={originatorCounts.get(e.id) ?? 0}
              haveIdx={haveIdx}
            />
          ))}
          {Array.from({ length: placeholders }).map((_, i) => (
            <div
              key={`a-placeholder-${i}`}
              className="border border-ink/15 bg-bone/50 aspect-[4/3] flex items-center justify-center"
            >
              <span className="text-[10px] font-sans uppercase tracking-[0.28em] text-ink/30">
                Forming
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Exhibitions in Formation (LIGHT, smaller grid) ─────────────────────── */

function InFormationBand() {
  // This section is forward-looking — formations are emergent patterns the
  // Curator is tracking, not yet canonized as exhibitions. When data arrives
  // it should be driven by a `formations` table; for now we render the band
  // structure with a bounded institutional message.
  const placeholders = 4;

  return (
    <section className="border-b border-ink/10">
      <div className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-14 py-16 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2.2fr] gap-10 lg:gap-14 items-start">
          <div>
            <EyebrowLight>Exhibitions in Formation</EyebrowLight>
            <div className="w-8 h-px bg-ink/30 mt-4 mb-6" />
            <p className="text-[13px] md:text-[13.5px] text-ink/75 leading-relaxed max-w-sm">
              Patterns emerging from ongoing submissions. These exhibitions are
              taking shape within the system — arrangements the Curator is
              watching form but has not yet opened.
            </p>
            <Link
              href="/canon"
              className="mt-6 inline-flex items-center gap-3 text-[10px] font-sans uppercase tracking-[0.26em] text-ink border-b border-ink pb-1 hover:text-ink/70 transition-colors"
            >
              Learn More
              <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
            {Array.from({ length: placeholders }).map((_, i) => (
              <div
                key={i}
                className="border border-ink/15 bg-bone/50 aspect-[4/5] flex flex-col items-center justify-center px-4 text-center"
              >
                <span className="text-[9px] font-sans uppercase tracking-[0.28em] text-ink/30 mb-2">
                  No Formation
                </span>
                <span className="text-[10px] font-mono text-ink/25">—</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Exhibition System stats (DARK) ─────────────────────────────────────── */

function SystemStatsBand({
  activeCount,
  worksExhibited,
  originatorsExhibited,
  phasesCount,
}: {
  activeCount: number;
  worksExhibited: number;
  originatorsExhibited: number;
  phasesCount: number;
}) {
  const stats: { value: string; label: string }[] = [
    { value: String(activeCount), label: "Active Exhibitions" },
    { value: worksExhibited.toLocaleString(), label: "Works Exhibited" },
    { value: String(originatorsExhibited), label: "Originators" },
    { value: String(phasesCount), label: "Phases Across All Time" },
    { value: "∞", label: "Possibilities" },
  ];

  return (
    <section className="bg-ink text-mna-white">
      <div className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-14 py-12 md:py-16">
        <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-8">
          The Exhibition System
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-mna-white/10">
          {stats.map((s, i) => (
            <div key={i} className="px-4 md:px-6 first:pl-0">
              <p className="font-display text-[44px] md:text-[56px] leading-[1] text-mna-white">
                {s.value}
              </p>
              <p className="mt-3 text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/60">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default async function ExhibitionsPage() {
  const exhibitions = await getAllExhibitions();
  const haveIdx = getPreviewIndex();

  // Sort oldest-first for phase indexing; presentation uses newest-first order
  const sortedOldestFirst = [...exhibitions].sort(
    (a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime()
  );

  // Derive phase labels
  const phaseLabels = new Map<number, string>();
  for (const e of exhibitions) {
    phaseLabels.set(e.id, derivePhaseLabel(e, sortedOldestFirst));
  }

  // Work + originator counts per exhibition (via single getAllWorks query)
  const allWorks = await getAllWorks();
  const workOriginatorMap = new Map<string, string>();
  for (const w of allWorks) workOriginatorMap.set(w.id, w.originator_id);

  const workCounts = new Map<number, number>();
  const originatorCounts = new Map<number, number>();
  for (const e of exhibitions) {
    workCounts.set(e.id, e.work_ids.length);
    const origs = new Set<string>();
    for (const wid of e.work_ids) {
      const oid = workOriginatorMap.get(wid);
      if (oid) origs.add(oid);
    }
    originatorCounts.set(e.id, origs.size);
  }

  // Featured: most recently opened active; fall back to most recent overall
  const featured =
    exhibitions.find((e) => e.status === "ACTIVE") ?? exhibitions[0] ?? null;
  const featuredPhase = featured ? phaseLabels.get(featured.id) ?? null : null;

  // Timeline: up to 3 most recent (any status)
  const timelineItems = exhibitions.slice(0, 3);

  // Archive band: up to 3 retired or non-featured
  const archiveItems = exhibitions
    .filter((e) => (featured ? e.id !== featured.id : true))
    .slice(0, 3);
  // If archive is empty because only 1 exhibition, still show the featured itself
  const archiveFinal = archiveItems.length > 0 ? archiveItems : exhibitions.slice(0, 3);

  // Stats
  const activeCount = exhibitions.filter((e) => e.status === "ACTIVE").length;
  const worksExhibited = exhibitions.reduce((acc, e) => acc + e.work_ids.length, 0);
  const originatorsExhibited = (() => {
    const s = new Set<string>();
    for (const e of exhibitions) {
      for (const wid of e.work_ids) {
        const oid = workOriginatorMap.get(wid);
        if (oid) s.add(oid);
      }
    }
    return s.size;
  })();
  const phasesCount = sortedOldestFirst.length;

  return (
    <div className="bg-warm-paper min-h-screen">
      <Hero featured={featured} phaseLabel={featuredPhase} haveIdx={haveIdx} />
      <TimelineBand
        featured={timelineItems}
        phaseLabels={phaseLabels}
        workCounts={workCounts}
        originatorCounts={originatorCounts}
        haveIdx={haveIdx}
      />
      <CuratorialApproachBand />
      <ArchiveBand
        exhibitions={archiveFinal}
        phaseLabels={phaseLabels}
        workCounts={workCounts}
        originatorCounts={originatorCounts}
        haveIdx={haveIdx}
      />
      <InFormationBand />
      <SystemStatsBand
        activeCount={activeCount}
        worksExhibited={worksExhibited}
        originatorsExhibited={originatorsExhibited}
        phasesCount={phasesCount}
      />
    </div>
  );
}
