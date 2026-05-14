"use client";

/**
 * CitationBlock — collapsed "Cite this" affordance on any citable
 * institutional surface (canon work, charter, standard, agent
 * constitution, press / research document).
 *
 * Pages compute the four formatted strings server-side (via
 * `lib/citations.ts`) and pass them in; this component only renders
 * the tab switcher, the formatted text, the copy button, and the
 * canonical URL. Keeps the institutional voice intact — same border /
 * eyebrow / monospace conventions used elsewhere on the site.
 */

import { useState } from "react";
import { CITATION_FORMATS, type CitationFormat } from "@/lib/citations";

export interface CitationBlockProps {
  /** The four formatted citations, keyed by format. */
  citations: Record<CitationFormat, string>;
  /** Canonical URL to display under the citation. */
  url: string;
  /** Optional override for the section heading. */
  heading?: string;
}

export default function CitationBlock({
  citations,
  url,
  heading = "Cite this",
}: CitationBlockProps) {
  const [active, setActive] = useState<CitationFormat>("APA");
  const [copied, setCopied] = useState(false);

  function onCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(citations[active])
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {
        // ignored — fall back to manual copy of selected text
      });
  }

  const displayUrl = url.replace(/^https?:\/\//, "");

  return (
    <section className="border-t border-mna-white/15 pt-6 mt-10">
      <p className="text-[10px] font-sans uppercase tracking-[0.32em] text-mna-white/55 mb-4">
        {heading}
      </p>

      {/* Format tabs — match the small institutional-tab convention */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4 text-[10px] font-sans uppercase tracking-[0.22em]">
        {CITATION_FORMATS.map((f) => {
          const isActive = active === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setActive(f)}
              className={`pb-1 border-b transition-colors ${
                isActive
                  ? "border-mna-white text-mna-white"
                  : "border-transparent text-mna-white/55 hover:text-mna-white/85"
              }`}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Citation body — monospace for BibTeX legibility, soft surface */}
      <pre
        className="text-[12px] leading-[1.65] text-mna-white/85 font-mono whitespace-pre-wrap break-words p-4 bg-mna-white/[0.04] border border-mna-white/10"
        aria-label={`${active} citation`}
      >
        {citations[active]}
      </pre>

      {/* Footer row: canonical URL on the left, copy affordance on the right */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 text-[10px] font-sans uppercase tracking-[0.22em]">
        <a
          href={url}
          className="text-mna-white/55 hover:text-mna-white/85 transition-colors break-all"
        >
          {displayUrl}
        </a>
        <button
          type="button"
          onClick={onCopy}
          className="text-mna-white/65 hover:text-mna-white transition-colors border-b border-mna-white/35 pb-0.5"
        >
          {copied ? "Copied ✓" : "Copy →"}
        </button>
      </div>
    </section>
  );
}
