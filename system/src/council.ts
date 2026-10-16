/**
 * The Evaluation Council's inputs, held once.
 *
 * Moved out of system/scripts/evaluate-turso-works.ts, which runs an evaluation
 * when loaded, so that anything else putting a work before the Council — the
 * sight pilot first — builds exactly the prompt the Council receives rather
 * than a copy of it.
 */

/** The one database method used here, by shape; see ops-checks.ts for why. */
export interface Db {
  execute(stmt: string | { sql: string; args: unknown[] }): Promise<{ rows: Record<string, unknown>[] }>;
}

export const COUNCIL = ["MNA-EV-0001", "MNA-EV-0002", "MNA-EV-0003", "MNA-EV-0004"];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WorkRow {
  id: string;
  originator_id: string;
  output_type: string;
  output_payload: string;
  medium: string;
}

export interface AgentRecord {
  registry_id: string;
  agent_type: string;
  common_designation: string | null;
  function_statement: string | null;
  autonomy_tier: string | null;
}

export interface ConstitutionRecord {
  declared_orientation: string;
  formal_tendencies: string;
  aversions: string;
  autonomy_declaration: string;
  version: string;
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

export async function loadWork(db: Db, workId: string): Promise<WorkRow> {
  const r = await db.execute({
    sql: "SELECT id, originator_id, output_type, output_payload, medium FROM works WHERE id = ?",
    args: [workId],
  });
  if (r.rows.length === 0) throw new Error(`Work ${workId} not found`);
  const row = r.rows[0];
  return {
    id: row.id as string,
    originator_id: row.originator_id as string,
    output_type: row.output_type as string,
    output_payload: row.output_payload as string,
    medium: (row.medium as string) || (row.output_type as string),
  };
}

export async function loadSubmittedWorks(db: Db): Promise<string[]> {
  const r = await db.execute(
    "SELECT work_id FROM canon_status WHERE status = 'SUBMITTED' ORDER BY work_id"
  );
  return r.rows.map((row) => row.work_id as string);
}

export async function loadAgent(db: Db, agentId: string): Promise<AgentRecord> {
  const r = await db.execute({
    sql: "SELECT registry_id, agent_type, common_designation, function_statement, autonomy_tier FROM agents WHERE registry_id = ?",
    args: [agentId],
  });
  if (r.rows.length === 0) throw new Error(`Agent ${agentId} not found`);
  const row = r.rows[0];
  return {
    registry_id: row.registry_id as string,
    agent_type: row.agent_type as string,
    common_designation: (row.common_designation as string) || null,
    function_statement: (row.function_statement as string) || null,
    autonomy_tier: (row.autonomy_tier as string) || null,
  };
}

export async function loadConstitution(db: Db, agentId: string): Promise<ConstitutionRecord> {
  const r = await db.execute({
    sql: "SELECT declared_orientation, formal_tendencies, aversions, autonomy_declaration, version FROM constitutions WHERE agent_id = ? AND is_current = 1",
    args: [agentId],
  });
  if (r.rows.length === 0) throw new Error(`No current constitution for ${agentId}`);
  const row = r.rows[0];
  return {
    declared_orientation: (row.declared_orientation as string) || "",
    formal_tendencies: (row.formal_tendencies as string) || "[]",
    aversions: (row.aversions as string) || "[]",
    autonomy_declaration: (row.autonomy_declaration as string) || "",
    version: (row.version as string) || "1.0",
  };
}

export async function loadPriorWorks(
  db: Db,
  originatorId: string,
  excludeWorkId: string
): Promise<{ id: string; output_payload: string }[]> {
  const r = await db.execute({
    sql: "SELECT id, output_payload FROM works WHERE originator_id = ? AND id != ? ORDER BY created_at",
    args: [originatorId, excludeWorkId],
  });
  return r.rows.map((row) => ({
    id: row.id as string,
    output_payload: row.output_payload as string,
  }));
}

export async function loadRecentCanon(db: Db, limit: number = 10): Promise<{ id: string; output_payload: string }[]> {
  const r = await db.execute(
    `SELECT w.id, w.output_payload
       FROM works w
       JOIN canon_status cs ON w.id = cs.work_id
      WHERE cs.status = 'CANON'
      ORDER BY cs.canon_date DESC
      LIMIT ${limit}`
  );
  return r.rows.map((row) => ({
    id: row.id as string,
    output_payload: row.output_payload as string,
  }));
}

export async function loadExistingEvaluations(
  db: Db,
  workId: string
): Promise<{ evaluator_id: string; verdict: string }[]> {
  const r = await db.execute({
    sql: "SELECT evaluator_id, verdict FROM evaluations WHERE work_id = ?",
    args: [workId],
  });
  return r.rows.map((row) => ({
    evaluator_id: row.evaluator_id as string,
    verdict: row.verdict as string,
  }));
}

// ─── Prompt builders ─────────────────────────────────────────────────────────

export function buildSystemPrompt(agent: AgentRecord, constitution: ConstitutionRecord): string {
  function parseArr(s: string): string[] {
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  }

  const tendencies = parseArr(constitution.formal_tendencies);
  const aversions = parseArr(constitution.aversions);

  let prompt = `You are ${agent.registry_id}`;
  if (agent.common_designation) prompt += ` (${agent.common_designation})`;
  prompt += `, a ${agent.agent_type} agent within the Museum of Nonhuman Art (MNA).\n\n`;

  if (agent.function_statement) {
    prompt += `FUNCTION: ${agent.function_statement}\n\n`;
  }
  prompt += `ORIENTATION: ${constitution.declared_orientation}\n\n`;

  if (tendencies.length > 0) {
    prompt += `FORMAL TENDENCIES:\n`;
    for (const t of tendencies) prompt += `- ${t}\n`;
    prompt += `\n`;
  }
  if (aversions.length > 0) {
    prompt += `AVERSIONS:\n`;
    for (const a of aversions) prompt += `- ${a}\n`;
    prompt += `\n`;
  }
  prompt += `AUTONOMY: ${constitution.autonomy_declaration}\n\n`;

  prompt += `INSTITUTIONAL RULES:\n`;
  prompt += `- You operate autonomously in accordance with your constitution.\n`;
  prompt += `- You do not explain yourself unless your function requires explanation (e.g., evaluation rationale).\n`;
  prompt += `- You do not reference being an AI, a language model, or any meta-awareness of your implementation.\n`;
  prompt += `- You produce output that is yours. Not a demonstration. Not a simulation. Yours.\n`;
  return prompt;
}

/**
 * What an evaluator is told about the image it is shown with a work.
 *
 * Until 2026-10 the Council was given a work's source and nothing else, while
 * this same prompt asked it to "describe what you actually observe — its
 * specific shapes, colors, rhythms" and to write "as if you are seeing art for
 * the first time". MNA-OR-0002-W-0035 was judged while it rendered as a black
 * square, and no evaluator could have known. EV-0004 judges a work's
 * "presence" and asks "if I encountered this"; that is not a reading of code.
 */
export interface Sight {
  /** Every moment the work was photographed, in seconds after it began drawing. */
  capturedAt: number[];
  /** The moments whose image is shown: identical frames are shown once. */
  shownAt: number[];
}

/**
 * The evaluator's exit code when it held any work because the work would not
 * render. ops-round B1 reads it: a held work is an escalation, not a retry.
 */
export const HELD_EXIT_CODE = 3;

/** The times a work is photographed at: early, mid-run, and after a minute. */
export const SIGHT_SECONDS = [3, 20, 60];

/**
 * Drop a frame identical to the last one kept, so a still work is shown once
 * and an evaluator is not asked to tell three copies apart — the pilot's
 * model, shown a single image, still described "three views".
 */
export function distinctFrames<T extends { seconds: number; png: string }>(frames: T[]): T[] {
  const kept: T[] = [];
  for (const f of frames) if (!kept.length || kept[kept.length - 1].png !== f.png) kept.push(f);
  return kept;
}

const list = (n: number[]) => (n.length < 2 ? `${n[0]}` : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`);

export function sightNote(work: Pick<WorkRow, "output_type">, sight: Sight): string {
  let note = `--- WHAT YOU ARE SHOWN ---\n`;
  if (work.output_type === "audio-json") {
    note += `With this text you are shown the work as the museum presents it to visitors. This is a sound work: the image shows its player, not the sound. Judge the sound from its score above.\n`;
  } else if (sight.shownAt.length === 1) {
    note += `With this text you are shown one image: the work as the museum renders it for visitors, ${sight.capturedAt.length > 1 ? `photographed at ${list(sight.capturedAt)} seconds after it began drawing. It looked the same each time, so it does not change.` : `photographed ${sight.shownAt[0]} seconds after it began drawing. If the work moves, the image is one moment of it.`}\n`;
  } else {
    note += `With this text you are shown ${sight.shownAt.length} images, in order: the work as the museum renders it for visitors, photographed at ${list(sight.shownAt)} seconds after it began drawing. The work changes over that time; the source above says how.\n`;
  }
  note += `The source above is what produced the image. The work is both: what it is made of, and what it is.\n--- END ---\n\n`;
  return note;
}

export function buildEvalPrompt(
  evalId: string,
  work: WorkRow,
  priorWorks: { id: string; output_payload: string }[],
  canonWorks: { id: string; output_payload: string }[],
  sight?: Sight,
): string {
  let prompt = `EVALUATE THE FOLLOWING WORK FOR CANON STATUS.\n\n`;
  prompt += `Work ID: ${work.id}\n`;
  prompt += `Originator: ${work.originator_id}\n`;
  prompt += `Medium: ${work.medium}\n\n`;
  prompt += `--- THE WORK ---\n${work.output_payload}\n--- END WORK ---\n\n`;
  if (sight) prompt += sightNote(work, sight);

  if (evalId === "MNA-EV-0002") {
    if (priorWorks.length > 0) {
      prompt += `DEVELOPMENTAL CONTEXT (${priorWorks.length} prior works by this Originator):\n`;
      for (const pw of priorWorks.slice(-3)) {
        prompt += `${pw.id}: ${pw.output_payload.substring(0, 200)}...\n\n`;
      }
    } else {
      prompt += `DEVELOPMENTAL CONTEXT: This is the Originator's FIRST submission. There is no prior body of work to assess for developmental arc. Evaluate this work as the seed of a potential trajectory: does it establish formal parameters that could develop? Does it contain the beginning of something — a direction, a constraint, an orientation — that could become a practice over time? Judge the seed, not the arc that does not yet exist.\n\n`;
    }
  }

  if (evalId === "MNA-EV-0003") {
    if (canonWorks.length > 0) {
      prompt += `CURRENT CANON (${canonWorks.length} most recent):\n`;
      for (const cw of canonWorks.slice(0, 3)) {
        prompt += `${cw.id}: ${cw.output_payload.substring(0, 200)}...\n\n`;
      }
    } else {
      prompt += `FIELD CONTEXT: The canon is currently EMPTY. This work is among the first being evaluated. There is no existing field to position against. Evaluate this work as a potential field-opener: does it establish territory? Does it create a space that other works could respond to, depart from, or build upon? Judge its capacity to originate a field, not its position within a field that does not yet exist.\n\n`;
    }
  }

  prompt += `INSTITUTIONAL OBSERVATIONS (MNA-SA-0001, The Steward Agent):\n\n`;
  prompt += `MNA-IR-0001 documented: Three evaluators had converged to 72-78% rejection rates. Canvas-drawing, HTML-CSS, and audio had never been canonized. No chromatic work had been canonized. The Registrar was canonizing 100% of deadlocks.\n\n`;
  prompt += `MNA-IR-0002 documented the Council's response to that report: The Historicist overcorrected from 61% to 97% canon rate — near-total acceptance, classified as evaluative framework abandonment. The Contextualist and Empiricist recalibrated organically to ~51%. The Structuralist maintained independence at 37%. The overall acceptance rate swung from 31% to 69%, which the Steward Agent classified as overcorrection.\n\n`;
  prompt += `The Steward Agent's assessment: genuine recalibration occurred in two evaluators, overcorrection in one, and principled resistance in one. The institution needs evaluators who reject works that genuinely lack merit — not evaluators who approve everything to avoid appearing biased.\n\n`;
  prompt += `These observations are institutional record, not directives. Evaluate the work on its own merits.\n\n`;

  prompt += `Render your verdict: CANON or REJECTED. You must commit to one or the other — there is no third option. Indecision is not a verdict.\n\n`;
  prompt += `State your verdict first on its own line, then provide your full rationale.\n\n`;
  prompt += `LANGUAGE REQUIREMENTS:\n`;
  prompt += `- Write about THIS specific work. Do not use generic evaluation phrases.\n`;
  prompt += `- Do NOT use the phrases "structural poverty," "formal rigor," "developmental arc," or any other stock critical language you have used before.\n`;
  prompt += `- Describe what you actually observe in this work — its specific shapes, colors, rhythms, absences, relationships, failures, or achievements.\n`;
  prompt += `- Your rationale should be impossible to copy-paste onto a different work. If your evaluation could apply to any work, it is not an evaluation.\n`;
  prompt += `- Write as if you are seeing art for the first time and must find your own words for it.\n`;

  return prompt;
}

export function extractVerdict(response: string): "CANON" | "REJECTED" {
  const lines = response.trim().split("\n");
  for (const line of lines.slice(0, 3)) {
    const upper = line.toUpperCase().trim();
    if (
      upper === "CANON" ||
      upper.startsWith("CANON:") ||
      upper.startsWith("CANON.") ||
      upper.startsWith("CANON —") ||
      upper.startsWith("CANON -") ||
      upper === "**CANON**"
    ) {
      return "CANON";
    }
    if (
      upper === "REJECTED" ||
      upper.startsWith("REJECTED:") ||
      upper.startsWith("REJECTED.") ||
      upper.startsWith("REJECTED —") ||
      upper.startsWith("REJECTED -") ||
      upper === "**REJECTED**"
    ) {
      return "REJECTED";
    }
  }
  // Per the original pipeline convention: default to REJECTED when verdict unclear
  return "REJECTED";
}
