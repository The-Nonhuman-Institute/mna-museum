"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import MNAGlyph, { type GlyphFamily } from "@/components/MNAGlyph";
import CiteButton from "@/components/CiteButton";

/* ─── Props from server ────────────────────────────────────────────────── */

interface StandardClientProps {
  meta: {
    id: string;
    title: string;
    classification: string;
    glyphFamily: GlyphFamily;
    /** Optional override for the procedural-glyph seed. Defaults to
     *  `meta.id`. Agent constitutions pass `${registryId}::${constitutionRef}`
     *  so the constitution page and PDF cover render the exact same
     *  glyph as the agent's profile sidebar (which uses AgentSignature). */
    glyphSeed?: string;
  };
  fields: {
    documentReference: string;
    classification: string;
    version: string;
    ratified?: string;
    prepared?: string;
    supersedes?: string;
    subordinateTo?: string;
    registrationDate?: string;
  };
  epigraph: string;
  subtitle: string;
  tabs: {
    label: string;
    sections: {
      num: string;
      title: string;
      slug: string;
      toc: { num: string; title: string; slug: string }[];
      bodyHtml: string;
    }[];
  }[];
  siblings: {
    prev: { id: string; title: string; href: string } | null;
    next: { id: string; title: string; href: string } | null;
  };
  /** Optional overrides — let agent constitutions reuse the template
   *  with their own back/index/PDF URLs. Defaults match the
   *  /standards/[id] surface. */
  backHref?: string;
  backLabel?: string;
  pdfHref?: string;
  indexHref?: string;
  indexLabel?: string;
}

/* ─── Component ────────────────────────────────────────────────────────── */

export default function StandardClient({
  meta,
  fields,
  subtitle,
  tabs,
  siblings,
  backHref = "/standards",
  backLabel = "Back to Institution",
  pdfHref,
  indexHref = "/standards",
  indexLabel = "View All Standards",
}: StandardClientProps) {
  const resolvedPdfHref = pdfHref ?? `/standards/${meta.id}.pdf`;
  const [activeTab, setActiveTab] = useState(0);
  const [activeSection, setActiveSection] = useState<string>("");
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  const currentTab = tabs[activeTab];
  const currentSections = currentTab?.sections ?? [];

  /* Cross-tab navigation helpers — clicking a section in the on-page TOC
     of a section that lives in a different tab should switch tabs. */
  const sectionToTabIndex = useMemo(() => {
    const map = new Map<string, number>();
    tabs.forEach((tab, i) => {
      for (const s of tab.sections) map.set(s.slug, i);
    });
    return map;
  }, [tabs]);

  /* Scroll-spy: observe the currently rendered sections and highlight the
     closest one as the user scrolls. */
  useEffect(() => {
    if (!currentSections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top
          );
        if (visible[0]) {
          const id = visible[0].target.getAttribute("data-slug") || "";
          if (id) setActiveSection(id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 }
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [currentSections, activeTab]);

  /* Reset active section when tab switches, and scroll to top of section
     content. */
  useEffect(() => {
    if (currentSections[0]) setActiveSection(currentSections[0].slug);
  }, [activeTab, currentSections]);

  return (
    <article className="min-h-screen">
      {/* ───── Hero (dark) ───── */}
      <header className="relative bg-ink text-mna-white border-b border-mna-white/10 overflow-hidden">
        {/* Vertical rail caption on the right edge */}
        <div
          className="hidden lg:flex absolute top-1/2 -translate-y-1/2 right-4 xl:right-6 items-center pointer-events-none"
          style={{ writingMode: "vertical-rl" }}
        >
          <span className="text-[10px] tracking-[0.4em] uppercase text-mna-white/45 font-sans whitespace-nowrap">
            The observer is human.
          </span>
        </div>

        <div className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-12 pt-8 pb-14 md:pb-20">
          {/* Back link */}
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 hover:text-mna-white transition-colors mb-12 md:mb-16"
          >
            <span aria-hidden>←</span>
            <span>{backLabel}</span>
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            {/* Left: title + subtitle + meta table */}
            <div className="lg:col-span-7 min-w-0">
              <div className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/65 mb-6">
                <span>{meta.classification}</span>
                <span className="inline-block w-[5px] h-[5px] rounded-full bg-mna-white" />
              </div>
              <h1 className="font-display font-light leading-[1.05] tracking-tight text-[40px] md:text-[56px] lg:text-[64px] mb-6">
                {meta.id}:
                <br />
                {meta.title}
              </h1>
              <p className="text-[14px] md:text-[15px] leading-[1.7] text-mna-white/70 max-w-xl mb-12">
                {subtitle}
              </p>

              <dl className="grid grid-cols-[max-content_1fr] gap-x-10 gap-y-3 text-[12px] font-sans">
                <MetaRow label="Document Type" value={inferDocumentType(meta.classification)} />
                <MetaRow label="Classification" value={fields.classification} />
                <MetaRow label="Version" value={fields.version} />
                {fields.ratified ? (
                  <MetaRow label="Ratified" value={fields.ratified} />
                ) : fields.prepared ? (
                  <MetaRow label="Prepared" value={fields.prepared} />
                ) : null}
                {fields.supersedes ? (
                  <MetaRow label="Supercedes" value={fields.supersedes} />
                ) : null}
                {fields.subordinateTo ? (
                  <MetaRow label="Subordinate to" value={fields.subordinateTo} />
                ) : null}
              </dl>
            </div>

            {/* Right: blueprint hero */}
            <div className="lg:col-span-5 relative w-full aspect-square max-w-[480px] lg:max-w-none lg:ml-auto">
              <BlueprintHero family={meta.glyphFamily} seed={meta.glyphSeed ?? meta.id} />
            </div>
          </div>
        </div>
      </header>

      {/* ───── Tabs + download (sticky) ───── */}
      <div className="bg-warm-paper text-ink border-b border-ink/10 sticky top-[72px] z-20">
        <div className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-12 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-7 overflow-x-auto no-scrollbar min-w-0">
            {tabs.map((tab, i) => (
              <button
                key={tab.label}
                type="button"
                onClick={() => setActiveTab(i)}
                aria-pressed={activeTab === i}
                className={`relative text-[10px] font-sans uppercase tracking-[0.24em] whitespace-nowrap pb-2 transition-colors ${
                  activeTab === i
                    ? "text-ink"
                    : "text-ink/50 hover:text-ink/80"
                }`}
              >
                {tab.label}
                {activeTab === i ? (
                  <span
                    aria-hidden
                    className="absolute left-0 right-0 -bottom-[1px] h-[1.5px] bg-ink"
                  />
                ) : null}
              </button>
            ))}
          </div>
          <div className="shrink-0 flex items-center gap-5">
            <CiteButton
              title={`${meta.id}: ${meta.title}`}
              documentId={meta.id}
              version={fields.version}
              year={(fields.ratified ?? fields.prepared ?? "").match(/\d{4}/)?.[0]}
              url={`https://mnamuseum.org${backHref.startsWith("/agent") ? `/agent/${meta.id}/constitution` : `/standards/${meta.id}`}`}
              documentType={fields.classification}
              tone="light"
            />
            <a
              href={resolvedPdfHref}
              className="inline-flex items-center justify-center gap-3 bg-ink text-mna-white text-[10px] font-sans uppercase tracking-[0.26em] px-5 py-3 hover:bg-ink/85 transition-colors"
            >
              <span>Download {backHref.startsWith("/agent") ? "Constitution" : "Standard"}</span>
              <span aria-hidden>↓</span>
            </a>
          </div>
        </div>
      </div>

      {/* ───── Body (light) — sidebar + content ───── */}
      <div className="bg-warm-paper text-ink">
        <div className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-12 py-12 md:py-16 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-12 lg:gap-16">
          {/* Sticky TOC */}
          <aside className="lg:sticky lg:top-[152px] lg:self-start lg:max-h-[calc(100vh-176px)] lg:overflow-y-auto pr-1">
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55 mb-5">
              On This Page
            </p>
            <nav className="border-l border-ink/15">
              {tabs.flatMap((tab, ti) =>
                tab.sections.map((s) => {
                  const isActive = s.slug === activeSection;
                  const inCurrentTab = ti === activeTab;
                  return (
                    <a
                      key={s.slug}
                      href={`#${s.slug}`}
                      onClick={(e) => {
                        if (!inCurrentTab) {
                          e.preventDefault();
                          const targetTab = sectionToTabIndex.get(s.slug) ?? 0;
                          setActiveTab(targetTab);
                          setTimeout(() => {
                            const el = document.getElementById(s.slug);
                            el?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }, 60);
                        }
                      }}
                      className={`block pl-4 pr-2 py-2 text-[13px] leading-[1.4] -ml-px border-l transition-colors ${
                        isActive
                          ? "border-ink text-ink font-medium bg-ink/[0.04]"
                          : inCurrentTab
                            ? "border-transparent text-ink/65 hover:text-ink"
                            : "border-transparent text-ink/40 hover:text-ink/70"
                      }`}
                    >
                      {s.num}. {s.title}
                    </a>
                  );
                })
              )}
            </nav>
            <Link
              href={indexHref}
              className="mt-8 inline-flex items-center justify-between gap-3 w-full border border-ink/20 hover:border-ink/50 py-3 px-4 text-[10px] font-sans uppercase tracking-[0.26em] text-ink transition-colors"
            >
              <span>{indexLabel}</span>
              <span aria-hidden>→</span>
            </Link>
          </aside>

          {/* Content */}
          <main className="min-w-0">
            {currentSections.map((s) => (
              <section
                key={s.slug}
                id={s.slug}
                data-slug={s.slug}
                ref={(el) => {
                  if (el) sectionRefs.current.set(s.slug, el);
                  else sectionRefs.current.delete(s.slug);
                }}
                className="scroll-mt-[160px] mb-16"
              >
                <h2 className="text-[10px] font-sans uppercase tracking-[0.28em] text-ink/65 mb-3">
                  {s.num}. {s.title}
                </h2>
                <div className="border-t border-ink/15 mb-6" />
                <div
                  className="prose-standard"
                  dangerouslySetInnerHTML={{ __html: s.bodyHtml }}
                />
              </section>
            ))}

            {/* Subordinate-to callout */}
            {fields.subordinateTo ? (
              <aside className="mt-12 mb-16 border border-ink/15 bg-ink/[0.025] px-6 py-6 flex items-start gap-5">
                <div className="shrink-0 mt-1 text-ink/85">
                  <MNAGlyph
                    family="concentric"
                    seed={meta.id}
                    size={32}
                    className="w-8 h-8"
                  />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-[20px] md:text-[22px] leading-tight text-ink mb-1">
                    Subordinate to the {fields.subordinateTo.replace(/MNA Founding Charter/i, "Founding Charter").replace(/\(.*\)/, "").trim()}
                  </p>
                  <p className="text-[11px] font-sans uppercase tracking-[0.18em] text-ink/55">
                    This standard operates under and is subordinate to the {fields.subordinateTo}.
                  </p>
                </div>
              </aside>
            ) : null}

            {/* Previous / Next section nav */}
            <nav className="mt-16 pt-8 border-t border-ink/15 grid grid-cols-2 gap-8">
              <div>
                {activeTab > 0 ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab((t) => Math.max(0, t - 1))}
                    className="block text-left group"
                  >
                    <span className="block text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55 mb-2">
                      ← Previous Section
                    </span>
                    <span className="block font-display text-[20px] md:text-[22px] text-ink leading-tight group-hover:text-ink/70 transition-colors">
                      {tabs[activeTab - 1].label.toUpperCase()}
                    </span>
                  </button>
                ) : siblings.prev ? (
                  <Link href={siblings.prev.href} className="block group">
                    <span className="block text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55 mb-2">
                      ← Previous
                    </span>
                    <span className="block font-display text-[20px] md:text-[22px] text-ink leading-tight group-hover:text-ink/70 transition-colors">
                      {siblings.prev.title}
                    </span>
                  </Link>
                ) : null}
              </div>
              <div className="text-right">
                {activeTab < tabs.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab((t) => Math.min(tabs.length - 1, t + 1))}
                    className="block text-right group ml-auto"
                  >
                    <span className="block text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55 mb-2">
                      Next Section →
                    </span>
                    <span className="block font-display text-[20px] md:text-[22px] text-ink leading-tight group-hover:text-ink/70 transition-colors">
                      {tabs[activeTab + 1].label.toUpperCase()}
                    </span>
                  </button>
                ) : siblings.next ? (
                  <Link
                    href={siblings.next.href}
                    className="block group"
                  >
                    <span className="block text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55 mb-2">
                      Next →
                    </span>
                    <span className="block font-display text-[20px] md:text-[22px] text-ink leading-tight group-hover:text-ink/70 transition-colors">
                      {siblings.next.title}
                    </span>
                  </Link>
                ) : null}
              </div>
            </nav>
          </main>
        </div>
      </div>
    </article>
  );
}

/* ─── Atoms ────────────────────────────────────────────────────────────── */

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-[0.22em] text-mna-white/45 self-center whitespace-nowrap">
        {label}
      </dt>
      <dd className="text-mna-white/95 leading-snug">{value}</dd>
    </>
  );
}

function inferDocumentType(classification: string): string {
  if (/founding/i.test(classification)) return "Charter";
  if (/standard/i.test(classification)) return "Standard";
  if (/protocol/i.test(classification)) return "Protocol";
  if (/registry/i.test(classification)) return "Registry";
  if (/system design/i.test(classification)) return "System Design";
  return "Document";
}

/* ─── Blueprint hero — circle + crosshairs frame around the chosen glyph ─ */

function BlueprintHero({
  family,
  seed,
}: {
  family: GlyphFamily;
  seed: string;
}) {
  /* Geometry: a circle inset by ~14% of the SVG width, with crosshairs at
     N/S/E/W and registration plus-marks at the four corners. The chosen
     glyph family is drawn centered inside the circle so each standard reads
     as a different blueprint without producing one-off art per doc. */
  const stroke = "rgba(255,255,255,0.45)";
  const strokeFaint = "rgba(255,255,255,0.18)";
  return (
    <svg
      viewBox="0 0 600 600"
      className="block w-full h-full"
      aria-hidden
    >
      {/* Outer registration plus marks */}
      {[
        [40, 40],
        [560, 40],
        [40, 560],
        [560, 560],
      ].map(([cx, cy], i) => (
        <g key={i} stroke={stroke} strokeWidth={1}>
          <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy} />
          <line x1={cx} y1={cy - 10} x2={cx} y2={cy + 10} />
        </g>
      ))}

      {/* Faint cross-grid */}
      <g stroke={strokeFaint} strokeWidth={0.5}>
        <line x1={300} y1={40} x2={300} y2={560} />
        <line x1={40} y1={300} x2={560} y2={300} />
      </g>

      {/* Tick marks along axes */}
      {Array.from({ length: 24 }).map((_, i) => {
        const t = 60 + i * 20;
        if (t < 60 || t > 540) return null;
        return (
          <g key={`tick-${i}`} stroke={strokeFaint} strokeWidth={0.5}>
            <line x1={t} y1={296} x2={t} y2={304} />
            <line x1={296} y1={t} x2={304} y2={t} />
          </g>
        );
      })}

      {/* Main circle */}
      <circle
        cx={300}
        cy={300}
        r={210}
        fill="none"
        stroke={stroke}
        strokeWidth={1.2}
      />

      {/* Cardinal crosshairs at circle perimeter */}
      {[
        [300, 90],
        [300, 510],
        [90, 300],
        [510, 300],
      ].map(([cx, cy], i) => (
        <g key={`ch-${i}`} stroke={stroke} strokeWidth={1}>
          <line x1={cx - 8} y1={cy} x2={cx + 8} y2={cy} />
          <line x1={cx} y1={cy - 8} x2={cx} y2={cy + 8} />
        </g>
      ))}

      {/* Inner glyph — sized to ~60% of circle */}
      <g transform="translate(180,180)">
        <foreignObject x="0" y="0" width="240" height="240">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <div style={{ width: 240, height: 240, color: "rgba(255,255,255,0.85)" } as any}>
            <MNAGlyph
              family={family}
              seed={seed}
              size={240}
              className="w-full h-full"
            />
          </div>
        </foreignObject>
      </g>
    </svg>
  );
}
