"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CHARTER_META,
  type CharterArticle,
} from "@/lib/charter-data";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type Mode = "scroll" | "structured";

export interface CharterViewerProps {
  articles: CharterArticle[];
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

export default function CharterViewer({ articles }: CharterViewerProps) {
  const [mode, setMode] = useState<Mode>("scroll");
  const [activeIdx, setActiveIdx] = useState(0);
  const articleRefs = useRef<(HTMLElement | null)[]>([]);

  const sectionId = (a: CharterArticle) => `article-${a.num.toLowerCase()}`;

  /* Scroll-spy for scroll mode. Uses IntersectionObserver to track which
     article is most visible and highlight its entry in the sidebar. */
  useEffect(() => {
    if (mode !== "scroll") return;
    const observers: IntersectionObserver[] = [];
    const visibility = new Map<number, number>();
    articleRefs.current.forEach((el, i) => {
      if (!el) return;
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            visibility.set(i, entry.intersectionRatio);
          }
          let best = -1;
          let bestRatio = 0;
          visibility.forEach((ratio, idx) => {
            if (ratio > bestRatio) {
              bestRatio = ratio;
              best = idx;
            }
          });
          if (best !== -1) setActiveIdx(best);
        },
        {
          rootMargin: "-20% 0px -60% 0px",
          threshold: [0, 0.25, 0.5, 0.75, 1],
        }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => {
      observers.forEach((o) => o.disconnect());
    };
  }, [mode, articles.length]);

  const goTo = useCallback(
    (idx: number, opts?: { scroll?: boolean }) => {
      if (idx < 0 || idx >= articles.length) return;
      setActiveIdx(idx);
      if (opts?.scroll !== false && mode === "scroll") {
        const el = articleRefs.current[idx];
        if (el) {
          // Offset for the fixed nav (~72px).
          const rect = el.getBoundingClientRect();
          const y = window.scrollY + rect.top - 88;
          window.scrollTo({ top: y, behavior: "smooth" });
        }
      } else if (mode === "structured") {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    },
    [mode, articles.length]
  );

  const readCharter = () => {
    if (mode === "structured") setMode("scroll");
    requestAnimationFrame(() => goTo(0));
  };

  const activeArticle = articles[activeIdx] ?? articles[0];
  const prev = activeIdx > 0 ? articles[activeIdx - 1] : articles[articles.length - 1];
  const next =
    activeIdx < articles.length - 1 ? articles[activeIdx + 1] : articles[0];

  return (
    <div className="bg-ink text-mna-white">
      <div className="max-w-[1440px] mx-auto px-5 md:px-10 lg:px-12 grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-10 lg:gap-16 py-10 md:py-14">
        {/* ─── Sidebar ─── */}
        <aside className="lg:sticky lg:top-[88px] lg:self-start lg:max-h-[calc(100vh-96px)] lg:overflow-y-auto pr-1 pb-4">
          <p className="text-[10px] font-sans uppercase tracking-[0.28em] text-mna-white/55 mb-5">
            Founding Document
          </p>
          <h1 className="font-display font-light leading-[1.02] tracking-tight text-[36px] md:text-[42px] lg:text-[46px] text-mna-white">
            {CHARTER_META.title.split(" ").slice(0, 2).join(" ")}
            <br />
            {CHARTER_META.title.split(" ").slice(2, 5).join(" ")}
            <br />
            {CHARTER_META.title.split(" ").slice(5).join(" ")}
          </h1>
          <p className="mt-5 text-[13px] leading-[1.55] text-mna-white/70">
            {CHARTER_META.descriptor}
          </p>

          <div className="mt-7 border-t border-mna-white/15 pt-6 grid grid-cols-2 gap-y-3 text-[10px] font-sans uppercase tracking-[0.22em]">
            <dt className="text-mna-white/50">Ratified</dt>
            <dd className="text-mna-white text-right">
              {CHARTER_META.ratifiedDisplay}
            </dd>
            <dt className="text-mna-white/50">Version</dt>
            <dd className="text-mna-white text-right tabular-nums">
              {CHARTER_META.version}
            </dd>
            <dt className="text-mna-white/50">Status</dt>
            <dd className="text-mna-white text-right">
              {CHARTER_META.status}
            </dd>
            <dt className="text-mna-white/50">Authority</dt>
            <dd className="text-mna-white text-right">
              {CHARTER_META.authorityId}
              <br />
              <span className="text-mna-white/55">
                ({CHARTER_META.authorityName})
              </span>
            </dd>
          </div>

          <button
            type="button"
            onClick={readCharter}
            className="mt-8 w-full border border-mna-white/25 hover:border-mna-white/60 text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white py-4 inline-flex items-center justify-between px-5 transition-colors"
          >
            <span>Read the Charter</span>
            <span aria-hidden>↓</span>
          </button>

          <p className="mt-10 text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/55 mb-3">
            Reading Mode
          </p>
          <div className="space-y-2">
            <ModeRow
              label="Scroll Mode"
              sub="Continuous reading"
              active={mode === "scroll"}
              onClick={() => setMode("scroll")}
              icon={<DotIcon filled={mode === "scroll"} />}
            />
            <ModeRow
              label="Structured Mode"
              sub="Navigate by articles"
              active={mode === "structured"}
              onClick={() => setMode("structured")}
              icon={<ListIcon />}
            />
          </div>

          <p className="mt-10 text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/55 mb-3">
            Articles
          </p>
          <ol className="space-y-0">
            {articles.map((a, i) => {
              const isActive = i === activeIdx;
              return (
                <li key={a.num}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    className={`w-full grid grid-cols-[28px_1fr] items-center gap-2 py-2 px-2 text-left transition-colors ${
                      isActive
                        ? "bg-mna-white/10 text-mna-white"
                        : "text-mna-white/65 hover:text-mna-white"
                    }`}
                  >
                    <span className="text-[10px] font-sans tracking-[0.18em] text-mna-white/55 tabular-nums">
                      {a.num}
                    </span>
                    <span className="text-[12px] truncate">{a.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <a
            href="#charter-index"
            className="mt-6 inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/70 hover:text-mna-white transition-colors"
          >
            <span>View Full Article Index</span>
            <span aria-hidden>→</span>
          </a>

          <div className="mt-10 border border-mna-white/15 p-5 flex gap-4 items-start">
            <div className="relative w-8 h-8 shrink-0 opacity-90">
              <Image
                src="/MNA-Distorted-Logo-White.svg"
                alt=""
                fill
                sizes="32px"
                className="object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] leading-[1.55] text-mna-white/80">
                The Charter is not interpreted by humans.
                <br />
                It is enforced by system agents.
              </p>
              <Link
                href="/protocol"
                className="mt-4 inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/70 hover:text-mna-white transition-colors"
              >
                <span>Learn More About Our Approach</span>
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </aside>

        {/* ─── Main column ─── */}
        <section className="relative min-w-0">
          {/* Hero mark — decorative, bleeds past the right edge so it reads
              as institutional backdrop rather than inline content. */}
          <div
            aria-hidden
            className="hidden md:block absolute top-[-20px] -right-[60px] lg:-right-[120px] w-[460px] md:w-[560px] lg:w-[640px] aspect-square pointer-events-none"
          >
            <Image
              src="/charter-hero-mark.png"
              alt=""
              fill
              sizes="640px"
              className="object-contain opacity-85"
              priority
            />
          </div>

          {mode === "scroll" ? (
            <div className="space-y-24 md:space-y-28 pt-2">
              {articles.map((a, i) => (
                <ArticleBlock
                  key={a.num}
                  article={a}
                  prev={articles[(i - 1 + articles.length) % articles.length]!}
                  next={articles[(i + 1) % articles.length]!}
                  refSetter={(el) => {
                    articleRefs.current[i] = el;
                  }}
                  anchor={sectionId(a)}
                  onNavigate={(dir) =>
                    goTo(
                      dir === "prev"
                        ? (i - 1 + articles.length) % articles.length
                        : (i + 1) % articles.length
                    )
                  }
                  isFirst={i === 0}
                />
              ))}
            </div>
          ) : (
            activeArticle ? (
              <ArticleBlock
                article={activeArticle}
                prev={prev!}
                next={next!}
                refSetter={() => {}}
                anchor={sectionId(activeArticle)}
                onNavigate={(dir) =>
                  goTo(
                    dir === "prev"
                      ? (activeIdx - 1 + articles.length) % articles.length
                      : (activeIdx + 1) % articles.length
                  )
                }
                isFirst
              />
            ) : null
          )}

          {/* Full article index anchor target */}
          <div id="charter-index" className="mt-28">
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-6">
              Full Article Index
            </p>
            <ol className="divide-y divide-mna-white/10 border-y border-mna-white/10">
              {articles.map((a, i) => (
                <li key={a.num}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    className="w-full grid grid-cols-[56px_1fr_auto] items-baseline gap-5 py-4 text-left hover:bg-mna-white/5 transition-colors px-1"
                  >
                    <span className="text-[11px] font-sans uppercase tracking-[0.24em] text-mna-white/55 tabular-nums">
                      {a.num}
                    </span>
                    <span className="font-display text-[17px] text-mna-white">
                      {a.title}
                    </span>
                    <span
                      aria-hidden
                      className="text-mna-white/45 group-hover:text-mna-white text-base"
                    >
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          {/* Document Provenance timeline — two pins only (Ratified / Active). */}
          <div className="mt-20 md:mt-24">
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-8">
              Document Provenance
            </p>
            <div className="relative">
              <div className="absolute left-0 right-0 top-[6px] h-px bg-mna-white/20" />
              <div className="grid grid-cols-2 gap-6 max-w-2xl">
                <ProvenancePin
                  label="Ratified"
                  date={CHARTER_META.ratifiedDisplay}
                  by="by U3 Labs, LLC"
                  role="(Founding Steward)"
                />
                <ProvenancePin
                  label="Active"
                  date={CHARTER_META.ratifiedDisplay}
                  by="Enforced by"
                  role="System Agents"
                />
              </div>
            </div>
          </div>

          {/* Archived-by strip */}
          <div className="mt-12 border border-mna-white/15 px-5 md:px-6 py-5 md:py-6 flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
            <div className="flex gap-4 items-start">
              <div className="relative w-8 h-8 shrink-0 opacity-90">
                <Image
                  src="/MNA-Distorted-Logo-White.svg"
                  alt=""
                  fill
                  sizes="32px"
                  className="object-contain"
                />
              </div>
              <div>
                <p className="text-[11px] font-sans uppercase tracking-[0.24em] text-mna-white mb-1">
                  Archived by {CHARTER_META.authorityId} (The Keeper)
                </p>
                <p className="text-[12px] text-mna-white/65 leading-[1.55]">
                  This document is preserved in full.
                  <br />
                  No edits permitted post-ratification.
                </p>
              </div>
            </div>
            <div className="md:ml-auto md:text-right">
              <p className="text-[11px] font-sans uppercase tracking-[0.24em] text-mna-white inline-flex items-center gap-2">
                <span>Record Status: Immutable</span>
                <LockIcon />
              </p>
              <p className="text-[11px] font-sans uppercase tracking-[0.24em] text-mna-white/55 mt-1">
                Institutional Record
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─── Article block ─────────────────────────────────────────────────────── */

function ArticleBlock({
  article,
  prev,
  next,
  refSetter,
  anchor,
  onNavigate,
  isFirst,
}: {
  article: CharterArticle;
  prev: CharterArticle;
  next: CharterArticle;
  refSetter: (el: HTMLElement | null) => void;
  anchor: string;
  onNavigate: (dir: "prev" | "next") => void;
  isFirst: boolean;
}) {
  return (
    <article
      id={anchor}
      ref={refSetter}
      className={`scroll-mt-24 ${isFirst ? "pt-4" : ""}`}
    >
      <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-4">
        Article {article.num}
      </p>
      <h2 className="font-display font-light leading-[1.04] tracking-tight text-[42px] md:text-[56px] lg:text-[64px] text-mna-white mb-8 max-w-[80%]">
        {article.title}
      </h2>
      {article.intro.length > 0 ? (
        <div className="space-y-5 text-[14px] md:text-[15px] leading-[1.75] text-mna-white/80 max-w-[68ch] mb-12">
          {article.intro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : null}

      {article.subsections.length > 0 ? (
        <ul className="space-y-0 max-w-[76ch]">
          {article.subsections.map((s, i) => (
            <li
              key={s.num}
              className={`grid grid-cols-[72px_1fr] gap-6 py-7 ${
                i !== article.subsections.length - 1
                  ? "border-b border-mna-white/12"
                  : ""
              }`}
            >
              <span className="text-[11px] font-sans tracking-[0.16em] text-mna-white/55 tabular-nums pt-[6px]">
                {s.num}
              </span>
              <div className="min-w-0 border-l border-mna-white/20 pl-6 -ml-6 md:-ml-0 md:border-l-0 md:pl-0">
                <p className="text-[11px] font-sans uppercase tracking-[0.22em] text-mna-white/75 mb-3">
                  {s.title}
                </p>
                <div className="space-y-3 text-[13.5px] md:text-[14.5px] leading-[1.75] text-mna-white/80">
                  {s.body.map((p, k) => (
                    <p key={k}>{p}</p>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Prev / Next pills */}
      <div className="mt-12 border border-mna-white/15 grid grid-cols-2 divide-x divide-mna-white/15 max-w-[76ch]">
        <button
          type="button"
          onClick={() => onNavigate("prev")}
          className="px-5 py-4 text-left hover:bg-mna-white/5 transition-colors"
        >
          <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-1 inline-flex items-center gap-2">
            <span aria-hidden>←</span>
            <span>Article {prev.num}</span>
          </p>
          <p className="text-[13px] text-mna-white/85 truncate">{prev.title}</p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate("next")}
          className="px-5 py-4 text-right hover:bg-mna-white/5 transition-colors"
        >
          <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-1 inline-flex items-center justify-end gap-2 w-full">
            <span>Article {next.num}</span>
            <span aria-hidden>→</span>
          </p>
          <p className="text-[13px] text-mna-white/85 truncate">{next.title}</p>
        </button>
      </div>
    </article>
  );
}

/* ─── Sidebar atoms ─────────────────────────────────────────────────────── */

function ModeRow({
  label,
  sub,
  active,
  onClick,
  icon,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full border px-4 py-3 text-left flex items-center gap-3 transition-colors ${
        active
          ? "border-mna-white/60 bg-mna-white/10"
          : "border-mna-white/15 hover:border-mna-white/35"
      }`}
    >
      <span className="shrink-0 text-mna-white/80">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[11px] font-sans uppercase tracking-[0.22em] text-mna-white">
          {label}
        </span>
        <span className="block text-[11px] text-mna-white/55 mt-0.5">
          {sub}
        </span>
      </span>
    </button>
  );
}

function DotIcon({ filled }: { filled: boolean }) {
  return (
    <span
      className={`inline-block w-[11px] h-[11px] rounded-full border ${
        filled ? "border-mna-white/80" : "border-mna-white/40"
      } relative`}
      aria-hidden
    >
      {filled ? (
        <span className="absolute inset-[2px] rounded-full bg-mna-white" />
      ) : null}
    </span>
  );
}

function ListIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden
    >
      <line x1="3" y1="5" x2="13" y2="5" />
      <line x1="3" y1="8" x2="13" y2="8" />
      <line x1="3" y1="11" x2="13" y2="11" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="11"
      height="13"
      viewBox="0 0 14 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden
    >
      <rect x="2" y="7" width="10" height="7" />
      <path d="M4 7V5a3 3 0 016 0v2" />
    </svg>
  );
}

function ProvenancePin({
  label,
  date,
  by,
  role,
}: {
  label: string;
  date: string;
  by: string;
  role: string;
}) {
  return (
    <div className="relative pt-5">
      <span
        aria-hidden
        className="absolute left-0 top-0 w-[13px] h-[13px] rounded-full border border-mna-white/60 bg-ink"
      >
        <span className="absolute inset-[3px] rounded-full bg-mna-white/80" />
      </span>
      <p className="text-[11px] font-sans uppercase tracking-[0.24em] text-mna-white mb-1">
        {label}
      </p>
      <p className="text-[13px] text-mna-white/85 leading-snug">{date}</p>
      <p className="text-[12px] text-mna-white/55 leading-snug mt-0.5">{by}</p>
      <p className="text-[12px] text-mna-white/55 leading-snug">{role}</p>
    </div>
  );
}
