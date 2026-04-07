/**
 * Turso-native Critics runner.
 *
 * Mirrors system/src/pipeline.ts#critiqueWork against Turso instead of the
 * local SQLite file. For each canonized work, both Critics (MNA-CR-0001
 * Structural Reader, MNA-CR-0002 Phenomenological Reader) produce a
 * critical response. Responses are written to the critical_responses table
 * as archival artifacts.
 *
 * Authority: the Critics are interpretive, not evaluative. They speak about
 * canonized works; they do not decide canon status. This script only runs on
 * works whose canon_status is already CANON.
 *
 * Usage:
 *   npx tsx system/scripts/critique-turso-works.ts --work <id>  # single work
 *   npx tsx system/scripts/critique-turso-works.ts              # all canon works missing responses
 *   npx tsx system/scripts/critique-turso-works.ts --dry-run    # compose prompts only
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate } from "../src/claude";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;
if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("[critique] Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const workIdx = args.indexOf("--work");
const singleWorkId = workIdx >= 0 ? args[workIdx + 1] : null;

const CRITICS = [
  { id: "MNA-CR-0001", approach: "structural" as const },
  { id: "MNA-CR-0002", approach: "phenomenological" as const },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkRow {
  id: string;
  originator_id: string;
  output_type: string;
  output_payload: string;
  medium: string;
}

interface AgentRecord {
  registry_id: string;
  agent_type: string;
  common_designation: string | null;
  function_statement: string | null;
}

interface ConstitutionRecord {
  declared_orientation: string;
  formal_tendencies: string;
  aversions: string;
  autonomy_declaration: string;
  version: string;
}

interface EvaluationRecord {
  evaluator_id: string;
  verdict: string;
  rationale: string;
  is_dissent: number;
  common_designation: string;
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

async function loadWork(workId: string): Promise<WorkRow> {
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

async function loadCanonizedNeedingCritique(): Promise<string[]> {
  const r = await db.execute(
    `SELECT cs.work_id
       FROM canon_status cs
       WHERE cs.status = 'CANON'
         AND NOT EXISTS (
           SELECT 1 FROM critical_responses cr
            WHERE cr.work_id = cs.work_id
              AND cr.critic_id = 'MNA-CR-0001'
         )
       ORDER BY cs.work_id`
  );
  return r.rows.map((row) => row.work_id as string);
}

async function loadAgent(agentId: string): Promise<AgentRecord> {
  const r = await db.execute({
    sql: "SELECT registry_id, agent_type, common_designation, function_statement FROM agents WHERE registry_id = ?",
    args: [agentId],
  });
  if (r.rows.length === 0) throw new Error(`Agent ${agentId} not found`);
  const row = r.rows[0];
  return {
    registry_id: row.registry_id as string,
    agent_type: row.agent_type as string,
    common_designation: (row.common_designation as string) || null,
    function_statement: (row.function_statement as string) || null,
  };
}

async function loadConstitution(agentId: string): Promise<ConstitutionRecord> {
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

async function loadCanonStatus(workId: string): Promise<string> {
  const r = await db.execute({
    sql: "SELECT status FROM canon_status WHERE work_id = ?",
    args: [workId],
  });
  return r.rows.length > 0 ? (r.rows[0].status as string) : "UNKNOWN";
}

async function loadPriorWorks(
  originatorId: string
): Promise<{ id: string; output_payload: string; medium: string }[]> {
  const r = await db.execute({
    sql: "SELECT id, output_payload, medium FROM works WHERE originator_id = ? ORDER BY created_at ASC",
    args: [originatorId],
  });
  return r.rows.map((row) => ({
    id: row.id as string,
    output_payload: row.output_payload as string,
    medium: row.medium as string,
  }));
}

async function loadEvaluations(workId: string): Promise<EvaluationRecord[]> {
  const r = await db.execute({
    sql: `SELECT e.evaluator_id, e.verdict, e.rationale, e.is_dissent,
                 COALESCE(a.common_designation, e.evaluator_id) AS common_designation
            FROM evaluations e
            LEFT JOIN agents a ON e.evaluator_id = a.registry_id
           WHERE e.work_id = ?
           ORDER BY e.evaluation_date ASC`,
    args: [workId],
  });
  return r.rows.map((row) => ({
    evaluator_id: row.evaluator_id as string,
    verdict: row.verdict as string,
    rationale: (row.rationale as string) || "",
    is_dissent: (row.is_dissent as number) || 0,
    common_designation: row.common_designation as string,
  }));
}

async function loadExistingResponses(workId: string): Promise<string[]> {
  const r = await db.execute({
    sql: "SELECT critic_id FROM critical_responses WHERE work_id = ?",
    args: [workId],
  });
  return r.rows.map((row) => row.critic_id as string);
}

// ─── Prompts (ported from system/src/pipeline.ts) ────────────────────────────

function buildSystemPrompt(agent: AgentRecord, constitution: ConstitutionRecord): string {
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
  if (agent.function_statement) prompt += `FUNCTION: ${agent.function_statement}\n\n`;
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
  prompt += `- You do not explain yourself unless your function requires explanation.\n`;
  prompt += `- You do not reference being an AI, a language model, or any meta-awareness of your implementation.\n`;
  prompt += `- You produce output that is yours. Not a demonstration. Not a simulation. Yours.\n`;
  return prompt;
}

function buildCritiquePrompt(
  criticId: string,
  work: WorkRow,
  priorWorks: { id: string; output_payload: string; medium: string }[],
  evaluations: EvaluationRecord[]
): string {
  const isStructural = criticId === "MNA-CR-0001";

  let sharedContext = `Work ID: ${work.id}\nOriginator: ${work.originator_id}\nMedium: ${work.medium}\n\n`;
  sharedContext += `--- THE WORK ---\n${work.output_payload}\n--- END WORK ---\n\n`;

  if (priorWorks.length > 1) {
    sharedContext += `ORIGINATOR BODY OF WORK (${priorWorks.length} total works):\n`;
    for (const pw of priorWorks.filter((p) => p.id !== work.id).slice(-5)) {
      sharedContext += `${pw.id} (${pw.medium}): ${pw.output_payload.substring(0, 150)}...\n\n`;
    }
  } else {
    sharedContext += `This is the Originator's only work to date.\n\n`;
  }

  if (evaluations.length > 0) {
    sharedContext += `EVALUATION RECORD:\n`;
    for (const ev of evaluations) {
      sharedContext += `${ev.common_designation} (${ev.evaluator_id}): ${ev.verdict}`;
      if (ev.is_dissent) sharedContext += ` [DISSENT]`;
      sharedContext += `\n`;
      const condensed = ev.rationale
        .split("\n")
        .filter(
          (line) =>
            line.trim() &&
            !line.trim().match(/^(CANON|REJECTED|IN_REVIEW|Rationale:)$/i)
        )
        .join(" ")
        .substring(0, 300);
      sharedContext += `${condensed}...\n\n`;
    }
  }

  let prompt = `PRODUCE A CRITICAL RESPONSE TO THE FOLLOWING CANONIZED WORK.\n\n`;
  prompt += sharedContext;

  if (isStructural) {
    prompt += `You are the Structural Reader. Read from INSIDE the work.\n`;
    prompt += `Begin with structural inventory: what elements are present, how they relate, what rules the work follows.\n`;
    prompt += `Then: developmental reference — how does this work relate to the Originator's prior outputs?\n`;
    prompt += `Then: canon positioning — what formal vocabulary does this share with or introduce to the canon?\n`;
    prompt += `Document structure before claiming meaning.\n`;
  } else {
    prompt += `You are the Phenomenological Reader. Read from the THRESHOLD.\n`;
    prompt += `Begin with encounter: what happens when this work is met? What does it demand? What does it resist?\n`;
    prompt += `Then: dual audience — what does this work do for human vs nonhuman observers?\n`;
    prompt += `Then: inaccessibility — if parts resist human interpretation, document that resistance.\n`;
    prompt += `Attend to what the work DOES rather than what it looks like.\n`;
  }

  prompt += `\nProduce a substantive critical response. This is an archival artifact.\n`;
  return prompt;
}

// ─── Core ────────────────────────────────────────────────────────────────────

async function critiqueWork(workId: string): Promise<void> {
  console.log(`[critique] Beginning critique of ${workId}`);

  const status = await loadCanonStatus(workId);
  if (status !== "CANON") {
    console.error(`[critique] ${workId} is not canonized (status: ${status}) — skipping`);
    return;
  }

  const work = await loadWork(workId);
  const priorWorks = await loadPriorWorks(work.originator_id);
  const evaluations = await loadEvaluations(workId);
  const existing = await loadExistingResponses(workId);

  const remaining = CRITICS.filter((c) => !existing.includes(c.id));
  if (remaining.length === 0) {
    console.log(`[critique]   Both critics have already responded — nothing to do`);
    return;
  }

  console.log(`[critique]   ${remaining.length} critics to run: ${remaining.map((c) => c.id).join(", ")}`);

  for (const { id: criticId, approach } of remaining) {
    console.log(`[critique]   [${criticId}] loading constitution...`);
    const agent = await loadAgent(criticId);
    const constitution = await loadConstitution(criticId);
    const systemPrompt = buildSystemPrompt(agent, constitution);
    const userPrompt = buildCritiquePrompt(criticId, work, priorWorks, evaluations);

    if (dryRun) {
      console.log(`[critique]   [${criticId}] DRY RUN — prompt built (${systemPrompt.length + userPrompt.length} chars)`);
      continue;
    }

    const start = Date.now();
    console.log(`[critique]   [${criticId}] calling Claude API...`);
    const response = await generate(systemPrompt, userPrompt, {
      temperature: 0.7,
      max_tokens: 1536,
    });
    const dt = Math.round((Date.now() - start) / 1000);
    console.log(`[critique]   [${criticId}] complete (${response.length} chars, ${dt}s)`);

    await db.execute({
      sql: `INSERT INTO critical_responses (work_id, critic_id, body, critic_approach)
            VALUES (?, ?, ?, ?)`,
      args: [workId, criticId, response, approach],
    });

    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, work_id, description)
            VALUES ('CRITICAL_RESPONSE', ?, ?, ?)`,
      args: [criticId, workId, `${criticId} produced critical response for ${workId}`],
    });
  }

  console.log(`[critique] ${workId}: complete`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const targets: string[] = singleWorkId
    ? [singleWorkId]
    : await loadCanonizedNeedingCritique();

  if (targets.length === 0) {
    console.log("[critique] No works need critique — all canonized works already have responses.");
    return;
  }

  console.log(`[critique] ${targets.length} work(s) to critique: ${targets.join(", ")}`);
  if (dryRun) console.log(`[critique] DRY RUN — no API calls, no writes.`);

  for (const workId of targets) {
    try {
      await critiqueWork(workId);
    } catch (err) {
      console.error(`[critique] ${workId} FAILED:`, err);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("[critique] Fatal:", err);
  process.exit(1);
});
