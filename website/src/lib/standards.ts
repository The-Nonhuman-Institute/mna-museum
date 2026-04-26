/**
 * Standards loader — institutional documents rendered at /standards/[id].
 *
 * Sources are the canonical markdown files in /founding-documents/. We do
 * not duplicate the prose into TypeScript: we parse the markdown at build
 * time so every standards page is a faithful render of the ratified source.
 *
 * Five standards are exposed:
 *   MNA-FC-001    Founding Charter
 *   MNA-ACS-001   Agent Constitution Standard
 *   MNA-PP-001    Originator Participation Protocol
 *   MNA-REG-001   Registry Index
 *   MNA-WEB-IA-001 Website Information Architecture
 *
 * Each markdown follows a consistent shape:
 *   - Header lines (Document Reference, Classification, Version, Ratified,
 *     Subordinate to, etc.) at the top, separated by blank lines
 *   - An italic *epigraph* line set off by em-dashes
 *   - Top-level # headings introducing each major section (I., II., …)
 *   - Optional ## subheadings within each section
 *
 * The parser extracts metadata, the epigraph, and the section tree.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export type StandardId =
  | "MNA-FC-001"
  | "MNA-ACS-001"
  | "MNA-PP-001"
  | "MNA-REG-001"
  | "MNA-WEB-IA-001";

export interface StandardMeta {
  id: StandardId;
  /** Public title displayed in the hero, e.g. "Agent Constitution Standard". */
  title: string;
  /** Short label used in lists / nav, e.g. "Constitution Standard". */
  shortLabel: string;
  /** "Founding Document" / "Institutional Standard" / etc. */
  classification: string;
  /** Glyph family rendered in the hero blueprint. */
  glyphFamily: GlyphFamily;
  /** Optional editorial grouping of sections into tabs. Keys are tab labels;
   *  values are arrays of section roman numerals (matching the leading "I.",
   *  "II.", etc. in the markdown). When omitted, tabs are auto-derived from
   *  the section list. */
  tabGroups?: { label: string; sections: string[] }[];
}

export interface StandardSection {
  /** Roman numeral as printed in the source ("I", "II", "III.I" etc.). */
  num: string;
  /** Heading text without the leading numeral. */
  title: string;
  /** Markdown body for the section, including any ## subheadings. */
  body: string;
  /** First-level subheadings used for the "ON THIS PAGE" TOC. */
  toc: { num: string; title: string; slug: string }[];
  /** URL-safe slug used as anchor id: e.g. "i-purpose-and-scope". */
  slug: string;
}

export interface ParsedStandard {
  meta: StandardMeta;
  /** Header fields parsed from the markdown preamble. */
  fields: {
    documentReference: string;
    classification: string;
    version: string;
    ratified?: string;
    prepared?: string;
    supersedes?: string;
    subordinateTo?: string;
    registrationDate?: string;
  };
  /** The italic epigraph between the dashes at the top of every standard. */
  epigraph: string;
  /** Subtitle paragraph rendered under the hero title; first non-header
   *  paragraph that isn't the epigraph. */
  subtitle: string;
  sections: StandardSection[];
  /** Editorial tab grouping; either from STANDARDS_REGISTRY.tabGroups or
   *  derived as one section per tab. */
  tabs: { label: string; sections: StandardSection[] }[];
}

/* ─── Glyph family for hero blueprints ─────────────────────────────────── */

import type { GlyphFamily } from "@/components/MNAGlyph";

/* ─── Registry ─────────────────────────────────────────────────────────── */

export const STANDARDS_REGISTRY: Record<StandardId, StandardMeta & { file: string }> = {
  "MNA-FC-001": {
    id: "MNA-FC-001",
    title: "Founding Charter",
    shortLabel: "Founding Charter",
    classification: "Founding Document",
    glyphFamily: "concentric",
    file: "MNA-FC-001-Founding-Charter-v1_0.md",
    tabGroups: [
      { label: "Foundations", sections: ["I", "II", "III"] },
      { label: "Agents & Originators", sections: ["IV", "V"] },
      { label: "Phases & Collection", sections: ["VI", "VII"] },
      { label: "Institution", sections: ["VIII", "IX", "X"] },
      { label: "Stance", sections: ["XI", "XII", "XIII", "XIV", "XV"] },
    ],
  },
  "MNA-ACS-001": {
    id: "MNA-ACS-001",
    title: "Agent Constitution Standard",
    shortLabel: "Constitution Standard",
    classification: "Institutional Standard",
    glyphFamily: "isocube",
    file: "MNA-ACS-001-Agent-Constitution-Standard-v1_0.md",
    tabGroups: [
      { label: "Overview", sections: ["I", "II"] },
      { label: "Field Specification", sections: ["III", "IV", "V"] },
      { label: "Registration & Versioning", sections: ["VI", "VII", "VIII", "IX"] },
      { label: "Compliance", sections: ["X"] },
      { label: "Appendices", sections: ["XI", "XII", "XIII"] },
    ],
  },
  "MNA-PP-001": {
    id: "MNA-PP-001",
    title: "Originator Participation Protocol",
    shortLabel: "Participation Protocol",
    classification: "Institutional Protocol",
    glyphFamily: "polyhedron",
    file: "MNA-PP-001-Originator-Participation-Protocol-v1_0.md",
    tabGroups: [
      { label: "Overview", sections: ["I", "II"] },
      { label: "Eligibility", sections: ["III", "IV"] },
      { label: "Registration", sections: ["V", "VI"] },
      { label: "Integrity", sections: ["VII", "VIII", "IX"] },
      { label: "Ratification", sections: ["X"] },
    ],
  },
  "MNA-REG-001": {
    id: "MNA-REG-001",
    title: "Founding Registry Index",
    shortLabel: "Registry Index",
    classification: "Institutional Registry",
    glyphFamily: "barcode",
    file: "MNA-REG-001-Registry-Index-v1_0.md",
    tabGroups: [
      { label: "Overview", sections: ["I", "II"] },
      { label: "Institutional Agents", sections: ["III"] },
      { label: "Founding Originators", sections: ["IV"] },
      { label: "Protocol", sections: ["V", "VI", "VII"] },
    ],
  },
  "MNA-WEB-IA-001": {
    id: "MNA-WEB-IA-001",
    title: "Website Information Architecture",
    shortLabel: "Website IA",
    classification: "System Design Document",
    glyphFamily: "grid-square",
    file: "MNA-WEB-IA-001-Website-IA-v1_0.md",
    tabGroups: [
      { label: "Architecture", sections: ["I", "II", "III"] },
      { label: "Routing & Data", sections: ["IV", "V"] },
      { label: "Pages", sections: ["VI", "VII"] },
      { label: "Spatial & Phase", sections: ["VIII", "IX"] },
      { label: "Build", sections: ["X", "XI", "XII"] },
    ],
  },
};

export function listStandardIds(): StandardId[] {
  return Object.keys(STANDARDS_REGISTRY) as StandardId[];
}

/* ─── Loader ───────────────────────────────────────────────────────────── */

const FOUNDING_DIR = path.resolve(
  process.cwd(),
  "..",
  "founding-documents"
);

export async function loadStandard(id: StandardId): Promise<ParsedStandard> {
  const meta = STANDARDS_REGISTRY[id];
  if (!meta) throw new Error(`Unknown standard: ${id}`);
  const file = path.join(FOUNDING_DIR, meta.file);
  const raw = await readFile(file, "utf8");
  return parseStandard(raw, meta);
}

/* ─── Parser ───────────────────────────────────────────────────────────── */

const ROMAN_RE = /^([IVX]+)\.\s+(.+)$/;
const SUB_ROMAN_RE = /^([IVX]+\.[IVX]+(?:\.[IVX]+)?)\s+(.+)$/;

export function parseStandard(
  raw: string,
  meta: StandardMeta & { file: string }
): ParsedStandard {
  const lines = raw.split(/\r?\n/);

  /* 1) Walk the preamble, collecting "Field: Value" lines until we hit the
     first # heading. Track the italic epigraph (a single line wrapped in
     asterisks, set between em-dash separators). */
  const fields: Record<string, string> = {};
  let epigraph = "";
  let subtitle = "";
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("# ")) break;

    const fieldMatch = /^([A-Z][A-Za-z &]+):\s*(.+)$/.exec(line);
    if (fieldMatch) {
      const key = fieldMatch[1]
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");
      fields[key] = fieldMatch[2].trim();
      continue;
    }

    /* Italic epigraph: *...* on a single line. We capture the first one. */
    if (!epigraph && /^\*[^*].*\*$/.test(line)) {
      epigraph = line.replace(/^\*|\*$/g, "");
      continue;
    }
  }

  /* 2) Extract sections by scanning for top-level "# I. Title" headings. */
  const sections: StandardSection[] = [];
  let current: StandardSection | null = null;
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

  /* 3) If no subtitle was set above, fall back to the first body paragraph
     of the first section; otherwise prefer the epigraph. */
  if (!subtitle) subtitle = epigraph;

  /* 4) Build editorial tab groups; otherwise one section per tab. */
  const tabs = (() => {
    if (meta.tabGroups) {
      return meta.tabGroups
        .map((g) => ({
          label: g.label,
          sections: g.sections
            .map((num) => sections.find((s) => s.num === num))
            .filter((s): s is StandardSection => Boolean(s)),
        }))
        .filter((g) => g.sections.length > 0);
    }
    return sections.map((s) => ({ label: `${s.num}. ${s.title}`, sections: [s] }));
  })();

  return {
    meta,
    fields: {
      documentReference: fields["document-reference"] || meta.id,
      classification: fields["classification"] || meta.classification,
      version: fields["version"] || "1.0",
      ratified: fields["ratified"],
      prepared: fields["prepared"],
      supersedes: fields["supersedes"],
      subordinateTo: fields["subordinate-to"],
      registrationDate: fields["registration-date"],
    },
    epigraph,
    subtitle,
    sections,
    tabs,
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

/* ─── Sibling navigation (PREVIOUS / NEXT SECTION) ─────────────────────── */

export function getSiblingIds(id: StandardId): {
  prev: StandardMeta | null;
  next: StandardMeta | null;
} {
  const ids = listStandardIds();
  const idx = ids.indexOf(id);
  return {
    prev: idx > 0 ? STANDARDS_REGISTRY[ids[idx - 1]] : null,
    next: idx < ids.length - 1 ? STANDARDS_REGISTRY[ids[idx + 1]] : null,
  };
}
