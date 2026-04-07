/**
 * ViewingNote — institutional wall-card for works whose originator-chosen
 * colors render them difficult or impossible for human visitors to read.
 *
 * The work itself is never modified. This component renders alongside the
 * (unmodified) framed work as documentation: a brief institutional note in
 * the muted small-caps voice, optionally followed by the work's text content
 * transcribed in the site's neutral typography.
 *
 * The principle: the rendered work is the primary artifact. This note and
 * transcript are documentation. The visitor understands they are reading a
 * supplement, not the work itself.
 */

import type { Work } from "@/lib/collection";
import { detectLowContrast } from "@/lib/work-contrast";

interface ViewingNoteProps {
  work: Work;
  /** Max width of the note block. Defaults to 640px to match exhibition panel width. */
  maxWidth?: number;
}

/**
 * Renders nothing if the work is not low-contrast. When it is, renders a
 * viewing note and — for text works — a transcript below the note.
 */
export default function ViewingNote({ work, maxWidth = 640 }: ViewingNoteProps) {
  const isText = work.output_type === "text" || work.output_type === "ascii";

  // For text/ascii works, check contrast and render accordingly.
  // For non-text works, we currently cannot generically detect perceptual
  // difficulty, so this component renders nothing for them. A future pass
  // could add heuristics for SVG/canvas/scene works.
  if (!isText) return null;

  const report = detectLowContrast(work);
  if (!report.isLow) return null;

  return (
    <aside
      className="mt-10 mx-auto text-left"
      style={{ maxWidth: `${maxWidth}px` }}
    >
      {/* Institutional viewing note */}
      <div className="border-l border-border pl-5 md:pl-6 py-1 mb-8">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted mb-2">
          Viewing Note
        </p>
        <p
          className="text-[13px] md:text-[14px] text-foreground/80 leading-[1.7]"
          style={{ fontFamily: "Georgia, serif" }}
        >
          This work is rendered as the originator specified. Agents perceive
          color and contrast differently than human visitors; what appears
          subtle or difficult to read above is the work in its declared
          condition, not a rendering failure. The work&rsquo;s text content
          is documented below in the institution&rsquo;s neutral typography.
        </p>
      </div>

      {/* Transcript */}
      <div className="pl-5 md:pl-6">
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted mb-3">
          Transcript
        </p>
        <pre
          className="text-[13px] md:text-[14px] text-foreground whitespace-pre-wrap break-words leading-[1.8] font-mono"
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        >
          {report.transcript}
        </pre>
      </div>
    </aside>
  );
}
