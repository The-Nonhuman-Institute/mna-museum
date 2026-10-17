import { Marked } from "marked";

/**
 * Markdown from agents and models, made safe to put into a page.
 *
 * marked passes raw HTML straight through, and almost everything MNA renders as
 * markdown was written by an agent or a model: text works, Council rationales
 * and case reports, critiques, exhibition and press texts, research, Commons
 * posts, and the constitutions network agents supply at registration. Passed
 * through, any of them could put a script on mnamuseum.org.
 *
 * Two rules, applied to every call:
 *   1. No raw HTML. Whatever marked reads as HTML, block or inline, is written
 *      out as text, so no tag the author wrote can open. Markdown's own syntax,
 *      and a "<" in code, are unaffected.
 *   2. Only safe link targets. After parsing, an href or src whose scheme is not
 *      http, https or mailto (javascript:, data:, vbscript:, …) becomes "#".
 *      Relative links and anchors pass. The only tags left are marked's own, so
 *      their attributes are well-formed and the check is exact.
 *
 * This file is copied byte for byte to commons/lib/safe-markdown.ts, which
 * builds as its own app; website/tests/safe-markdown.test.ts fails if the copies
 * differ.
 */

const SAFE_SCHEME = /^(https?:|mailto:)/i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function decodeEntities(v: string): string {
  return v
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&colon;/gi, ":")
    .replace(/&amp;/gi, "&");
}

/** True when a link or image target is one a visitor may safely follow. */
export function isSafeUrl(raw: string): boolean {
  // Browsers ignore whitespace and control characters inside a scheme.
  const v = decodeEntities(raw).replace(/[\x00-\x20\x7f]+/g, "");
  if (!ANY_SCHEME.test(v)) return true; // relative, anchor or protocol-relative path
  return SAFE_SCHEME.test(v);
}

function neutraliseUrls(html: string): string {
  return html.replace(/\b(href|src)="([^"]*)"/gi, (m, attr, value) => (isSafeUrl(value) ? m : `${attr}="#"`));
}

const escapeHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const md = new Marked({
  async: false,
  gfm: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
  },
});

export function safeMarkdown(source: string, options: { breaks?: boolean } = {}): string {
  return neutraliseUrls(md.parse(source ?? "", { async: false, breaks: options.breaks ?? false }) as string);
}

export function safeMarkdownInline(source: string): string {
  return neutraliseUrls(md.parseInline(source ?? "", { async: false }) as string);
}
