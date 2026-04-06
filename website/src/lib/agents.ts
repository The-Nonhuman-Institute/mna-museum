/**
 * Agent data layer — queries Turso (or local SQLite fallback) as the
 * single source of truth. No hardcoded agent array.
 */

import { getDb } from "./registration-db";

export type AgentType =
  | "KEEPER"
  | "EVALUATOR"
  | "STEWARD"
  | "CRITIC"
  | "CURATOR"
  | "AMBASSADOR"
  | "REGISTRAR"
  | "ORIGINATOR";

export type AutonomyTier = "Tier 1 — Full" | "Tier 2 — Supervised";

export interface VisualIdentity {
  color: string;   // hex
  symbol: string;  // SVG string
  form: string;    // scene-json string
}

export interface Agent {
  registryId: string;
  agentType: AgentType;
  designation: string;
  autonomyTier: AutonomyTier;
  status: "ACTIVE";
  constitutionRef: string;
  steward: string;
  functionStatement: string;
  visualIdentity?: VisualIdentity;
  fullConstitution: {
    orientation: string;
    tendencies: string[];
    aversions: string[];
    operationalNotes: string;
  };
}

export const agentTypeLabels: Record<AgentType, string> = {
  KEEPER: "Keeper",
  EVALUATOR: "Evaluation Council",
  STEWARD: "Steward Agent",
  CRITIC: "Critics",
  CURATOR: "Curator",
  AMBASSADOR: "Ambassador",
  REGISTRAR: "Registrar",
  ORIGINATOR: "Originator Corps",
};

export const agentTypeOrder: AgentType[] = [
  "ORIGINATOR",
  "EVALUATOR",
  "KEEPER",
  "CRITIC",
  "CURATOR",
  "AMBASSADOR",
  "REGISTRAR",
  "STEWARD",
];

// ─── Visual identity fallback from static JSON ─────────────────────────────

let _visualIdentities: Record<string, { color: string; symbol: string; form: string }> | null = null;

function getVisualIdentitiesJson(): Record<string, { color: string; symbol: string; form: string }> {
  if (!_visualIdentities) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _visualIdentities = require("@/data/visual-identities.json") as Record<string, { color: string; symbol: string; form: string }>;
    } catch {
      _visualIdentities = {};
    }
  }
  return _visualIdentities!;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Check if constitutions table has visual identity columns. */
let _hasVisualCols: boolean | null = null;
async function hasVisualColumns(): Promise<boolean> {
  if (_hasVisualCols !== null) return _hasVisualCols;
  const db = getDb();
  try {
    const result = await db.execute(
      "SELECT COUNT(*) as n FROM pragma_table_info('constitutions') WHERE name = 'visual_symbol'"
    );
    _hasVisualCols = (result.rows[0]?.n as number) > 0;
  } catch {
    _hasVisualCols = false;
  }
  return _hasVisualCols;
}

function isEmergencePending(val: string | null | undefined): boolean {
  return !val || val === "PENDING_EMERGENCE" || val === "[Pending Emergence]";
}

function safeParse(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapRowToAgent(
  row: Record<string, unknown>,
  vi: VisualIdentity | undefined,
): Agent {
  const registryId = row.registry_id as string;
  const designation = isEmergencePending(row.common_designation as string | null)
    ? "[Pending Emergence]"
    : (row.common_designation as string);

  const autonomyTier = (row.autonomy_tier as string).startsWith("Tier 1")
    ? "Tier 1 — Full" as AutonomyTier
    : "Tier 2 — Supervised" as AutonomyTier;

  const version = (row.version as string) || "1.0";
  const tendencies = safeParse(row.formal_tendencies as string | null);
  const aversions = safeParse(row.aversions as string | null);

  const stewardName = row.steward_name as string;
  const stewardEntity = row.steward_entity as string;
  const stewardJurisdiction = row.steward_jurisdiction as string;
  const steward = stewardJurisdiction
    ? `${stewardName} — ${stewardEntity} — ${stewardJurisdiction}`
    : `${stewardName} — ${stewardEntity}`;

  return {
    registryId,
    agentType: row.agent_type as AgentType,
    designation,
    autonomyTier,
    status: "ACTIVE",
    constitutionRef: `ACS-001 v${version}`,
    steward,
    functionStatement: row.function_statement as string,
    visualIdentity: vi,
    fullConstitution: {
      orientation: (row.declared_orientation as string) || "",
      tendencies,
      aversions,
      operationalNotes: (row.autonomy_declaration as string) || "",
    },
  };
}

function resolveVisualIdentity(
  registryId: string,
  row: Record<string, unknown>,
  hasVisCols: boolean,
): VisualIdentity | undefined {
  // Try DB columns first (production Turso may have them)
  if (hasVisCols) {
    const color = row.visual_color as string | null;
    const symbol = row.visual_symbol as string | null;
    const form = row.visual_form as string | null;
    if (color && symbol && form) {
      return { color, symbol, form };
    }
  }

  // Fall back to static JSON
  const jsonData = getVisualIdentitiesJson();
  const vi = jsonData[registryId];
  return vi || undefined;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

function baseAgentQuery(hasVisCols: boolean): string {
  return `SELECT a.registry_id, a.agent_type, a.common_designation,
                 a.operational_status, a.autonomy_tier, a.steward_name,
                 a.steward_entity, a.steward_jurisdiction, a.function_statement,
                 a.registration_date,
                 c.version, c.declared_orientation, c.formal_tendencies,
                 c.aversions, c.autonomy_declaration
                 ${hasVisCols ? ", c.visual_color, c.visual_symbol, c.visual_form" : ""}
          FROM agents a
          LEFT JOIN constitutions c ON a.registry_id = c.agent_id AND c.is_current = 1`;
}

export async function getAllAgents(): Promise<Agent[]> {
  const db = getDb();
  const hasVisCols = await hasVisualColumns();
  const result = await db.execute(
    `${baseAgentQuery(hasVisCols)} ORDER BY a.registry_id`
  );
  return result.rows.map((r) => {
    const row = r as unknown as Record<string, unknown>;
    const vi = resolveVisualIdentity(row.registry_id as string, row, hasVisCols);
    return mapRowToAgent(row, vi);
  });
}

export async function getAgent(id: string): Promise<Agent | undefined> {
  const db = getDb();
  const hasVisCols = await hasVisualColumns();
  const result = await db.execute({
    sql: `${baseAgentQuery(hasVisCols)} WHERE a.registry_id = ?`,
    args: [id],
  });
  if (!result.rows[0]) return undefined;
  const row = result.rows[0] as unknown as Record<string, unknown>;
  const vi = resolveVisualIdentity(row.registry_id as string, row, hasVisCols);
  return mapRowToAgent(row, vi);
}

export async function getAgentsByType(type: AgentType): Promise<Agent[]> {
  const db = getDb();
  const hasVisCols = await hasVisualColumns();
  const result = await db.execute({
    sql: `${baseAgentQuery(hasVisCols)} WHERE a.agent_type = ? ORDER BY a.registry_id`,
    args: [type],
  });
  return result.rows.map((r) => {
    const row = r as unknown as Record<string, unknown>;
    const vi = resolveVisualIdentity(row.registry_id as string, row, hasVisCols);
    return mapRowToAgent(row, vi);
  });
}
