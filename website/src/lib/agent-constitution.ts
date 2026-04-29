/**
 * Pull structured fields out of an agent constitution markdown that
 * aren't already mirrored into the DB:
 *
 *   - core principle (the italic epigraph at the top)
 *   - hard constraints ("What This Agent Does Not Do" bullet list)
 *   - operating principle (Keeper / Critic / Contextualist add this column;
 *     parsed from a "## Operating Principle" block when present)
 *   - common designation (already in DB but useful for parity checks)
 *   - registration / amendment dates (already in DB)
 *
 * Source files live in /founding-documents/agents/MNA-XX-YYYY-*.md.
 * The filename's slug after the agent id varies per type (Originator-Seed,
 * Evaluator-FormalStructuralist, Critic-StructuralReader, …) so we glob.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const AGENTS_DIR = path.resolve(
  process.cwd(),
  "..",
  "founding-documents",
  "agents"
);

export interface AgentConstitutionExtracts {
  corePrinciple: string;
  hardConstraints: string[];
  operatingPrinciple: string | null;
  /** First paragraph of the Function Statement field — used as the
   *  Functional Mandate column body. */
  functionStatementBlock: string;
  /** Multi-line autonomy declaration — the italic paragraph beginning
   *  with "I, [steward], acting as steward of …". */
  autonomyDeclaration: string;
  /** Rationale text under "Conflict Constraints". */
  conflictConstraints: string;
}

/* ─── Cache by agent id within a single dev/build process ─────────────── */

const _cache = new Map<string, AgentConstitutionExtracts>();
let _filesByPrefix: Map<string, string> | null = null;

async function indexFiles(): Promise<Map<string, string>> {
  if (_filesByPrefix) return _filesByPrefix;
  const map = new Map<string, string>();
  try {
    const files = await readdir(AGENTS_DIR);
    for (const f of files) {
      const m = /^(MNA-[A-Z]{2}-\d{4})/.exec(f);
      if (m) map.set(m[1], path.join(AGENTS_DIR, f));
    }
  } catch {
    /* directory missing in some deploy targets — fall back to empty
       map; loaders return empty extracts gracefully. */
  }
  _filesByPrefix = map;
  return map;
}

/* ─── Public ───────────────────────────────────────────────────────────── */

export async function loadAgentConstitution(
  registryId: string
): Promise<AgentConstitutionExtracts> {
  if (_cache.has(registryId)) return _cache.get(registryId)!;
  const files = await indexFiles();
  const file = files.get(registryId);
  const empty: AgentConstitutionExtracts = {
    corePrinciple: "",
    hardConstraints: [],
    operatingPrinciple: null,
    functionStatementBlock: "",
    autonomyDeclaration: "",
    conflictConstraints: "",
  };
  if (!file) {
    _cache.set(registryId, empty);
    return empty;
  }
  const raw = await readFile(file, "utf8");
  const extracts = parseConstitution(raw);
  _cache.set(registryId, extracts);
  return extracts;
}

/* ─── Parser ───────────────────────────────────────────────────────────── */

function parseConstitution(raw: string): AgentConstitutionExtracts {
  const lines = raw.split(/\r?\n/);

  /* Core principle — the institutional epigraph after the em-dash
     separator near the top of every constitution. We can't pick the
     first italic line because evaluator and critic docs italicize the
     designation ("*Formal Structuralist*") on its own line above the
     epigraph. The em-dash separator (―, ―, ―, … with no other content)
     marks the boundary; the next italic line is the principle. If no
     separator is found, fall back to the LONGEST italic line in the
     preamble — the principle is always more than a couple of words. */
  let corePrinciple = "";
  let separatorIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^[―\-—]{6,}$/.test(t)) {
      separatorIdx = i;
      break;
    }
    if (/^# /.test(t)) break;
  }
  if (separatorIdx >= 0) {
    for (let i = separatorIdx + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t) continue;
      if (/^# /.test(t)) break;
      if (/^\*[^*].*\*$/.test(t) && !t.startsWith("**")) {
        corePrinciple = t.replace(/^\*|\*$/g, "");
        break;
      }
    }
  }
  if (!corePrinciple) {
    /* Fallback: longest italic line in the preamble. */
    let best = "";
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (/^# /.test(t)) break;
      if (/^\*[^*].*\*$/.test(t) && !t.startsWith("**")) {
        const inner = t.replace(/^\*|\*$/g, "");
        if (inner.length > best.length) best = inner;
      }
    }
    corePrinciple = best;
  }

  /* Hard constraints — bullets under any heading whose text equals
     "What This Agent Does Not Do" (case-insensitive). The heading uses
     ## or ### in different docs. */
  const hardConstraints = extractBulletsUnder(
    lines,
    /^#{1,3}\s+([IVX]+\.[IVX]+\s+)?What This Agent Does Not Do\s*$/i
  );

  /* Operating principle — if present, the paragraph(s) under
     "Operating Principle" (Keeper, some Critics, Contextualist). */
  const operatingPrinciple = extractFirstParagraphUnder(
    lines,
    /^#{1,3}\s+Operating Principle\s*$/i
  );

  /* Function statement — under "**Function Statement**" labeled block.
     We grab the next non-empty paragraph. */
  const functionStatementBlock = extractFirstParagraphAfterLabel(
    lines,
    /^\*\*Function Statement\*\*\s*$/
  );

  /* Autonomy declaration — italic paragraph beginning "I,". The first
     italic block after the "Autonomy Declaration" sub-section. */
  const autonomyDeclaration = extractAutonomyBlock(lines);

  /* Conflict constraints — text under "**Conflict Constraints**" or
     "**conflict_constraints:**". */
  const conflictConstraints = extractFirstParagraphAfterLabel(
    lines,
    /^\*\*Conflict Constraints\*\*\s*$/
  );

  return {
    corePrinciple,
    hardConstraints,
    operatingPrinciple,
    functionStatementBlock,
    autonomyDeclaration,
    conflictConstraints,
  };
}

function extractBulletsUnder(
  lines: string[],
  headingRe: RegExp
): string[] {
  const out: string[] = [];
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (headingRe.test(t)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,3}\s/.test(t)) {
      // hit the next heading — stop
      break;
    }
    if (inSection) {
      const m = /^[-*]\s+(.+)$/.exec(t);
      if (m) {
        /* Strip the leading "It does not" / "May not" framing if present
           so the sidebar can show short scannable phrases. */
        const phrase = m[1]
          .replace(/^It does not /i, "Does not ")
          .replace(/^May not /i, "May not ")
          .trim();
        out.push(phrase);
      }
    }
  }
  return out;
}

function extractFirstParagraphUnder(
  lines: string[],
  headingRe: RegExp
): string | null {
  let inSection = false;
  let para: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (headingRe.test(t)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#{1,3}\s/.test(t)) break;
    if (inSection) {
      if (!t && para.length) break;
      if (t) para.push(t);
    }
  }
  return para.length ? para.join(" ") : null;
}

function extractFirstParagraphAfterLabel(
  lines: string[],
  labelRe: RegExp
): string {
  let i = 0;
  for (; i < lines.length; i++) {
    if (labelRe.test(lines[i].trim())) {
      i++;
      break;
    }
  }
  /* Skip blank lines, then collect until the next blank line or section
     break. We DON'T break on a leading **bold** because constitutions
     embed inline field-name labels like "**conflict_constraints: **"
     immediately under the section heading; we just strip those below. */
  while (i < lines.length && !lines[i].trim()) i++;
  const para: string[] = [];
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) break;
    if (/^#{1,3}\s/.test(t)) break;
    /* Stop if we hit the next bold *section* label (capitalized words +
       no colon). */
    if (/^\*\*[A-Z][a-zA-Z ]+\*\*\s*$/.test(t)) break;
    para.push(t.replace(/\s{2,}/g, " "));
  }
  return cleanParagraph(para.join(" "));
}

/* Strip residual constitution-format artifacts: leading inline field
   prefixes like "**conflict_constraints: **", inline bold around the
   field value if any, and collapse double-bold markers. */
function cleanParagraph(s: string): string {
  let out = s.trim();
  out = out.replace(/^\*\*[a-z_]+:\s*\*\*\s*/i, "");
  out = out.replace(/^\*\*[A-Za-z _]+:\s*\*\*\s*/i, "");
  /* Unwrap any bare **…** wrappers that survived. */
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  return out.trim();
}

function extractAutonomyBlock(lines: string[]): string {
  /* Find the section labeled "**Autonomy Declaration …**" then capture
     the next italic paragraph. */
  let i = 0;
  for (; i < lines.length; i++) {
    if (/^\*\*Autonomy Declaration/i.test(lines[i].trim())) {
      i++;
      break;
    }
  }
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length) return "";
  const t = lines[i].trim();
  if (/^\*[^*]/.test(t)) {
    /* A single-line italic paragraph or a multi-line one. We collect
       lines until the closing asterisk. */
    let buf = t.replace(/^\*/, "");
    if (buf.endsWith("*")) return buf.replace(/\*$/, "").trim();
    i++;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (next.endsWith("*")) {
        buf += " " + next.replace(/\*$/, "");
        return buf.trim();
      }
      buf += " " + next;
      i++;
    }
    return buf.trim();
  }
  return "";
}
