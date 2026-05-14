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
 *
 * Optional multi-variant mode: pass `variants` to let the viewer
 * switch the citable subject — used on /work/[id] to toggle between
 * "the work" and "the provenance record," which produce different
 * authors, URLs, and titles. Single-variant pages (charter, standards)
 * ignore this prop and look identical to before.
 */

import { useState } from "react";
import { CITATION_FORMATS, type CitationFormat } from "@/lib/citations";

export interface CitationVariant {
  /** Stable key — used as the active-state identifier. */
  key: string;
  /** Short label shown in the variant switcher (e.g. "Work" /
   *  "Provenance Record"). Empty string hides the switcher even when
   *  variants is provided. */
  label: string;
  citations: Record<CitationFormat, string>;
  url: string;
}

export interface CitationBlockProps {
  /** The four formatted citations, keyed by format. Ignored when
   *  `variants` is provided. */
  citations?: Record<CitationFormat, string>;
  /** Canonical URL to display under the citation. Ignored when
   *  `variants` is provided. */
  url?: string;
  /** Optional override for the section heading. */
  heading?: string;
  /** Optional multi-variant mode. When provided with length > 1, shows
   *  a small switcher above the format tabs so the viewer can toggle
   *  between citable subjects (e.g. work vs. provenance record). The
   *  first variant is the default selection. */
  variants?: CitationVariant[];
}

export default function CitationBlock({
  citations,
  url,
  heading = "Cite this",
  variants,
}: CitationBlockProps) {
  // Normalize to variants internally — single-variant pages just have
  // one entry constructed from the citations/url props.
  const variantList: CitationVariant[] =
    variants && variants.length > 0
      ? variants
      : [
          {
            key: "_default",
            label: "",
            citations: citations ?? ({} as Record<CitationFormat, string>),
            url: url ?? "",
          },
        ];

  const [activeVariantKey, setActiveVariantKey] = useState<string>(
    variantList[0].key,
  );
  const [active, setActive] = useState<CitationFormat>("APA");
  const [copied, setCopied] = useState(false);

  const currentVariant =
    variantList.find((v) => v.key === activeVariantKey) ?? variantList[0];
  const showVariantSwitcher =
    variantList.length > 1 && variantList.every((v) => v.label);

  function onCopy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(currentVariant.citations[active])
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {
        // ignored — fall back to manual copy of selected text
      });
  }

  const displayUrl = currentVariant.url.replace(/^https?:\/\//, "");

  return (
    <section className="border-t border-mna-white/15 pt-6 mt-10">
      {/* Heading row — eyebrow on the left, optional variant switcher
          on the right (only when multiple labeled variants exist) */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-4">
        <p className="text-[10px] font-sans uppercase tracking-[0.32em] text-mna-white/55">
          {heading}
        </p>
        {showVariantSwitcher ? (
          <div className="flex items-baseline gap-x-4 text-[10px] font-sans uppercase tracking-[0.22em]">
            {variantList.map((v, i) => {
              const isActive = currentVariant.key === v.key;
              return (
                <span key={v.key} className="flex items-baseline gap-x-4">
                  {i > 0 ? (
                    <span aria-hidden className="text-mna-white/25">·</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setActiveVariantKey(v.key)}
                    aria-pressed={isActive}
                    className={`pb-0.5 border-b transition-colors ${
                      isActive
                        ? "border-mna-white text-mna-white"
                        : "border-transparent text-mna-white/55 hover:text-mna-white/85"
                    }`}
                  >
                    {v.label}
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}
      </div>

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
        {currentVariant.citations[active]}
      </pre>

      {/* Footer row: canonical URL on the left, copy affordance on the right */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3 text-[10px] font-sans uppercase tracking-[0.22em]">
        <a
          href={currentVariant.url}
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
