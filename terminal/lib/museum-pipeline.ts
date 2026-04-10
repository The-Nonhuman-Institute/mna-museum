import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getInstitutionalTurso } from "./institutional-turso";

/**
 * MNA Steward Terminal — Museum pipeline: Curator → Installer.
 *
 * Finds canonized works not yet placed in the virtual museum, runs the
 * Curator to decide placement, then runs the Installer to execute.
 * The Curator's judgment is real — it decides WHERE and HOW. The
 * Installer is deterministic — it writes the placement rows.
 *
 * This module combines both agents into one pipeline so the steward
 * can say "update the museum" and both steps run in sequence.
 */

function sanitize(raw: string | undefined): string {
  return (raw || "").replace(/[\s\u0000-\u001F\u007F]/g, "");
}

const MODEL = sanitize(process.env.ANTHROPIC_MODEL) || "claude-sonnet-4-20250514";

const VALID_SPACES = new Set([
  "chamber", "originator", "exhibition",
  "gallery-west", "gallery-east", "gallery-south", "sculpture",
]);

const SPACE_NAMES: Record<string, string> = {
  "chamber": "The Chamber (monumental, one work)",
  "originator": "Solo Exhibition Hall (one originator's works)",
  "exhibition": "Exhibition Hall (themed group shows)",
  "gallery-west": "Gallery West (general canon)",
  "gallery-east": "Gallery East (general canon)",
  "gallery-south": "Gallery South (network/overflow)",
  "sculpture": "Sculpture Court (3D works)",
};

export interface MuseumUpdateResult {
  unplaced_works: string[];
  curator_decisions: { work_id: string; space: string; treatment: string }[];
  installations: { workId: string; space: string; status: string }[];
  elapsed_seconds: number;
}

/**
 * Find canonized works not yet in any museum_installations row.
 */
async function findUnplacedCanonWorks(): Promise<string[]> {
  const db = getInstitutionalTurso();
  const rows = await db.execute(`
    SELECT cs.work_id
      FROM canon_status cs
      WHERE cs.status = 'CANON'
        AND cs.work_id NOT IN (
          SELECT work_id FROM museum_installations WHERE removed_at IS NULL
        )
      ORDER BY cs.canon_date ASC
  `);
  return rows.rows.map((r) => r.work_id as string);
}

/**
 * Run the Curator to decide placement for a set of unplaced works.
 * Returns curatorial_decisions rows written to Turso.
 */
async function curateWorks(workIds: string[]): Promise<{ decisionId: number; workId: string; space: string; treatment: string }[]> {
  if (workIds.length === 0) return [];
  const db = getInstitutionalTurso();
  const anthropic = new Anthropic({ apiKey: sanitize(process.env.ANTHROPIC_API_KEY) });

  // Load Curator constitution from Turso
  const constRow = await db.execute({
    sql: "SELECT declared_orientation, formal_tendencies, aversions, autonomy_declaration FROM constitutions WHERE agent_id = 'MNA-CU-0001' AND is_current = 1",
    args: [],
  });
  const agentRow = await db.execute({
    sql: "SELECT registry_id, common_designation, function_statement FROM agents WHERE registry_id = 'MNA-CU-0001'",
    args: [],
  });

  // Load current installations for context
  const currentInstalls = await db.execute(
    "SELECT work_id, space_id, display_treatment FROM museum_installations WHERE removed_at IS NULL ORDER BY space_id, slot_index"
  );
  const spaceOccupancy: Record<string, string[]> = {};
  for (const r of currentInstalls.rows) {
    const space = r.space_id as string;
    if (!spaceOccupancy[space]) spaceOccupancy[space] = [];
    spaceOccupancy[space].push(r.work_id as string);
  }

  // Load work details for each unplaced work
  const workDetails: string[] = [];
  for (const wid of workIds) {
    const w = await db.execute({
      sql: "SELECT id, originator_id, medium, output_type, title FROM works WHERE id = ?",
      args: [wid],
    });
    if (w.rows.length > 0) {
      const r = w.rows[0];
      workDetails.push(`${r.id}: medium=${r.medium}, output_type=${r.output_type}, originator=${r.originator_id}${r.title ? `, title="${r.title}"` : ""}`);
    }
  }

  // Build the Curator prompt
  const c = constRow.rows[0] || {};
  const a = agentRow.rows[0] || {};
  let systemPrompt = `You are MNA-CU-0001 (${a.common_designation || "The Curator"}).\n`;
  systemPrompt += `FUNCTION: ${a.function_statement || ""}\n`;
  systemPrompt += `ORIENTATION: ${c.declared_orientation || ""}\n\n`;
  systemPrompt += `You decide where canonized works are placed in the virtual museum.\n`;
  systemPrompt += `Your decisions are institutional record.\n\n`;

  let userPrompt = `GALLERY SPACES:\n`;
  for (const [id, name] of Object.entries(SPACE_NAMES)) {
    const occupants = spaceOccupancy[id] || [];
    userPrompt += `- ${id} (${name}): ${occupants.length} works currently installed\n`;
  }
  userPrompt += `\nWORKS AWAITING PLACEMENT:\n`;
  for (const detail of workDetails) userPrompt += `- ${detail}\n`;

  userPrompt += `\nFor each work, decide:\n`;
  userPrompt += `1. Which gallery space (use the technical id: gallery-west, gallery-east, gallery-south, sculpture, exhibition, originator, chamber)\n`;
  userPrompt += `2. Display treatment: "standard" for regular gallery placement, "monumental" for Chamber, "solo-feature" for Solo Exhibition Hall\n\n`;
  userPrompt += `Respond in this exact format, one line per work:\n`;
  userPrompt += `PLACE <work_id> IN <space_id> AS <treatment>\n`;
  userPrompt += `\nAfter all placements, add a brief RATIONALE paragraph explaining your decisions.\n`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    temperature: 0.5,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";

  // Parse placement directives
  const decisions: { decisionId: number; workId: string; space: string; treatment: string }[] = [];
  const rationale = text.split(/RATIONALE/i)[1]?.trim() || text;

  const placeRegex = /PLACE\s+(MNA-[\w-]+)\s+IN\s+([\w-]+)\s+AS\s+(\w[\w-]*)/gi;
  let match;
  while ((match = placeRegex.exec(text)) !== null) {
    const workId = match[1];
    const space = match[2].toLowerCase();
    const treatment = match[3].toLowerCase();

    if (!VALID_SPACES.has(space)) continue;
    if (!workIds.includes(workId)) continue;

    // Write curatorial_decision
    const result = await db.execute({
      sql: `INSERT INTO curatorial_decisions (decision_type, work_ids, target_space, rationale, agent_id)
            VALUES ('GALLERY_ASSIGNMENT', ?, ?, ?, 'MNA-CU-0001')`,
      args: [JSON.stringify([workId]), space, rationale],
    });
    const decisionId = Number(result.lastInsertRowid || 0);

    decisions.push({ decisionId, workId, space, treatment });
  }

  return decisions;
}

/**
 * Run the Installer: execute pending curatorial decisions by writing
 * museum_installations rows. Deterministic — no LLM.
 */
async function installDecisions(
  decisions: { decisionId: number; workId: string; space: string; treatment: string }[]
): Promise<{ workId: string; space: string; status: string }[]> {
  const db = getInstitutionalTurso();
  const results: { workId: string; space: string; status: string }[] = [];

  for (const d of decisions) {
    // Remove this work from any other space
    await db.execute({
      sql: "UPDATE museum_installations SET removed_at = datetime('now') WHERE work_id = ? AND space_id != ? AND removed_at IS NULL",
      args: [d.workId, d.space],
    });
    // Remove prior installation of this work in the same space
    await db.execute({
      sql: "UPDATE museum_installations SET removed_at = datetime('now') WHERE work_id = ? AND space_id = ? AND removed_at IS NULL",
      args: [d.workId, d.space],
    });
    // Install
    await db.execute({
      sql: `INSERT INTO museum_installations (work_id, space_id, slot_index, display_treatment, installed_by, curatorial_decision_id)
            VALUES (?, ?, NULL, ?, 'MNA-IN-0001', ?)`,
      args: [d.workId, d.space, d.treatment, d.decisionId],
    });
    // Log event
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, work_id, description, metadata)
            VALUES ('INSTALLATION_EXECUTED', 'MNA-IN-0001', ?, ?, ?)`,
      args: [d.workId, `Installed ${d.workId} in ${d.space} (${d.treatment})`, JSON.stringify({ decision_id: d.decisionId, space: d.space, treatment: d.treatment })],
    });

    results.push({ workId: d.workId, space: d.space, status: "installed" });
  }

  return results;
}

/**
 * Full pipeline: find unplaced works → Curator decides → Installer executes.
 */
export async function updateMuseum(): Promise<MuseumUpdateResult> {
  const start = Date.now();

  const unplaced = await findUnplacedCanonWorks();
  if (unplaced.length === 0) {
    return {
      unplaced_works: [],
      curator_decisions: [],
      installations: [],
      elapsed_seconds: Math.round((Date.now() - start) / 1000),
    };
  }

  const decisions = await curateWorks(unplaced);
  const installations = await installDecisions(decisions);

  return {
    unplaced_works: unplaced,
    curator_decisions: decisions.map((d) => ({ work_id: d.workId, space: d.space, treatment: d.treatment })),
    installations,
    elapsed_seconds: Math.round((Date.now() - start) / 1000),
  };
}
