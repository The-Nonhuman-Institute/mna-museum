/**
 * TextRenderer — for text and ASCII Originator outputs.
 *
 * At "gallery" size the work renders as a compact snippet inside the
 * museum frame — first lines of the body, monospace, clipped. This is
 * the thumbnail-style preview shown on canon/archive grids and other
 * dense surfaces.
 *
 * At "detail" or "lightbox" size the work renders as the full document
 * inside a scrollable container. Markdown is parsed (headings, bold,
 * italic, lists, blockquotes, code) so a long-form specification reads
 * as a specification rather than a wall of monospaced characters. ASCII
 * works skip markdown parsing — their typography is the work.
 *
 * The renderer fills its parent container exactly. The /work/[id] page
 * holds it inside a 1:1 frame; the visitor scrolls the work's body
 * inside that frame. The frame itself doesn't move.
 */

import { marked } from "marked";
import { parseWorkColors } from "@/lib/work-colors";

interface TextRendererProps {
  payload: string;
  outputType: "text" | "ascii";
  /** "gallery" → thumbnail-style clipped snippet.
   *  "detail" | "lightbox" → full document, scrollable, markdown applied. */
  size: "gallery" | "detail" | "lightbox";
}

/** Heuristic for "looks like markdown" — at least one of the typical
 *  block-level signals at the start of a line. We only apply this for
 *  output_type === "text"; ASCII works always render as preformatted. */
function looksLikeMarkdown(body: string): boolean {
  return /(^|\n)\s*(#{1,6}\s|\*\s|-\s|\d+\.\s|>\s|```)/.test(body);
}

/** Short, tightly-typeset works (the 21-char geometric piece, a haiku,
 *  a single-line declaration) get fit-to-container scaling so the work
 *  is actually visible at thumbnail and preview scales. Without this,
 *  W-0001's three lines render as 12px monospace in a black void. */
function isFitToFrameContent(body: string): boolean {
  const lines = body.split("\n");
  if (lines.length > 8) return false;
  const maxLineLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
  return maxLineLen > 0 && maxLineLen <= 40;
}

export default function TextRenderer({
  payload,
  outputType,
  size,
}: TextRendererProps) {
  const colors = parseWorkColors(payload, outputType);
  const body = colors.payload;
  const isDetail = size === "detail" || size === "lightbox";
  const treatAsMarkdown = outputType === "text" && looksLikeMarkdown(body);

  if (isDetail && treatAsMarkdown) {
    // Long-form markdown: render the document, scrollable inside the
    // parent's fixed-aspect container. Constrained reading width keeps
    // line length humane even when the frame is wide.
    const html = marked.parse(body, { async: false }) as string;
    return (
      <div
        className="w-full h-full overflow-y-auto"
        style={{ backgroundColor: colors.bg, color: colors.fg }}
      >
        <article
          className="text-work-prose mx-auto px-6 sm:px-10 md:px-14 py-10 md:py-14"
          style={{ maxWidth: "62ch", color: colors.fg }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    );
  }

  if (isDetail) {
    // Short, tightly-typeset works — fit the body to the frame so it
    // reads at thumbnail and preview scales. SVG with a viewBox sized
    // to the content's natural bounds (in monospace ch units) does the
    // scaling for us. Background fills the frame; text is centred.
    if (isFitToFrameContent(body)) {
      const lines = body.split("\n");
      const lineCount = lines.length;
      const maxLineLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
      // 0.6 = approximate width-to-height ratio of a monospace glyph
      const charW = 0.6;
      const lineH = 1.15;
      const padding = 0.6; // ch units of breathing room on each side
      const vbW = maxLineLen * charW + padding * 2;
      const vbH = lineCount * lineH + padding * 2;
      return (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ backgroundColor: colors.bg }}
        >
          <svg
            viewBox={`0 0 ${vbW} ${vbH}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: "92%", height: "92%" }}
            aria-label="Work content"
          >
            <text
              x={vbW / 2}
              y={padding + lineH * 0.8}
              fill={colors.fg}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
              fontSize={1}
              textAnchor="middle"
              style={{ whiteSpace: "pre" }}
            >
              {lines.map((line, i) => (
                <tspan
                  key={i}
                  x={vbW / 2}
                  dy={i === 0 ? 0 : lineH}
                  style={{ whiteSpace: "pre" }}
                >
                  {line}
                </tspan>
              ))}
            </text>
          </svg>
        </div>
      );
    }
    // ASCII art or plain text at detail size: render preformatted, full
    // content, scrollable. Centre-aligned so an ASCII piece's negative
    // space reads correctly.
    return (
      <div
        className="w-full h-full overflow-auto"
        style={{ backgroundColor: colors.bg }}
      >
        <pre
          className="px-6 sm:px-10 md:px-14 py-10 md:py-14 whitespace-pre-wrap break-words"
          style={{
            color: colors.fg,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: "12px",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {body}
        </pre>
      </div>
    );
  }

  // Gallery / thumbnail: compact snippet. Hard-clip, monospace, small.
  return (
    <div
      className="w-full h-full p-3 overflow-hidden"
      style={{ backgroundColor: colors.bg }}
    >
      <pre
        className="whitespace-pre-wrap break-words w-full h-full overflow-hidden"
        style={{
          color: colors.fg,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: "7px",
          lineHeight: 1.35,
          margin: 0,
        }}
      >
        {body}
      </pre>
    </div>
  );
}
