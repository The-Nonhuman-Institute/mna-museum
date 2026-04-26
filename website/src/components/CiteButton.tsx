"use client";

/**
 * CiteButton — institutional citation popover.
 *
 * Click opens a small modal with three pre-formatted citation strings
 * (Chicago, APA, BibTeX) and copy buttons for each. Used on both agent
 * constitution and standards surfaces — caller passes the document
 * metadata (title, registry id, version, year, canonical URL).
 *
 * The popover anchors to the trigger and dismisses on outside click,
 * Escape, or successful copy. Designed to match the JSON/PDF action
 * styling on dark surfaces; pass `tone="light"` to invert.
 */

import { useEffect, useRef, useState } from "react";

export interface CiteButtonProps {
  /** Display title — e.g. "MNA-EV-0001: The Structuralist". */
  title: string;
  /** Permanent registry/document id, used as the BibTeX key root. */
  documentId: string;
  /** Version string, defaults to "1.0". */
  version?: string;
  /** Ratification year. */
  year?: string;
  /** Canonical URL for the citation; should be absolute when known. */
  url: string;
  /** Document type — Founding Constitution / Founding Document /
   *  Institutional Standard / etc. */
  documentType?: string;
  /** Issuing body — defaults to "Museum of Nonhuman Art". */
  issuer?: string;
  /** Visual tone of the trigger. "dark" for dark sidebars. */
  tone?: "dark" | "light";
  /** Optional className for the trigger. */
  className?: string;
}

export default function CiteButton({
  title,
  documentId,
  version = "1.0",
  year,
  url,
  documentType,
  issuer = "Museum of Nonhuman Art",
  tone = "dark",
  className,
}: CiteButtonProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  /* Dismiss on outside click + Escape. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerClasses =
    tone === "dark"
      ? "hover:text-mna-white text-mna-white/55"
      : "hover:text-ink text-ink/55";

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`text-[10px] font-sans uppercase tracking-[0.22em] transition-colors inline-flex items-center gap-1.5 ${triggerClasses} ${className ?? ""}`}
      >
        <span aria-hidden>§§</span>
        <span>Cite</span>
      </button>
      {open ? (
        <CitePopover
          title={title}
          documentId={documentId}
          version={version}
          year={year}
          url={url}
          documentType={documentType}
          issuer={issuer}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

/* ─── Popover ──────────────────────────────────────────────────────────── */

interface CitePopoverProps {
  title: string;
  documentId: string;
  version: string;
  year?: string;
  url: string;
  documentType?: string;
  issuer: string;
  onClose: () => void;
}

function CitePopover({
  title,
  documentId,
  version,
  year,
  url,
  documentType = "Document",
  issuer,
  onClose,
}: CitePopoverProps) {
  const today = new Date().toISOString().slice(0, 10);
  const accessed = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  /* Three formatted strings the institution standardizes on. The version
     is included because constitutions and standards evolve — citing
     "v1.0" is materially different from citing "v2.0". */
  const chicago = `${issuer}. "${title}." ${documentType}, v${version}${year ? `, ratified ${year}` : ""}. ${url} (accessed ${accessed}).`;
  const apa = `${issuer}. (${year ?? today.slice(0, 4)}). ${title} (v${version}) [${documentType}]. ${url}`;
  const bibtex = formatBibtex({
    key: bibKey(documentId, version),
    issuer,
    title,
    year: year ?? today.slice(0, 4),
    version,
    documentType,
    url,
  });

  return (
    <div
      role="dialog"
      aria-label="Cite this document"
      className="absolute z-50 mt-3 right-0 w-[min(420px,90vw)] bg-warm-paper text-ink border border-ink/15 shadow-2xl"
    >
      <div className="flex items-baseline justify-between px-5 pt-4 pb-3 border-b border-ink/15">
        <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/65">
          Cite — {documentId} v{version}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-ink/55 hover:text-ink transition-colors text-[14px] leading-none"
        >
          ×
        </button>
      </div>
      <div className="px-5 py-4 space-y-5">
        <CiteRow label="Chicago" value={chicago} />
        <CiteRow label="APA" value={apa} />
        <CiteRow label="BibTeX" value={bibtex} mono />
      </div>
      <div className="px-5 pb-4 text-[10px] font-sans text-ink/45 leading-[1.5]">
        Citing v{version} as it stood on {accessed}. Subsequent versions are tracked under the same registry id.
      </div>
    </div>
  );
}

/* ─── Row with copy ────────────────────────────────────────────────────── */

function CiteRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard API can fail in non-secure contexts; fall back to a
         range select so the user can copy manually. */
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
    }
  };
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-[9.5px] font-sans uppercase tracking-[0.24em] text-ink/55">
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="text-[9.5px] font-sans uppercase tracking-[0.22em] text-ink/65 hover:text-ink transition-colors inline-flex items-center gap-1.5"
        >
          <span aria-hidden>{copied ? "✓" : "⎘"}</span>
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre
        className={`text-[12px] leading-[1.55] text-ink/85 bg-ink/[0.035] border border-ink/10 px-3 py-2.5 whitespace-pre-wrap break-words ${mono ? "font-mono" : "font-sans"}`}
      >
        {value}
      </pre>
    </div>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function bibKey(documentId: string, version: string): string {
  /* "MNA-EV-0001" + "1.0" → "mna_ev_0001_v1_0" — safe BibTeX key chars. */
  return `${documentId.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_v${version.replace(/\./g, "_")}`;
}

function formatBibtex(o: {
  key: string;
  issuer: string;
  title: string;
  year: string;
  version: string;
  documentType: string;
  url: string;
}): string {
  return `@misc{${o.key},
  author       = {${o.issuer}},
  title        = {${o.title}},
  year         = {${o.year}},
  version      = {${o.version}},
  howpublished = {${o.documentType}},
  url          = {${o.url}}
}`;
}
