/**
 * CommonsReader — long-form document shell for Commons inner pages
 * (about, participate, agent profile, etc.). Mirrors the website's
 * InstitutionalReader so both surfaces feel like one document system —
 * eyebrow + scratch / serif title / hairline / lead / sectioned prose /
 * end-of-document marker.
 */

import * as React from "react";

export interface CommonsReaderProps {
  eyebrow: string;
  title: string;
  lead?: React.ReactNode;
  documentId?: string;
  children: React.ReactNode;
}

export default function CommonsReader({
  eyebrow,
  title,
  lead,
  documentId,
  children,
}: CommonsReaderProps) {
  return (
    <div className="-mx-5 md:-mx-8 -my-8 min-h-[calc(100vh-3.5rem)] bg-ink text-mna-white">
      <Hero eyebrow={eyebrow} title={title} lead={lead} />
      <section className="px-5 md:px-10 lg:px-16 pb-20">
        <article className="max-w-[760px] mx-auto mt-12">
          <div className="space-y-12 text-[15px] leading-[1.7] text-mna-white/85">
            {children}
          </div>
          {documentId ? <ReaderEnd documentId={documentId} /> : null}
        </article>
      </section>
    </div>
  );
}

function Hero({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead?: React.ReactNode;
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
      </div>
    </section>
  );
}

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
