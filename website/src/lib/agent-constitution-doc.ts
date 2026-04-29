/**
 * Loader for agent constitution documents — sibling of lib/standards.ts.
 *
 * Each constitution lives in /founding-documents/agents/MNA-XX-YYYY-…md
 * and follows the same shape as the standards (header fields + epigraph
 * + numbered # sections). The same StandardClient renders both because
 * the structure is identical.
 *
 * The agent registry resolves an id (e.g. MNA-EV-0001) to a markdown
 * file by globbing the agents directory. We don't hand-curate per-agent
 * tab groups — the doc layout is consistent enough that one tab per
 * top-level section works without per-doc curation.
 */

import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  loadDocFromFile,
  type ParsedDoc,
  type DocSection,
} from "./institutional-doc";
import type { AgentType } from "./agents";
import type { GlyphFamily } from "@/components/MNAGlyph";

const AGENTS_DIR = path.resolve(
  process.cwd(),
  "..",
  "founding-documents",
  "agents"
);

/* ─── Glyph family per agent type ──────────────────────────────────────── */

const FAMILY_BY_TYPE: Partial<Record<AgentType, GlyphFamily>> = {
  EVALUATOR: "polyhedron",
  KEEPER: "fractured-disc",
  CRITIC: "starburst",
  AMBASSADOR: "starburst-long",
  CURATOR: "grid-square",
  INSTALLER: "isocube",
  CONSERVATOR: "concentric",
  REGISTRAR: "barcode",
  STEWARD: "targeting-ring",
  ORIGINATOR: "constellation",
};

/* ─── File index ───────────────────────────────────────────────────────── */

let _files: Map<string, string> | null = null;

async function indexFiles(): Promise<Map<string, string>> {
  if (_files) return _files;
  const map = new Map<string, string>();
  try {
    const files = await readdir(AGENTS_DIR);
    for (const f of files) {
      const m = /^(MNA-[A-Z]{2}-\d{4})/.exec(f);
      if (m) map.set(m[1], path.join(AGENTS_DIR, f));
    }
  } catch {
    /* directory missing on some deploy targets — empty map is fine */
  }
  _files = map;
  return map;
}

/* ─── Public ───────────────────────────────────────────────────────────── */

export interface AgentConstitutionDoc {
  registryId: string;
  agentType: AgentType;
  designation: string;
  glyphFamily: GlyphFamily;
  doc: ParsedDoc;
  /** Tabs derived from sections — one tab per top-level section. */
  tabs: { label: string; sections: DocSection[] }[];
}

export async function loadConstitutionDoc(
  registryId: string,
  agentType: AgentType,
  designation: string
): Promise<AgentConstitutionDoc | null> {
  const files = await indexFiles();
  const file = files.get(registryId);
  if (!file) return null;
  const doc = await loadDocFromFile(file);

  /* Derive tabs from sections. Constitutions average 5 sections (Preamble,
     Formal Constitution, Function/Role, Evolution, Ratification) so a
     1-tab-per-section layout is readable without curation. */
  const tabs = doc.sections.map((s) => ({
    label: cleanTabLabel(s.title),
    sections: [s],
  }));

  return {
    registryId,
    agentType,
    designation,
    glyphFamily: FAMILY_BY_TYPE[agentType] ?? "concentric",
    doc,
    tabs,
  };
}

/* "Formal Constitution" → "Formal Constitution"; fall back to truncation
   for over-long section titles. */
function cleanTabLabel(s: string): string {
  if (s.length > 32) return s.slice(0, 30).trim() + "…";
  return s;
}

export async function listConstitutionIds(): Promise<string[]> {
  const files = await indexFiles();
  return Array.from(files.keys());
}
