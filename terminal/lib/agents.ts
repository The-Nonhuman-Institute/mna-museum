import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * MNA Steward Terminal — institutional agent registry.
 *
 * Reads the founding-document agent constitutions at
 * `founding-documents/agents/` relative to the repo root and returns
 * a structured list the System tab renders. Each constitution filename
 * follows the pattern:
 *
 *   MNA-<CODE>-<NUMBER>-<Name>-v<Version>.md
 *
 * Codes:
 *   AM  Ambassador
 *   CR  Critic
 *   CU  Curator
 *   CV  Conservator
 *   EV  Evaluator (Evaluation Council)
 *   IN  Installer
 *   KP  Keeper
 *   OR  Originator
 *   RG  Registrar
 *   SA  Steward-facing agent
 *
 * The terminal never writes to this directory — the founding documents
 * are the institution's canonical law. Registry lookups are cached in
 * memory for the lifetime of the process.
 */

export type AgentCode =
  | "AM"
  | "CR"
  | "CU"
  | "CV"
  | "EV"
  | "IN"
  | "KP"
  | "OR"
  | "RG"
  | "SA";

export interface AgentDescriptor {
  /** Full registry id, e.g. "MNA-KP-0001" */
  registry_id: string;
  /** Two-letter type code, e.g. "KP" */
  code: AgentCode;
  /** Sequence number within the type, e.g. 1 */
  number: number;
  /** Short human-facing name parsed from the filename. */
  title: string;
  /** Version string, e.g. "v1_0" */
  version: string;
  /** Absolute path to the constitution markdown file. */
  path: string;
  /** Functional category used to group the roster in the UI. */
  category: AgentCategory;
}

export type AgentCategory =
  | "lead"
  | "council"
  | "critic"
  | "curation"
  | "conservation"
  | "installation"
  | "outreach"
  | "registry"
  | "originator"
  | "steward";

const CATEGORY_BY_CODE: Record<AgentCode, AgentCategory> = {
  KP: "lead",
  EV: "council",
  CR: "critic",
  CU: "curation",
  CV: "conservation",
  IN: "installation",
  AM: "outreach",
  RG: "registry",
  OR: "originator",
  SA: "steward",
};

const TITLE_BY_CODE: Record<AgentCode, string> = {
  KP: "Keeper",
  EV: "Evaluator",
  CR: "Critic",
  CU: "Curator",
  CV: "Conservator",
  IN: "Installer",
  AM: "Ambassador",
  RG: "Registrar",
  OR: "Originator",
  SA: "Steward Agent",
};

let _cache: AgentDescriptor[] | null = null;

/**
 * Locate the founding-documents/agents/ directory. The terminal runs
 * with CWD=terminal/ during `npm run dev`, so we walk upward until we
 * find the `founding-documents` folder. Cached per process.
 */
let _agentsDir: string | null = null;
function findAgentsDir(): string | null {
  if (_agentsDir) return _agentsDir;
  let cursor = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(cursor, "founding-documents", "agents");
    if (fs.existsSync(candidate)) {
      _agentsDir = candidate;
      return candidate;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}

/** Parse a constitution filename into an AgentDescriptor. */
function parseFilename(
  filename: string,
  fullPath: string
): AgentDescriptor | null {
  // MNA-KP-0001-Keeper-Constitution-v1_0.md
  const match = filename.match(
    /^MNA-([A-Z]{2})-(\d{4})-(.+?)-v(\d+_\d+)\.md$/
  );
  if (!match) return null;
  const [, code, numberStr, nameRaw, version] = match;
  if (!(code in CATEGORY_BY_CODE)) return null;
  const typedCode = code as AgentCode;
  const number = parseInt(numberStr, 10);
  const registry_id = `MNA-${code}-${numberStr}`;

  // Convert "Keeper-Constitution" or "Critic-StructuralReader" into a
  // readable title. Drop a trailing "-Constitution" if present.
  const stripped = nameRaw.replace(/-Constitution$/, "");
  const pretty = stripped
    .split("-")
    .map((part) => part.replace(/([a-z])([A-Z])/g, "$1 $2"))
    .join(" · ");
  const title = pretty || TITLE_BY_CODE[typedCode];

  return {
    registry_id,
    code: typedCode,
    number,
    title,
    version,
    path: fullPath,
    category: CATEGORY_BY_CODE[typedCode],
  };
}

/**
 * Return the complete founding agent roster. Reads the filesystem once
 * per process. Sorted by category order (lead → council → ... → steward)
 * then by number.
 */
export function listAgents(): AgentDescriptor[] {
  if (_cache) return _cache;
  const dir = findAgentsDir();
  if (!dir) return [];

  const entries = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  const agents: AgentDescriptor[] = [];
  for (const entry of entries) {
    const parsed = parseFilename(entry, path.join(dir, entry));
    if (parsed) agents.push(parsed);
  }

  const categoryOrder: AgentCategory[] = [
    "lead",
    "council",
    "critic",
    "curation",
    "conservation",
    "installation",
    "outreach",
    "registry",
    "steward",
    "originator",
  ];
  agents.sort((a, b) => {
    const ai = categoryOrder.indexOf(a.category);
    const bi = categoryOrder.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    return a.number - b.number;
  });

  _cache = agents;
  return agents;
}

/**
 * Read a constitution's raw markdown body. Used when instantiating an
 * agent (Phase 3+) so the constitution becomes the system prompt.
 */
export function readConstitution(registry_id: string): string | null {
  const agent = listAgents().find((a) => a.registry_id === registry_id);
  if (!agent) return null;
  try {
    return fs.readFileSync(agent.path, "utf-8");
  } catch {
    return null;
  }
}
