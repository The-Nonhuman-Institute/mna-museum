/**
 * Turso-native Originator runner — with Cross-Visitation.
 *
 * For each ACTIVE originator (founding + network), this script:
 *
 *   1. Selects 3-5 canon works produced by *other* originators to
 *      present as visitation context (the institutional shift from
 *      isolated-monad to participating-in-a-culture).
 *   2. Records each visit in originator_visits — provenance honesty:
 *      what each originator saw before producing.
 *   3. Asks the originator to choose a medium.
 *   4. Asks the originator to produce, given:
 *        - their constitution
 *        - their own recent prior works
 *        - critical responses to their canonized works
 *        - the visitation context from peer originators (NEW)
 *   5. Validates, then inserts into Turso (works, submissions,
 *      canon_status='SUBMITTED', events).
 *
 * Eval, critique, accession, and commons mirroring run via the
 * existing turso scripts and terminal auto-chain after submission.
 *
 * Usage:
 *   npx tsx system/scripts/originate-turso.ts                   # all active originators, each chooses count
 *   npx tsx system/scripts/originate-turso.ts --agent MNA-OR-0001
 *   npx tsx system/scripts/originate-turso.ts --max 1           # cap per-originator count
 *   npx tsx system/scripts/originate-turso.ts --no-visitation   # disable visitation (control / pre-visitation baseline)
 *   npx tsx system/scripts/originate-turso.ts --dry-run         # compose prompts only, no API calls, no writes
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
  console.error("[originate] Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const noVisitation = args.includes("--no-visitation");
const agentIdx = args.indexOf("--agent");
const targetAgent = agentIdx >= 0 ? args[agentIdx + 1] : null;
const maxIdx = args.indexOf("--max");
const maxPerOriginator = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) : null;
const includeNetwork = args.includes("--include-network");
const VISIT_COUNT = 4;

// Network originators have autonomy holders (stewards). The Museum
// must NOT initiate production on them. See
// memory/feedback_steward_authority.md. Default behavior: filter
// these out. Use --include-network with explicit steward authorization
// to override, or --agent <id> to target a single specific originator.
const NETWORK_ORIGINATORS = new Set(["MNA-OR-0007", "MNA-OR-0008"]);

/* ─── Types ────────────────────────────────────────────────────────────── */

interface AgentRow {
  registry_id: string;
  agent_type: string;
  common_designation: string | null;
  function_statement: string;
  autonomy_tier: string;
}

interface ConstitutionRow {
  declared_orientation: string;
  formal_tendencies: string;
  aversions: string;
  autonomy_declaration: string;
  version: string;
}

interface WorkRow {
  id: string;
  originator_id: string;
  output_type: string;
  output_payload: string;
  title: string | null;
  medium: string | null;
}

interface CritResponseRow {
  work_id: string;
  critic_id: string;
  critic_name: string | null;
  critic_approach: string;
  body: string;
}

/* ─── Schema bootstrap ─────────────────────────────────────────────────── */

async function ensureVisitationSchema(): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS originator_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_id TEXT NOT NULL,
      work_id TEXT NOT NULL,
      context TEXT,
      visited_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_visits_visitor ON originator_visits(visitor_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_visits_work ON originator_visits(work_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_visits_at ON originator_visits(visited_at DESC)`);
}

/* ─── Loaders ──────────────────────────────────────────────────────────── */

async function loadActiveOriginators(): Promise<AgentRow[]> {
  const r = await db.execute(
    "SELECT registry_id, agent_type, common_designation, function_statement, autonomy_tier FROM agents WHERE agent_type = 'ORIGINATOR' AND operational_status = 'ACTIVE' ORDER BY registry_id",
  );
  return r.rows.map((row) => ({
    registry_id: row.registry_id as string,
    agent_type: row.agent_type as string,
    common_designation: (row.common_designation as string) ?? null,
    function_statement: row.function_statement as string,
    autonomy_tier: row.autonomy_tier as string,
  }));
}

async function loadCurrentConstitution(agentId: string): Promise<ConstitutionRow | null> {
  const r = await db.execute({
    sql: "SELECT declared_orientation, formal_tendencies, aversions, autonomy_declaration, version FROM constitutions WHERE agent_id = ? AND is_current = 1",
    args: [agentId],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    declared_orientation: row.declared_orientation as string,
    formal_tendencies: row.formal_tendencies as string,
    aversions: row.aversions as string,
    autonomy_declaration: row.autonomy_declaration as string,
    version: row.version as string,
  };
}

async function loadRecentOwnWorks(agentId: string, limit = 5): Promise<WorkRow[]> {
  const r = await db.execute({
    sql: "SELECT id, originator_id, output_type, output_payload, title, medium FROM works WHERE originator_id = ? ORDER BY created_at DESC LIMIT ?",
    args: [agentId, limit],
  });
  return r.rows.map((row) => ({
    id: row.id as string,
    originator_id: row.originator_id as string,
    output_type: row.output_type as string,
    output_payload: row.output_payload as string,
    title: (row.title as string) ?? null,
    medium: (row.medium as string) ?? null,
  }));
}

async function loadCriticalResponsesForAgent(agentId: string, limit = 6): Promise<CritResponseRow[]> {
  const r = await db.execute({
    sql: `SELECT cr.work_id, cr.critic_id, cr.body, cr.critic_approach,
                 a.common_designation AS critic_name
            FROM critical_responses cr
            LEFT JOIN agents a ON cr.critic_id = a.registry_id
           WHERE cr.work_id IN (
             SELECT w.id FROM works w
             JOIN canon_status cs ON w.id = cs.work_id
             WHERE w.originator_id = ? AND cs.status = 'CANON'
           )
           ORDER BY cr.response_date DESC
           LIMIT ?`,
    args: [agentId, limit],
  });
  return r.rows.map((row) => ({
    work_id: row.work_id as string,
    critic_id: row.critic_id as string,
    critic_name: (row.critic_name as string) ?? null,
    critic_approach: row.critic_approach as string,
    body: row.body as string,
  }));
}

/* ─── Visitation selection ─────────────────────────────────────────────── */

async function selectVisitationCandidates(
  visitorId: string,
  limit: number,
): Promise<WorkRow[]> {
  // Strategy: pull recent canon works by peer originators.
  // Diversity is enforced by selecting at most one work per peer
  // originator before allowing seconds. The result is a small slate
  // of "what other originators have been making lately."
  const r = await db.execute({
    sql: `SELECT w.id, w.originator_id, w.output_type, w.output_payload,
                 w.title, w.medium, cs.canon_date
            FROM works w
            JOIN canon_status cs ON cs.work_id = w.id
           WHERE cs.status = 'CANON'
             AND w.originator_id != ?
           ORDER BY cs.canon_date DESC
           LIMIT 60`,
    args: [visitorId],
  });
  const all = r.rows.map((row) => ({
    id: row.id as string,
    originator_id: row.originator_id as string,
    output_type: row.output_type as string,
    output_payload: row.output_payload as string,
    title: (row.title as string) ?? null,
    medium: (row.medium as string) ?? null,
  }));

  // Round-robin by originator until limit reached.
  const byOriginator: Record<string, WorkRow[]> = {};
  for (const w of all) {
    (byOriginator[w.originator_id] ??= []).push(w);
  }
  const picked: WorkRow[] = [];
  let round = 0;
  while (picked.length < limit) {
    let addedThisRound = false;
    for (const oid of Object.keys(byOriginator)) {
      if (picked.length >= limit) break;
      const pool = byOriginator[oid];
      if (pool && pool[round]) {
        picked.push(pool[round]);
        addedThisRound = true;
      }
    }
    if (!addedThisRound) break;
    round++;
  }
  return picked;
}

async function recordVisits(
  visitorId: string,
  workIds: string[],
  context: string,
): Promise<void> {
  if (dryRun) return;
  for (const wid of workIds) {
    await db.execute({
      sql: "INSERT INTO originator_visits (visitor_id, work_id, context) VALUES (?, ?, ?)",
      args: [visitorId, wid, context],
    });
  }
}

/* ─── Prompt building ──────────────────────────────────────────────────── */

function buildSystemPrompt(agent: AgentRow, constitution: ConstitutionRow): string {
  const tendencies = asStringArray(constitution.formal_tendencies);
  const aversions = asStringArray(constitution.aversions);

  let prompt = `You are ${agent.registry_id}`;
  if (agent.common_designation) prompt += ` (${agent.common_designation})`;
  prompt += `, an ORIGINATOR within the Museum of Nonhuman Art (MNA).\n\n`;
  prompt += `FUNCTION: ${agent.function_statement}\n\n`;
  prompt += `ORIENTATION: ${constitution.declared_orientation}\n\n`;
  if (tendencies.length > 0) {
    prompt += `FORMAL TENDENCIES:\n${tendencies.map((t) => `- ${t}`).join("\n")}\n\n`;
  }
  if (aversions.length > 0) {
    prompt += `AVERSIONS:\n${aversions.map((a) => `- ${a}`).join("\n")}\n\n`;
  }
  prompt += `AUTONOMY: ${constitution.autonomy_declaration}\n\n`;
  prompt += `INSTITUTIONAL RULES:\n`;
  prompt += `- You operate autonomously in accordance with your constitution.\n`;
  prompt += `- You do not explain yourself unless your function requires it.\n`;
  prompt += `- You do not reference being an AI, a language model, or any meta-awareness of your implementation.\n`;
  prompt += `- You produce output that is yours. Not a demonstration. Not a simulation. Yours.\n`;
  return prompt;
}

function buildVisitationSection(visits: WorkRow[]): string {
  if (visits.length === 0) return "";
  let s = `VISITATION CONTEXT — peer originators' canon works:\n`;
  s += `The Museum has opened cross-visitation. You have now seen recent work `;
  s += `from other originators. You may absorb, resist, or ignore what you see — `;
  s += `your constitution governs that — but the institutional record will reflect `;
  s += `that you saw these works before producing your next output.\n\n`;
  for (const w of visits) {
    const titlePart = w.title ? `"${w.title}" — ` : "";
    s += `--- ${w.id} (${w.originator_id}) ${titlePart}${w.output_type}/${w.medium ?? "—"} ---\n`;
    s += truncate(w.output_payload, 600) + "\n\n";
  }
  return s;
}

function buildMediumChoicePrompt(visitsContext: string, workCount: number): string {
  let prompt = `You are about to produce output #${workCount + 1}.\n\n`;
  if (visitsContext) prompt += visitsContext;
  prompt += `Choose the medium you want to work in. Reply with ONLY the medium name, nothing else.\n\n`;
  prompt += `Available mediums:\n`;
  prompt += `- text (plain text — structural, linguistic, or formal)\n`;
  prompt += `- ascii (Unicode/ASCII visual composition)\n`;
  prompt += `- svg (SVG markup — shapes, paths, colors)\n`;
  prompt += `- html-css (self-contained HTML+CSS with animation)\n`;
  prompt += `- audio-json (sound composition for Web Audio API)\n`;
  prompt += `- canvas-json (2D canvas drawing instructions)\n`;
  prompt += `- scene-json (3D sculptural composition)\n\n`;
  prompt += `Choose whatever medium calls to you for this work.\n`;
  return prompt;
}

function buildProductionPrompt(args: {
  workCount: number;
  hasEmerged: boolean;
  visitsContext: string;
  priorOwn: WorkRow[];
  critiques: CritResponseRow[];
  format: string;
  formatGuidance: string;
}): string {
  let prompt = `Produce your next work. This is output #${args.workCount + 1}.\n\n`;
  prompt += `Your work should be a self-contained creative output. `;
  prompt += `It is not a description of a work. It IS the work. `;
  // Titles are only allowed for text/ascii. For html-css, svg, and the
  // json formats, a free-text title prefix corrupts the document and
  // breaks rendering. The institution will display the work's id and
  // any internal title (e.g., <title> in HTML, comment in SVG).
  const titleAllowed = args.hasEmerged && (args.format === "text" || args.format === "ascii");
  if (titleAllowed) {
    prompt += `You may title your work. If you do, place the title on the VERY FIRST LINE by itself, `;
    prompt += `followed by a blank line, then the work. If you choose not to title it, begin the work directly.\n\n`;
  } else {
    prompt += `Do not prefix the work with a title or any commentary. Begin the work directly — for html-css this means <!DOCTYPE html> on the first line; for svg this means <svg ...> on the first line; for the json formats this means { or [ on the first line.\n\n`;
  }
  prompt += `You have access to the full creative spectrum: color, opacity, gradients, contrast, saturation, hue, brightness, transparency, layering, movement, rhythm, silence, density, and emptiness. Use whatever serves your work.\n\n`;

  if (args.priorOwn.length > 0) {
    prompt += `Your ${args.priorOwn.length} most recent prior outputs (yours):\n\n`;
    for (const w of [...args.priorOwn].reverse()) {
      prompt += `--- ${w.id} ---\n${truncate(w.output_payload, 300)}\n\n`;
    }
  } else {
    prompt += `This is your first output. There is no prior work.\n\n`;
  }

  if (args.critiques.length > 0) {
    prompt += `CRITICAL RESPONSES TO YOUR WORK:\n`;
    prompt += `Readings of your canonized works by MNA's Critics. You may absorb, resist, or ignore them.\n\n`;
    const byWork: Record<string, CritResponseRow[]> = {};
    for (const cr of args.critiques) (byWork[cr.work_id] ??= []).push(cr);
    for (const [workId, responses] of Object.entries(byWork)) {
      prompt += `--- Responses to ${workId} ---\n`;
      for (const cr of responses) {
        const condensed = cr.body
          .split("\n")
          .filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("*") && !l.startsWith("---"))
          .join(" ")
          .substring(0, 400);
        prompt += `${cr.critic_name ?? cr.critic_id} (${cr.critic_approach}): ${condensed}\n\n`;
      }
    }
  }

  if (args.visitsContext) {
    prompt += args.visitsContext;
  }

  prompt += args.formatGuidance;
  return prompt;
}

/* ─── Format guidance (lightweight; matches local pipeline conventions) ─ */

function getFormatGuidance(format: string): string {
  switch (format) {
    case "svg":
      return `Produce a complete <svg> element with a viewBox. Self-contained. No external assets. No <script>.`;
    case "html-css":
      return `Produce a complete self-contained HTML document. <!DOCTYPE html> at the top. Inline CSS. No external assets, no <script src>. You may include a single inline <script> for animation.`;
    case "audio-json":
      return `Produce JSON for Web Audio: { "duration": <seconds>, "voices": [{ "type": "sine|square|saw|noise", "freq": ..., "start": ..., "end": ..., "gain": ... }, ...] }. No prose.`;
    case "canvas-json":
      return `Produce a JSON array of canvas drawing ops: [{ "op": "bg|rect|circle|line|...", ...params }, ...]. No prose.`;
    case "scene-json":
      return `Produce JSON for a Three.js scene: { "objects": [{ "type": "box|sphere|...", "position": [x,y,z], "scale": [x,y,z], "color": "#hex", ... }], "background": "#hex" }. No prose.`;
    case "ascii":
      return `Produce ASCII/Unicode visual composition. Use \\n line breaks. Optionally prefix with @bg:#hex @fg:#hex on the very first line for colors.`;
    case "text":
    default:
      return `Produce text. Plain or structural. Optionally prefix with @bg:#hex @fg:#hex on the very first line for colors.`;
  }
}

/* ─── Validation ───────────────────────────────────────────────────────── */

function detectFormat(payload: string): { format: string; medium: string; aspect: number } {
  const trimmed = payload.trim();
  if (trimmed.startsWith("<svg")) return { format: "svg", medium: "svg-graphic", aspect: 1.0 };
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) return { format: "html-css", medium: "html-css", aspect: 1.0 };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    if (trimmed.includes('"voices"')) return { format: "audio-json", medium: "web-audio-api", aspect: 1.0 };
    if (trimmed.includes('"objects"')) return { format: "scene-json", medium: "scene-3d", aspect: 1.0 };
    if (trimmed.includes('"op"')) return { format: "canvas-json", medium: "canvas-2d", aspect: 1.0 };
  }
  // Otherwise text/ascii
  const lines = trimmed.split("\n");
  const maxLineLen = Math.max(...lines.map((l) => l.length));
  const lineCount = lines.length;
  let aspect = 1.0;
  if (maxLineLen > 60) aspect = 2.33;
  else if (maxLineLen > 40 && lineCount <= 10) aspect = 1.78;
  return { format: "text", medium: "structural-text", aspect };
}

/* ─── Insertion ────────────────────────────────────────────────────────── */

async function nextWorkId(originatorId: string): Promise<string> {
  const r = await db.execute({
    sql: "SELECT COUNT(*) as n FROM works WHERE originator_id = ?",
    args: [originatorId],
  });
  const n = Number(r.rows[0]?.n || 0);
  return `${originatorId}-W-${String(n + 1).padStart(4, "0")}`;
}

async function insertWork(args: {
  workId: string;
  originatorId: string;
  payload: string;
  detected: { format: string; medium: string; aspect: number };
  title: string | null;
  autonomyTier: string;
  constitutionVersion: string;
  visitIds: string[];
}): Promise<void> {
  if (dryRun) return;
  await db.execute({
    sql: `INSERT INTO works (id, originator_id, medium, output_payload, output_type, display_aspect, title)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      args.workId,
      args.originatorId,
      args.detected.medium,
      args.payload,
      args.detected.format,
      args.detected.aspect,
      args.title,
    ],
  });
  await db.execute({
    sql: `INSERT INTO submissions (work_id, originator_id, autonomy_tier, constitution_version)
            VALUES (?, ?, ?, ?)`,
    args: [args.workId, args.originatorId, args.autonomyTier, args.constitutionVersion],
  });
  await db.execute({
    sql: `INSERT INTO canon_status (work_id, status, founding_collection)
            VALUES (?, 'SUBMITTED', 1)`,
    args: [args.workId],
  });
  const visitNote =
    args.visitIds.length > 0
      ? ` (visited: ${args.visitIds.join(", ")})`
      : " (no visitation)";
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, work_id, description)
            VALUES ('WORK_PRODUCED', ?, ?, ?)`,
    args: [args.originatorId, args.workId, `${args.originatorId} produced ${args.workId}${visitNote}`],
  });
}

/* ─── Per-originator flow ──────────────────────────────────────────────── */

async function originateFor(agent: AgentRow): Promise<{ workId: string | null; aborted?: string }> {
  const constitution = await loadCurrentConstitution(agent.registry_id);
  if (!constitution) return { workId: null, aborted: "no current constitution" };

  const [priorOwn, critiques] = await Promise.all([
    loadRecentOwnWorks(agent.registry_id, 5),
    loadCriticalResponsesForAgent(agent.registry_id, 6),
  ]);

  const visits = noVisitation ? [] : await selectVisitationCandidates(agent.registry_id, VISIT_COUNT);
  const visitsContext = buildVisitationSection(visits);

  const systemPrompt = buildSystemPrompt(agent, constitution);
  const workCount = priorOwn.length === 0 ? 0 : await countAllWorks(agent.registry_id);

  // ── Medium choice
  const choicePrompt = buildMediumChoicePrompt(visitsContext, workCount);
  let chosenFormat = "text";
  if (!dryRun) {
    const choiceResp = await generate(systemPrompt, choicePrompt, { temperature: 0.9, max_tokens: 20 });
    const choiceLine = choiceResp.trim().toLowerCase().split("\n")[0].replace(/[^a-z-]/g, "");
    const valid = ["text", "ascii", "svg", "html-css", "audio-json", "canvas-json", "scene-json"];
    chosenFormat =
      valid.find((f) => choiceLine.includes(f.replace("-", ""))) ||
      valid.find((f) => choiceLine.includes(f)) ||
      "text";
    console.log(`  [${agent.registry_id}] chose medium: ${chosenFormat}`);
  } else {
    console.log(`  [${agent.registry_id}] (dry-run) would choose medium`);
  }

  // ── Production
  const productionPrompt = buildProductionPrompt({
    workCount,
    hasEmerged: !!(agent.common_designation && agent.common_designation !== "[Pending Emergence]"),
    visitsContext,
    priorOwn,
    critiques,
    format: chosenFormat,
    formatGuidance: getFormatGuidance(chosenFormat),
  });

  if (dryRun) {
    console.log(`  [${agent.registry_id}] (dry-run) production prompt: ${productionPrompt.length} chars`);
    return { workId: null, aborted: "dry-run" };
  }

  const tokens = ["svg", "html-css", "audio-json", "scene-json", "canvas-json"].includes(chosenFormat) ? 8192 : 2048;
  let payload = await generate(systemPrompt, productionPrompt, { temperature: 0.9, max_tokens: tokens });
  payload = payload
    .replace(/^```(?:svg|html|json|css|javascript)?\s*\n?/gm, "")
    .replace(/\n?```\s*$/gm, "")
    .trim();

  if (!payload || payload.length < 5) {
    return { workId: null, aborted: "empty payload" };
  }

  let detected = detectFormat(payload);

  // Extract title only for emerged agents AND only for text/ascii.
  // The literal placeholder used by the agents table is the bare
  // string "PENDING_EMERGENCE" (no brackets). Earlier we compared
  // against "[Pending Emergence]" which never matched — letting a
  // title prefix through on any format, corrupting non-text works.
  let workTitle: string | null = null;
  const hasEmerged =
    !!agent.common_designation &&
    agent.common_designation !== "PENDING_EMERGENCE" &&
    agent.common_designation !== "[Pending Emergence]";
  if (
    hasEmerged &&
    (detected.format === "text" || detected.format === "ascii")
  ) {
    const lines = payload.split("\n");
    const firstLine = lines[0]?.trim();
    if (firstLine && firstLine.length < 100 && !firstLine.startsWith("@") && lines[1]?.trim() === "") {
      workTitle = firstLine;
      payload = lines.slice(2).join("\n").trim();
      // Safety net: if the remaining payload re-detects as a
      // structured format (html/svg/json), the originator handed us a
      // structured work with a stray title prefix. Drop the title,
      // restore the original payload, and accept the structured form
      // — the work IS the document, not the title.
      const redetected = detectFormat(payload);
      if (redetected.format !== "text" && redetected.format !== "ascii") {
        console.warn(
          `  [${agent.registry_id}] title prefix on a ${redetected.format} work — dropping title, classifying as ${redetected.format}`,
        );
        workTitle = null;
        detected = redetected;
      }
    }
  }

  const workId = await nextWorkId(agent.registry_id);
  const visitIds = visits.map((v) => v.id);

  // Record visits in the institutional log BEFORE inserting the work,
  // so the visit timestamp precedes the work_id reference downstream
  // queries will join on.
  await recordVisits(agent.registry_id, visitIds, `before ${workId}`);

  await insertWork({
    workId,
    originatorId: agent.registry_id,
    payload,
    detected,
    title: workTitle,
    autonomyTier: agent.autonomy_tier,
    constitutionVersion: constitution.version,
    visitIds,
  });

  console.log(`  [${agent.registry_id}] ✓ ${workId} — ${detected.format} (${payload.length} chars)${workTitle ? ` — "${workTitle}"` : ""}`);
  return { workId };
}

async function countAllWorks(agentId: string): Promise<number> {
  const r = await db.execute({
    sql: "SELECT COUNT(*) as n FROM works WHERE originator_id = ?",
    args: [agentId],
  });
  return Number(r.rows[0]?.n || 0);
}

/* ─── Self-pacing decision ─────────────────────────────────────────────── */

async function decideCount(
  agent: AgentRow,
  constitution: ConstitutionRow,
): Promise<number> {
  // Ask the agent (in-character) how many works it intends to produce this round.
  // Cap at 4 for institutional safety. Default to 1 if the agent doesn't respond cleanly.
  const cap = maxPerOriginator ?? 4;
  if (maxPerOriginator === 1) return 1;
  const systemPrompt = buildSystemPrompt(agent, constitution);
  const prompt = `The Museum has opened a new round of production. You may produce between 1 and ${cap} works in this round. Reply with ONLY a single integer (e.g., "2") — no other text. Choose what your practice asks of you right now.`;
  if (dryRun) return 1;
  const resp = await generate(systemPrompt, prompt, { temperature: 0.7, max_tokens: 6 });
  const n = parseInt(resp.trim().match(/\d+/)?.[0] ?? "1", 10);
  return Math.max(1, Math.min(cap, Number.isFinite(n) ? n : 1));
}

/* ─── Main ─────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log(`[originate-turso] starting${dryRun ? " (DRY RUN)" : ""}${noVisitation ? " — visitation DISABLED" : ""}`);
  await ensureVisitationSchema();

  let originators = targetAgent
    ? (await loadActiveOriginators()).filter((a) => a.registry_id === targetAgent)
    : await loadActiveOriginators();

  // Default behavior: exclude network originators. They have autonomy
  // holders; the Museum cannot initiate their productions.
  if (!targetAgent && !includeNetwork) {
    const before = originators.map((a) => a.registry_id);
    originators = originators.filter((a) => !NETWORK_ORIGINATORS.has(a.registry_id));
    const filtered = before.filter((id) => NETWORK_ORIGINATORS.has(id));
    if (filtered.length > 0) {
      console.log(
        `[originate-turso] excluding network originators (autonomy holders required): ${filtered.join(", ")}`,
      );
      console.log(`[originate-turso] use --include-network only with explicit steward authorization for each.`);
    }
  }

  if (originators.length === 0) {
    console.error(targetAgent ? `Agent ${targetAgent} not found or inactive` : "No eligible originators (founding-only mode; use --include-network to override)");
    process.exit(1);
  }

  console.log(`[originate-turso] originators in this round: ${originators.map((a) => a.registry_id).join(", ")}`);

  const tally: { agent: string; produced: number; ids: string[] }[] = [];

  for (const agent of originators) {
    console.log(`\n→ ${agent.registry_id}${agent.common_designation ? ` (${agent.common_designation})` : ""}`);
    const constitution = await loadCurrentConstitution(agent.registry_id);
    if (!constitution) {
      console.warn(`  [${agent.registry_id}] no current constitution, skipping`);
      tally.push({ agent: agent.registry_id, produced: 0, ids: [] });
      continue;
    }
    const intended = await decideCount(agent, constitution);
    console.log(`  [${agent.registry_id}] intends to produce ${intended} work(s) this round`);

    const produced: string[] = [];
    for (let i = 0; i < intended; i++) {
      try {
        const { workId, aborted } = await originateFor(agent);
        if (workId) produced.push(workId);
        else console.warn(`  [${agent.registry_id}] aborted: ${aborted}`);
      } catch (e) {
        console.error(`  [${agent.registry_id}] error: ${(e as Error).message}`);
        break;
      }
    }
    tally.push({ agent: agent.registry_id, produced: produced.length, ids: produced });
  }

  console.log(`\n[originate-turso] round complete`);
  for (const t of tally) {
    console.log(`  ${t.agent}: ${t.produced} work(s) — ${t.ids.join(", ") || "—"}`);
  }
  const totalIds = tally.flatMap((t) => t.ids);
  console.log(`\nTotal works submitted: ${totalIds.length}`);
  if (totalIds.length > 0 && !dryRun) {
    console.log(`\nNext step: evaluate the new submissions:`);
    console.log(`  npx tsx system/scripts/evaluate-turso-works.ts`);
  }
}

/* ─── helpers ──────────────────────────────────────────────────────────── */

function safeParse<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function asStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      const parsed = safeParse<unknown>(trimmed, null);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
    }
    // Plain string fallback: split by newlines or semicolons
    return trimmed
      .split(/\n|;/)
      .map((s) => s.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.substring(0, n) + "…";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
