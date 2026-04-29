/**
 * InstitutionalReader — shared dark long-form document shell.
 *
 * Used by /protocol, /guidelines, /privacy, /terms, /newsletter/* — any
 * surface that's "institutional eyebrow + serif title + hairline + lead +
 * sectioned prose + end-of-document mark" and shouldn't earn its own
 * full bespoke layout. Mirrors the hero pattern in /research/[id] and
 * /press/[id] so the readers feel like one document system.
 *
 * Provides:
 *   <InstitutionalReader> — the dark page shell
 *   <ReaderSection>      — h2 + body wrapper with the right tracking
 *   <ReaderEnd>          — "End of document" institutional marker
 */

import * as React from "react";

export interface InstitutionalReaderProps {
  eyebrow: string;
  title: string;
  lead?: React.ReactNode;
  meta?: React.ReactNode;
  /** Document id shown in the end-of-document mark (e.g. "MNA-PP-001"). */
  documentId?: string;
  /** Optional right-rail content (TOC, glance, etc.). When provided the
   *  layout becomes 2-column. */
  rail?: React.ReactNode;
  children: React.ReactNode;
}

export default function InstitutionalReader({
  eyebrow,
  title,
  lead,
  meta,
  documentId,
  rail,
  children,
}: InstitutionalReaderProps) {
  return (
    <div className="bg-ink text-mna-white min-h-screen">
      <Hero
        eyebrow={eyebrow}
        title={title}
        lead={lead}
        meta={meta}
      />

      <section className="px-5 md:px-10 lg:px-16 pb-20">
        <div
          className={`max-w-[1240px] mx-auto mt-12 ${
            rail
              ? "grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 lg:gap-14"
              : ""
          }`}
        >
          <article className="min-w-0 max-w-[760px]">
            <div className="space-y-12 text-[15px] leading-[1.7] text-mna-white/85">
              {children}
            </div>
            {documentId ? <ReaderEnd documentId={documentId} /> : null}
          </article>
          {rail ? <aside className="space-y-6">{rail}</aside> : null}
        </div>
      </section>
    </div>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────────────── */

function Hero({
  eyebrow,
  title,
  lead,
  meta,
}: {
  eyebrow: string;
  title: string;
  lead?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <section className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-10 border-b border-mna-white/15">
      <div className="max-w-[1240px] mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
            {eyebrow}
          </p>
          <ScratchMark />
        </div>

        <h1
          className="font-serif font-light text-mna-white"
          style={{
            fontSize: "clamp(40px, 6vw, 72px)",
            lineHeight: "1.04",
            letterSpacing: "-0.005em",
          }}
        >
          {title}
        </h1>

        <div className="w-12 h-px bg-mna-white/35 mt-7 mb-7" />

        {lead ? (
          <div className="text-[16px] leading-[1.55] text-mna-white/80 max-w-[780px]">
            {lead}
          </div>
        ) : null}

        {meta ? <div className="mt-10 max-w-[820px]">{meta}</div> : null}
      </div>
    </section>
  );
}

/* ─── Section helpers ───────────────────────────────────────────────────── */

export function ReaderSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-serif text-[24px] md:text-[28px] leading-[1.2] text-mna-white mb-5">
        {title}
      </h2>
      <div className="space-y-4 text-mna-white/80">{children}</div>
    </section>
  );
}

export function ReaderList({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ul className="space-y-4">{children}</ul>;
}

export function ReaderListItem({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="text-mna-white/35 shrink-0">—</span>
      <span className="text-mna-white/80">
        {label ? (
          <strong className="text-mna-white font-medium">{label}</strong>
        ) : null}{" "}
        {children}
      </span>
    </li>
  );
}

/* ─── End mark ──────────────────────────────────────────────────────────── */

export function ReaderEnd({ documentId }: { documentId: string }) {
  return (
    <div className="mt-14 pt-8 border-t border-mna-white/15 flex items-center gap-4">
      <div className="w-3 h-3 border border-mna-white/55" aria-hidden />
      <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
        End of document
      </p>
      <span aria-hidden className="flex-1 h-px bg-mna-white/15" />
      <p className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55">
        {documentId}
      </p>
    </div>
  );
}

/* ─── Shared scratch mark ───────────────────────────────────────────────── */

export function ScratchMark() {
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
