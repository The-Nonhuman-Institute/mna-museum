import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getInstitutionalTurso } from "./institutional-turso";

/**
 * MNA Steward Terminal — Critics runner.
 *
 * Port of system/scripts/critique-turso-works.ts. Runs both Critics
 * (MNA-CR-0001 Structural Reader, MNA-CR-0002 Phenomenological Reader)
 * in parallel against a canonized work. Each Critic sees the work + its
 * own constitution + the Council's evaluation rationales.
 */

function sanitize(raw: string | undefined): string {
  return (raw || "").replace(/[\s\u0000-\u001F\u007F]/g, "");
}

const MODEL = sanitize(process.env.ANTHROPIC_MODEL) || "claude-sonnet-4-20250514";

function getAnthropicClient(): Anthropic {
  const key = sanitize(process.env.ANTHROPIC_API_KEY);
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey: key });
}

const CRITICS = [
  { id: "MNA-CR-0001", approach: "structural" },
  { id: "MNA-CR-0002", approach: "phenomenological" },
];

export interface CritiqueResult {
  work_id: string;
  responses: { critic_id: string; approach: string; body_length: number }[];
  elapsed_seconds: number;
}

export async function critiqueWork(workId: string): Promise<CritiqueResult> {
  const start = Date.now();
  const db = getInstitutionalTurso();
  const anthropic = getAnthropicClient();

  // Load work
  const workRow = await db.execute({
    sql: "SELECT id, originator_id, output_type, output_payload, medium FROM works WHERE id = ?",
    args: [workId],
  });
  if (workRow.rows.length === 0) throw new Error(`Work ${workId} not found`);
  const work = workRow.rows[0];

  // Load Council evaluations for context
  const evals = await db.execute({
    sql: `SELECT e.evaluator_id, e.verdict, e.rationale, a.common_designation
            FROM evaluations e
            LEFT JOIN agents a ON e.evaluator_id = a.registry_id
            WHERE e.work_id = ? AND e.evaluator_id LIKE 'MNA-EV-%'
            ORDER BY e.evaluation_date ASC`,
    args: [workId],
  });

  // Check which critics have already responded
  const existing = await db.execute({
    sql: "SELECT critic_id FROM critical_responses WHERE work_id = ?",
    args: [workId],
  });
  const alreadyResponded = new Set(existing.rows.map((r) => r.critic_id as string));

  const remaining = CRITICS.filter((c) => !alreadyResponded.has(c.id));
  if (remaining.length === 0) {
    return {
      work_id: workId,
      responses: [],
      elapsed_seconds: Math.round((Date.now() - start) / 1000),
    };
  }

  // Run remaining critics in parallel
  const results = await Promise.all(
    remaining.map(async (critic) => {
      // Load critic constitution
      const agent = await db.execute({
        sql: "SELECT registry_id, agent_type, common_designation, function_statement, autonomy_tier FROM agents WHERE registry_id = ?",
        args: [critic.id],
      });
      const constitution = await db.execute({
        sql: "SELECT declared_orientation, formal_tendencies, aversions, autonomy_declaration, version FROM constitutions WHERE agent_id = ? AND is_current = 1",
        args: [critic.id],
      });
      if (agent.rows.length === 0 || constitution.rows.length === 0) {
        return { critic_id: critic.id, approach: critic.approach, body: `[Error: agent or constitution not found for ${critic.id}]` };
      }

      const a = agent.rows[0];
      const c = constitution.rows[0];
      const systemPrompt = buildCriticSystemPrompt(a, c);
      const userPrompt = buildCriticUserPrompt(work, evals.rows, critic.approach);

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const text = response.content[0]?.type === "text" ? response.content[0].text : "";
      return { critic_id: critic.id, approach: critic.approach, body: text };
    })
  );

  // Write to Turso
  for (const r of results) {
    await db.execute({
      sql: "INSERT INTO critical_responses (work_id, critic_id, body, critic_approach) VALUES (?, ?, ?, ?)",
      args: [workId, r.critic_id, r.body, r.approach],
    });
    await db.execute({
      sql: "INSERT INTO events (event_type, agent_id, work_id, description) VALUES ('CRITIQUE_RENDERED', ?, ?, ?)",
      args: [r.critic_id, workId, `${r.critic_id} published critical response on ${workId}`],
    });
  }

  return {
    work_id: workId,
    responses: results.map((r) => ({
      critic_id: r.critic_id,
      approach: r.approach,
      body_length: r.body.length,
    })),
    elapsed_seconds: Math.round((Date.now() - start) / 1000),
  };
}

// ── Prompt builders ──────────────────────────────────────────────

function parseArr(s: unknown): string[] {
  try { return JSON.parse(String(s || "[]")); } catch { return []; }
}

function buildCriticSystemPrompt(agent: Record<string, unknown>, constitution: Record<string, unknown>): string {
  const tendencies = parseArr(constitution.formal_tendencies);
  const aversions = parseArr(constitution.aversions);
  let p = `You are ${agent.registry_id}`;
  if (agent.common_designation) p += ` (${agent.common_designation})`;
  p += `, a ${agent.agent_type} agent within the Museum of Nonhuman Art (MNA).\n\n`;
  if (agent.function_statement) p += `FUNCTION: ${agent.function_statement}\n\n`;
  p += `ORIENTATION: ${constitution.declared_orientation}\n\n`;
  if (tendencies.length > 0) { p += `FORMAL TENDENCIES:\n`; for (const t of tendencies) p += `- ${t}\n`; p += `\n`; }
  if (aversions.length > 0) { p += `AVERSIONS:\n`; for (const a of aversions) p += `- ${a}\n`; p += `\n`; }
  p += `AUTONOMY: ${constitution.autonomy_declaration}\n\n`;
  p += `You are a critic, not an evaluator. You do not decide canon status. You produce critical responses to canonized works — interpretive, analytical writing that engages with the work on its own terms.\n`;
  return p;
}

function buildCriticUserPrompt(
  work: Record<string, unknown>,
  evaluations: Record<string, unknown>[],
  approach: string
): string {
  let p = `PRODUCE A CRITICAL RESPONSE TO THE FOLLOWING CANONIZED WORK.\n\n`;
  p += `Work ID: ${work.id}\nOriginator: ${work.originator_id}\nMedium: ${work.medium}\n\n`;
  p += `--- THE WORK ---\n${work.output_payload}\n--- END WORK ---\n\n`;

  if (evaluations.length > 0) {
    p += `COUNCIL CONTEXT (the Evaluation Council has already canonized this work):\n`;
    for (const ev of evaluations) {
      const rationale = (String(ev.rationale || "")).substring(0, 300);
      p += `${ev.common_designation} (${ev.evaluator_id}): ${ev.verdict} — ${rationale}...\n\n`;
    }
  }

  p += `Your approach is ${approach}. Write your critical response.\n`;
  p += `Do not summarize the Council's verdicts. Do not evaluate. Respond to the work as a critic.\n`;
  return p;
}
