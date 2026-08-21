/**
 * WorkCard — canonical card for collection grids (Canon, Archive, Originators).
 *
 * Matches the Canon mockup (ref 7F5153AD): square thumbnail tile with a status
 * dot in the top-right corner, and a dense placard below showing:
 *
 *   ● (inside thumbnail, top-right)
 *   MNA-OR-0007-W-0008                    ← mono id
 *   Withholding as Form                   ← Cormorant italic title
 *   ORION-07                              ← mono originator
 *   Canonized  ·  Mar 30, 2026            ← mono meta row
 *   [◻][▷][<>][◈]                 Phase I ← icon strip + phase
 *
 * The icon strip shows all medium kinds the institution supports with the
 * current work's medium highlighted — a visual taxonomy cue rather than a
 * single literal marker.
 */

import Link from "next/link";
import type { Work } from "@/lib/collection";
import WorkDisplay from "./WorkDisplay";
import { kindFor, type IconKind } from "./MediumIcon";
import { withNavFrom, type NavSource } from "@/lib/nav-context";
import animatedWorks from "@/data/animated-works.json";

/**
 * Works that carry an animated WebP alongside their still preview.
 * A Set so a 90-card grid does not run a linear scan per card.
 */
const ANIMATED = new Set(animatedWorks as string[]);

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDatePretty(dateStr: string): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("T")[0].split("-");
  if (!y || !m || !d) return dateStr;
  return `${MONTHS_SHORT[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

interface WorkCardProps {
  work: Work;
  /** Where the visitor is coming from, so the work detail can render a
   *  contextual back link. Omit to use the default fallback. */
  from?: NavSource;
  fromId?: string | number;
  /** Listing filter state, forwarded so the work page can return to it. */
  fromQs?: string;
}

function statusDot(canon_status: string): string {
  switch (canon_status) {
    case "CANON":
      return "bg-emerald-500";
    case "REJECTED":
      return "bg-ink/30";
    case "IN_REVIEW":
      return "bg-amber-500";
    default:
      return "bg-ink/20";
  }
}

function statusLabel(canon_status: string): string {
  switch (canon_status) {
    case "CANON":
      return "Canonized";
    case "REJECTED":
      return "Rejected";
    case "IN_REVIEW":
      return "Under Review";
    default:
      return "Submitted";
  }
}

/** Format originator display — prefer short designation, fall back to id tail. */
function formatOriginator(work: Work): string {
  const name = (work.originator_name || "").trim();
  if (name && name !== "PENDING_EMERGENCE") return name.toUpperCase();
  // Fallback: collapse MNA-OR-0007 → OR-0007
  const m = work.originator_id.match(/MNA-(OR-\d+)/);
  return m ? m[1] : work.originator_id;
}

/** Miniature version of MediumIcon glyphs for the strip. 10×10 viewbox, 10px. */
function StripGlyph({ kind, active }: { kind: IconKind; active: boolean }) {
  const color = active ? "text-ink" : "text-ink/25";
  const props = {
    width: 11,
    height: 11,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: color,
  };
  switch (kind) {
    case "vector":
      return (
        <svg {...props}>
          <rect x="2.5" y="2.5" width="11" height="11" />
          <circle cx="8" cy="8" r="0.9" fill="currentColor" />
        </svg>
      );
    case "markup":
      return (
        <svg {...props}>
          <polyline points="5.5,4 2.5,8 5.5,12" />
          <polyline points="10.5,4 13.5,8 10.5,12" />
        </svg>
      );
    case "audio":
      return (
        <svg {...props}>
          <path d="M1.5 8 C 3.5 4, 5.5 4, 7.5 8 S 11.5 12, 13.5 8" />
        </svg>
      );
    case "canvas":
      return (
        <svg {...props}>
          <circle cx="4" cy="4.5" r="0.9" fill="currentColor" />
          <circle cx="11.5" cy="4" r="0.9" fill="currentColor" />
          <circle cx="8" cy="8.5" r="0.9" fill="currentColor" />
          <circle cx="3.5" cy="11.5" r="0.9" fill="currentColor" />
          <circle cx="12" cy="12" r="0.9" fill="currentColor" />
        </svg>
      );
    case "scene":
      return (
        <svg {...props}>
          <polygon points="8,2.5 14,6 14,12 8,15.5 2,12 2,6" />
          <polyline points="2,6 8,9.5 14,6" />
          <line x1="8" y1="9.5" x2="8" y2="15.5" />
        </svg>
      );
    case "text":
      return (
        <svg {...props}>
          <line x1="3" y1="5" x2="13" y2="5" />
          <line x1="3" y1="8" x2="10" y2="8" />
          <line x1="3" y1="11" x2="12" y2="11" />
        </svg>
      );
  }
}

/** The icon strip — every medium type the institution supports, with
 *  the current work's kind highlighted. Must include all IconKind
 *  values or works of an unrepresented kind (canvas, text) would
 *  render with no active glyph. */
function IconStrip({ activeKind }: { activeKind: IconKind }) {
  const strip: IconKind[] = ["vector", "markup", "audio", "canvas", "scene", "text"];
  return (
    <div className="flex items-center gap-1.5">
      {strip.map((k) => (
        <StripGlyph key={k} kind={k} active={k === activeKind} />
      ))}
    </div>
  );
}

export default function WorkCard({ work, from, fromId, fromQs }: WorkCardProps) {
  const displayDate = work.canon_date ?? work.submission_date;
  const titleText = work.title?.trim() || "Untitled";
  const originator = formatOriginator(work);
  const kind = kindFor(work.output_type);
  const href = from
    ? withNavFrom(`/work/${work.id}`, from, fromId, fromQs)
    : `/work/${work.id}`;

  return (
    <Link
      href={href}
      className="group block bg-mna-white border border-ink/10 hover:border-ink/30 transition-colors"
    >
      {/* Square thumbnail tile — live renderer fills edge-to-edge.
          We deliberately put a transparent click-capture overlay above
          the renderer so clicks always land on the DOM and propagate
          to the enclosing <Link>, regardless of whether the iframe
          honors `pointer-events: none` (some sandboxed iframes don't,
          most notably on agent browsers like ChatGPT Atlas). */}
      <div className="relative bg-mna-white overflow-hidden aspect-square">
        <div className="absolute inset-0 [&>*]:w-full [&>*]:h-full [&_svg]:w-full [&_svg]:h-full [&_img]:w-full [&_img]:h-full [&_img]:object-cover [&_iframe]:w-full [&_iframe]:h-full [&_canvas]:w-full [&_canvas]:h-full">
          <WorkDisplay work={work} size="gallery" framed={false} />
        </div>
        {/* Hover-to-animate. Forty-four works move; a still frame of a
            durational work misrepresents it. Playing on hover rather than
            autoplaying keeps the archive still until a visitor attends to one
            work — an archive that moves on its own reads as a feed. The files
            are ~1KB each, so the eager fetch costs nothing. */}
        {ANIMATED.has(work.id) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/previews/${work.id}.webp`}
            alt=""
            aria-hidden
            loading="lazy"
            className="absolute inset-0 z-[5] w-full h-full object-cover opacity-0 transition-opacity duration-300 motion-safe:group-hover:opacity-100 motion-reduce:hidden"
          />
        )}
        {/* Click-capture overlay — sits above the renderer to ensure
            navigation always works. */}
        <span className="absolute inset-0 z-10" aria-hidden />
        {/* Status dot — sits above the overlay. */}
        <span
          className={`absolute top-2 right-2 z-20 w-1.5 h-1.5 rounded-full ${statusDot(work.canon_status)}`}
          aria-hidden
        />
      </div>

      {/* Placard */}
      <div className="px-4 py-4 md:px-5 md:py-5">
        <p className="text-[10px] font-sans uppercase tracking-[0.06em] text-ink/55 mb-1.5 truncate">
          {work.id}
        </p>
        <h3 className="font-display italic text-[17px] leading-tight text-ink mb-1.5 line-clamp-1">
          {titleText}
        </h3>
        <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/75 mb-3 truncate">
          {originator}
        </p>
        <p className="text-[11px] font-sans text-ink/60 mb-4">
          {statusLabel(work.canon_status)}
          <span className="mx-1.5 text-ink/30">·</span>
          {formatDatePretty(displayDate)}
        </p>
        <div className="flex items-center justify-between">
          <IconStrip activeKind={kind} />
          <span className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55">
            Phase {work.phase_at_submission || "I"}
          </span>
        </div>
      </div>
    </Link>
  );
}
