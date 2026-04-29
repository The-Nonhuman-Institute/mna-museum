/**
 * Shared layout atoms for operative-agent profile templates.
 *
 * Every operative-agent profile (Evaluator, Curator, Keeper, Critic,
 * Installer, Conservator, Ambassador, Registrar, Steward Agent) uses
 * the same dark-sidebar / light-main split and the same building blocks
 * inside the main column. This module owns those shared building blocks
 * so per-type Client components can compose them with type-specific
 * content (stats, recent-activity tables, third-panel content).
 *
 * Atoms exported here:
 *   - Block          section wrapper with eyebrow + ruler + content
 *   - FieldBlock     field-level header (label + optional View link)
 *   - Panel          bottom-triplet panel with header + ruler + slot
 *   - ProfileCol     Constitutional Profile column (label + body + link)
 *   - Stat           hero number + label + sparkline (or "Awaiting…")
 *   - Sparkline      12-bucket polyline
 *   - Legend         dot + label legend chip
 *   - DarkField      label/value pair for the dark sidebar dl
 */

import Link from "next/link";

/* ─── Block ─────────────────────────────────────────────────────────────── */

export function Block({
  label,
  labelExtra,
  right,
  children,
}: {
  label: string;
  labelExtra?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-ink/15 first:border-t-0">
      <div className="px-7 md:px-10 pt-9 pb-5 flex flex-wrap items-baseline gap-x-3 gap-y-2 justify-between">
        <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/65">
          {label}
          {labelExtra ? (
            <span className="ml-2 text-ink/40 normal-case tracking-normal">
              {labelExtra}
            </span>
          ) : null}
        </p>
        {right}
      </div>
      <div className="mx-7 md:mx-10 border-t border-ink/12" />
      <div className="px-7 md:px-10 pt-7 pb-12">{children}</div>
    </section>
  );
}

/* ─── FieldBlock ────────────────────────────────────────────────────────── */

export function FieldBlock({
  label,
  moreHref,
  moreLabel,
  children,
}: {
  label: string;
  moreHref?: string;
  moreLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-[12px] font-sans uppercase tracking-[0.18em] text-ink/55">
          {label}
        </p>
        {moreHref ? (
          <Link
            href={moreHref}
            className="text-[10px] uppercase tracking-[0.22em] font-sans text-ink/55 hover:text-ink transition-colors inline-flex items-center gap-1.5 shrink-0"
          >
            <span>{moreLabel ?? "View"}</span>
            <span aria-hidden>→</span>
          </Link>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/* ─── Panel (bottom triplet) ────────────────────────────────────────────── */

export function Panel({
  label,
  children,
  footerHref,
  footerLabel,
}: {
  label: string;
  children: React.ReactNode;
  footerHref: string;
  footerLabel: string;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55">
          {label}
        </p>
        <Link
          href={footerHref}
          className="text-[10px] uppercase tracking-[0.22em] font-sans text-ink/55 hover:text-ink transition-colors inline-flex items-center gap-1.5"
        >
          <span>{footerLabel}</span>
          <span aria-hidden>→</span>
        </Link>
      </div>
      <div className="border-t border-ink/15 mb-5" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

/* ─── ProfileCol (Constitutional Profile column) ───────────────────────── */

export function ProfileCol({
  label,
  body,
  moreHref,
  moreLabel,
}: {
  label: string;
  body: string | string[];
  moreHref: string;
  moreLabel?: string;
}) {
  return (
    <FieldBlock label={label} moreHref={moreHref} moreLabel={moreLabel ?? "View all"}>
      {Array.isArray(body) ? (
        <ul className="space-y-2">
          {body.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 mt-2 w-[5px] h-[5px] rounded-full bg-ink/70" />
              <span className="text-[13px] leading-[1.55] text-ink/85">{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] leading-[1.6] text-ink/85">{body}</p>
      )}
    </FieldBlock>
  );
}

/* ─── Stat (hero stat block) ────────────────────────────────────────────── */

export function Stat({
  value,
  label,
  spark,
  awaiting = false,
}: {
  value: string;
  label: string;
  spark: number[];
  /** When true, value renders muted and the sparkline area shows
   *  "Awaiting first cycle" instead. Use for metrics the institution
   *  doesn't yet track. */
  awaiting?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p
        className={`font-display font-light text-[28px] md:text-[30px] leading-none mb-2 tabular-nums ${awaiting ? "text-ink/35" : "text-ink"}`}
      >
        {value}
      </p>
      <p className="text-[10px] font-sans uppercase tracking-[0.18em] text-ink/55 leading-[1.4] mb-2 max-w-[14ch]">
        {label}
      </p>
      {spark.length > 0 ? (
        <Sparkline values={spark} />
      ) : (
        <p className="text-[9px] font-sans uppercase tracking-[0.2em] text-ink/35">
          {awaiting ? "Awaiting first cycle" : ""}
        </p>
      )}
    </div>
  );
}

/* ─── Sparkline ─────────────────────────────────────────────────────────── */

export function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length === 0) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const W = 80;
  const H = 16;
  const step = W / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = H - ((v - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      preserveAspectRatio="none"
      className="block"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        opacity={0.6}
      />
    </svg>
  );
}

/* ─── Legend (small dot + label chip) ───────────────────────────────────── */

export function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block w-[6px] h-[6px] rounded-full ${dot}`} />
      <span>{label}</span>
    </span>
  );
}

/* ─── DarkField (sidebar dl row) ────────────────────────────────────────── */

export function DarkField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9.5px] font-sans uppercase tracking-[0.22em] text-mna-white/45 mb-1">
        {label}
      </dt>
      <dd className="text-[13px] text-mna-white">{value}</dd>
    </div>
  );
}
