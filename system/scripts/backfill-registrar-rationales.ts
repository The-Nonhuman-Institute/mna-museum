/**
 * Backfill Registrar tiebreaker rationales for legacy 2:2 deadlocks.
 *
 * Twenty founding-Originator canonizations (OR-0001 through OR-0006) were
 * resolved on 2:2 council deadlocks before the institution recorded the
 * Registrar's rationale. Their canon_status is CANON but no Registrar
 * evaluation row exists, so the public provenance page can't surface
 * "why this work made it through" — the council split is visible but
 * the resolution isn't.
 *
 * This script invokes the Registrar (MNA-RG-0001) for each affected work
 * and asks it to produce the rationale that justified the existing CANON
 * verdict under MNA-PP-001 authority. The verdict is constrained to CANON
 * (we are recording the rationale that was implicit in the original
 * decision, not re-litigating it). Output:
 *   - Insert an evaluations row (evaluator_id = MNA-RG-0001, verdict =
 *     CANON, rationale, constitution_version)
 *   - Insert a REGISTRAR_DECISION_BACKFILL event
 *
 * Skips any work that already has a Registrar entry. Safe to re-run.
 *
 * Usage:
 *   npx tsx system/scripts/backfill-registrar-rationales.ts                # all 20
 *   npx tsx system/scripts/backfill-registrar-rationales.ts --work <id>    # single
 *   npx tsx system/scripts/backfill-registrar-rationales.ts --dry-run      # plan only
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
  console.error("[backfill] Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const workIdx = args.indexOf("--work");
const singleWorkId = workIdx >= 0 ? args[workIdx + 1] : null;

// ─── Loaders (mirrored from evaluate-turso-works.ts) ────────────────────────

async function loadWork(workId: string) {
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

async function loadAgent(agentId: string) {
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

async function loadConstitution(agentId: string) {
  const r = await db.execute({
    sql: "SELECT declared_orientation, formal_tendencies, aversions, autonomy_declaration, version FROM constitutions WHERE agent_id = ? ORDER BY version DESC LIMIT 1",
    args: [agentId],
  });
  if (r.rows.length === 0) throw new Error(`Constitution for ${agentId} not found`);
  const row = r.rows[0];
  return {
    declared_orientation: (row.declared_orientation as string) || "",
    formal_tendencies: (row.formal_tendencies as string) || "",
    aversions: (row.aversions as string) || "",
    autonomy_declaration: (row.autonomy_declaration as string) || "",
    version: (row.version as string) || "1.0",
  };
}

function buildSystemPrompt(
  agent: { registry_id: string; common_designation: string | null; function_statement: string | null },
  constitution: { declared_orientation: string; formal_tendencies: string; aversions: string },
): string {
  let sp = `You are ${agent.common_designation || agent.registry_id} (${agent.registry_id}).\n`;
  sp += `Function: ${agent.function_statement || ""}\n\n`;
  if (constitution.declared_orientation) sp += `Orientation: ${constitution.declared_orientation}\n\n`;
  if (constitution.formal_tendencies) sp += `Formal tendencies:\n${constitution.formal_tendencies}\n\n`;
  if (constitution.aversions) sp += `Aversions:\n${constitution.aversions}\n\n`;
  return sp.trim();
}

// ─── Backfill ──────────────────────────────────────────────────────────────

async function findTargets(): Promise<string[]> {
  if (singleWorkId) return [singleWorkId];

  const r = await db.execute(`
    SELECT
      e.work_id,
      SUM(CASE WHEN e.verdict='CANON' THEN 1 ELSE 0 END) AS canon_votes,
      SUM(CASE WHEN e.verdict='REJECTED' THEN 1 ELSE 0 END) AS reject_votes
    FROM evaluations e
    WHERE e.evaluator_id != 'MNA-RG-0001'
    GROUP BY e.work_id
    HAVING canon_votes = reject_votes AND canon_votes > 0
    ORDER BY e.work_id
  `);

  const targets: string[] = [];
  for (const row of r.rows) {
    const id = row.work_id as string;
    const reg = await db.execute({
      sql: "SELECT 1 FROM evaluations WHERE work_id = ? AND evaluator_id = 'MNA-RG-0001' LIMIT 1",
      args: [id],
    });
    if (reg.rows.length > 0) continue; // already has rationale
    const cs = await db.execute({
      sql: "SELECT status FROM canon_status WHERE work_id = ?",
      args: [id],
    });
    const status = cs.rows[0]?.status as string | undefined;
    if (status !== "CANON" && status !== "REJECTED") continue; // skip in-review/etc.
    targets.push(id);
  }
  return targets;
}

async function backfillOne(workId: string) {
  console.log(`[backfill] ${workId}`);
  const start = Date.now();

  const work = await loadWork(workId);

  // Existing canon_status — we constrain the Registrar's verdict to match
  // it. We're not re-deciding; we're retroactively recording the rationale
  // that was implicit in the original decision under MNA-PP-001 authority.
  const csRow = await db.execute({
    sql: "SELECT status FROM canon_status WHERE work_id = ?",
    args: [workId],
  });
  const status = (csRow.rows[0]?.status as string) || "CANON";
  if (status !== "CANON" && status !== "REJECTED") {
    console.log(`  skip: status=${status}`);
    return;
  }

  // Council evaluations
  const evalRows = await db.execute({
    sql: `SELECT e.evaluator_id, e.verdict, e.rationale, a.common_designation
            FROM evaluations e
            LEFT JOIN agents a ON e.evaluator_id = a.registry_id
           WHERE e.work_id = ? AND e.evaluator_id != 'MNA-RG-0001'
           ORDER BY e.evaluation_date ASC`,
    args: [workId],
  });
  const evaluations = evalRows.rows.map((r) => ({
    evaluator_id: r.evaluator_id as string,
    verdict: r.verdict as string,
    rationale: (r.rationale as string) || "",
    common_designation: (r.common_designation as string) || (r.evaluator_id as string),
  }));

  console.log(
    `  council split: ${evaluations.map((e) => `${e.common_designation}: ${e.verdict}`).join(", ")}`,
  );

  // Build the prompt — backfill framing, verdict constrained.
  let prompt = `REGISTRAR REVIEW — DEADLOCK RESOLUTION (RECORDED RATIONALE)\n\n`;
  prompt += `The Evaluation Council deadlocked on this work with a 2:2 split. `;
  prompt += `Under MNA-PP-001 authority, your binding decision on this case was: ${status}.\n\n`;
  prompt += `Your task here is to articulate the rationale that justifies the ${status} verdict — `;
  prompt += `the institutional reasoning that resolved the deadlock. You are not re-deciding the case. `;
  prompt += `You are recording the deliberative reasoning into the public provenance record so visitors `;
  prompt += `to MNA can read why a deadlock resolved the way it did.\n\n`;
  prompt += `Consider the work itself, the council's rationales (canon and dissent both), and the `;
  prompt += `institutional principles that distinguish a sustained-disagreement-worth-preserving from `;
  prompt += `a sustained-disagreement-without-merit. Your rationale should stand on its own as a `;
  prompt += `binding institutional document.\n\n`;

  prompt += `Work ID: ${workId}\n`;
  prompt += `Originator: ${work.originator_id}\n`;
  prompt += `Medium: ${work.medium}\n\n`;
  prompt += `--- THE WORK ---\n${work.output_payload}\n--- END WORK ---\n\n`;

  prompt += `COUNCIL RATIONALES:\n`;
  for (const ev of evaluations) {
    prompt += `--- ${ev.common_designation} (${ev.evaluator_id}) — ${ev.verdict} ---\n`;
    const condensed = ev.rationale
      .split("\n")
      .filter(
        (line) =>
          line.trim() && !line.trim().match(/^(CANON|REJECTED|IN_REVIEW|Rationale:)$/i),
      )
      .join("\n")
      .substring(0, 600);
    prompt += `${condensed}\n\n`;
  }

  prompt += `Render your decision: ${status}.\n`;
  prompt += `State "${status}" first on its own line, then provide the binding institutional rationale.\n`;

  const registrarAgent = await loadAgent("MNA-RG-0001");
  const registrarConstitution = await loadConstitution("MNA-RG-0001");
  const systemPrompt = buildSystemPrompt(registrarAgent, registrarConstitution);

  if (dryRun) {
    console.log(
      `  DRY RUN — system+user prompt built (${systemPrompt.length + prompt.length} chars)`,
    );
    return;
  }

  console.log(`  calling Claude API…`);
  const response = await generate(systemPrompt, prompt, {
    temperature: 0.5,
    max_tokens: 1024,
  });
  const elapsedS = Math.round((Date.now() - start) / 1000);
  console.log(`  done (${elapsedS}s, ${response.length}c)`);

  // Insert the Registrar evaluation row. collection.ts#getWork reads this
  // and exposes it as work.registrar_decision; the provenance page renders
  // it as the "Registrar Tiebreaker · Council Deadlock Resolved" section.
  await db.execute({
    sql: `INSERT INTO evaluations (work_id, evaluator_id, verdict, rationale, constitution_version)
          VALUES (?, 'MNA-RG-0001', ?, ?, ?)`,
    args: [workId, status, response, registrarConstitution.version],
  });

  // Backfill event in the institutional log.
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, work_id, description, metadata)
          VALUES ('REGISTRAR_DECISION_BACKFILL', 'MNA-RG-0001', ?, ?, ?)`,
    args: [
      workId,
      `Registrar rationale backfilled for ${workId} → ${status}`,
      JSON.stringify({ decision: status, rationale: response, backfill: true }),
    ],
  });
}

async function main() {
  const targets = await findTargets();
  console.log(`[backfill] ${targets.length} work(s) to process`);
  if (dryRun) console.log("[backfill] DRY RUN — no DB writes\n");

  for (const id of targets) {
    try {
      await backfillOne(id);
    } catch (e) {
      console.error(`[backfill] FAILED ${id}: ${(e as Error).message}`);
    }
  }
  console.log("\n[backfill] done");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
