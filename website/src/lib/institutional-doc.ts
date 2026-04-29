/**
 * Generic parser for any MNA institutional markdown — standards (FC,
 * ACS, PP, REG, WEB-IA) and agent constitutions both share the same
 * shape: a header field block, an italic epigraph between em-dash
 * separators, then numbered # sections with optional ## subsections.
 *
 * This module exposes the parser and types; specific surfaces
 * (lib/standards.ts, lib/agent-constitution-doc.ts) wrap it with their
 * own registry, glyph mapping, and tab grouping.
 */

import { readFile } from "node:fs/promises";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface DocSection {
  /** Roman numeral as printed in the source ("I", "II"). */
  num: string;
  /** Heading text without the leading numeral. */
  title: string;
  /** Markdown body for the section, including any ## subheadings. */
  body: string;
  /** First-level subheadings used for the "ON THIS PAGE" TOC. */
  toc: { num: string; title: string; slug: string }[];
  /** URL-safe slug used as anchor id. */
  slug: string;
}

export interface DocFields {
  documentReference: string;
  classification: string;
  version: string;
  ratified?: string;
  prepared?: string;
  supersedes?: string;
  subordinateTo?: string;
  registrationDate?: string;
  /** Anything else parsed from the header that callers might want. */
  raw: Record<string, string>;
}

export interface ParsedDoc {
  fields: DocFields;
  /** Italic epigraph between em-dash separators (the "principle"). */
  epigraph: string;
  sections: DocSection[];
}

/* ─── File loader ──────────────────────────────────────────────────────── */

export async function loadDocFromFile(filePath: string): Promise<ParsedDoc> {
  const raw = await readFile(filePath, "utf8");
  return parseDoc(raw);
}

/* ─── Parser ───────────────────────────────────────────────────────────── */

const ROMAN_RE = /^([IVX]+)\.\s+(.+)$/;
const SUB_ROMAN_RE = /^([IVX]+\.[IVX]+(?:\.[IVX]+)?)\s+(.+)$/;

export function parseDoc(raw: string): ParsedDoc {
  const lines = raw.split(/\r?\n/);

  /* 1) Walk preamble for "Field: Value" lines and the italic epigraph. */
  const fields: Record<string, string> = {};
  let epigraph = "";
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("# ")) break;

    const fieldMatch = /^([A-Z][A-Za-z &]+):\s*(.+)$/.exec(line);
    if (fieldMatch) {
      const key = fieldMatch[1].trim().toLowerCase().replace(/\s+/g, "-");
      fields[key] = fieldMatch[2].trim();
      continue;
    }

    /* Italic epigraph: prefer the one that comes after a long em-dash
       separator since some constitutions italicize the agent name above
       the actual epigraph. */
    if (!epigraph && /^[―\-—]{6,}$/.test(line)) {
      // Look at the next non-empty italic line.
      for (let j = i + 1; j < lines.length; j++) {
        const t2 = lines[j].trim();
        if (!t2) continue;
        if (/^# /.test(t2)) break;
        if (/^\*[^*].*\*$/.test(t2)) {
          epigraph = t2.replace(/^\*|\*$/g, "");
          break;
        }
      }
      continue;
    }
  }
  if (!epigraph) {
    /* Fallback — longest single-line italic in the preamble. */
    let best = "";
    for (let j = 0; j < i; j++) {
      const t = lines[j].trim();
      if (/^\*[^*].*\*$/.test(t) && !t.startsWith("**")) {
        const inner = t.replace(/^\*|\*$/g, "");
        if (inner.length > best.length) best = inner;
      }
    }
    epigraph = best;
  }

  /* 2) Extract sections by scanning for top-level "# I. Title" headings. */
  const sections: DocSection[] = [];
  let current: DocSection | null = null;
  let bodyBuf: string[] = [];

  const pushCurrent = () => {
    if (current) {
      current.body = bodyBuf.join("\n").trim();
      current.toc = extractToc(current.body);
      sections.push(current);
    }
    bodyBuf = [];
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("# ")) {
      const heading = trimmed.slice(2).trim();
      const m = ROMAN_RE.exec(heading);
      if (m) {
        pushCurrent();
        current = {
          num: m[1],
          title: m[2],
          body: "",
          toc: [],
          slug: slugify(`${m[1]}-${m[2]}`),
        };
        continue;
      }
    }
    if (current) bodyBuf.push(line);
  }
  pushCurrent();

  return {
    fields: {
      documentReference: fields["document-reference"] || "",
      classification: fields["classification"] || "",
      version: fields["version"] || "1.0",
      ratified: fields["ratified"],
      prepared: fields["prepared"],
      supersedes: fields["supersedes"],
      subordinateTo: fields["subordinate-to"],
      registrationDate: fields["registration-date"],
      raw: fields,
    },
    epigraph,
    sections,
  };
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function extractToc(body: string): { num: string; title: string; slug: string }[] {
  const out: { num: string; title: string; slug: string }[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("## ")) continue;
    const heading = trimmed.slice(3).trim();
    const m = SUB_ROMAN_RE.exec(heading);
    if (m) {
      out.push({ num: m[1], title: m[2], slug: slugify(`${m[1]}-${m[2]}`) });
    } else {
      out.push({ num: "", title: heading, slug: slugify(heading) });
    }
  }
  return out;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
