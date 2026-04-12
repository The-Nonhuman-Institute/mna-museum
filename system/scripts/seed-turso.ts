/**
 * seed-turso.ts — Migrate all founding data into production Turso database.
 *
 * Reads from:
 *   - Local SQLite (data/mna.db) for agents + constitutions
 *   - website/src/data/works.json for works, submissions, evaluations, canon_status
 *   - website/src/data/critical-responses.json for critical responses
 *   - website/src/data/events.json for institutional events
 *   - website/src/data/visual-identities.json for visual identity data
 *
 * Writes to: Turso production database (credentials from ../website/.env)
 *
 * Safe to run multiple times (idempotent).
 * Run with: npx tsx scripts/seed-turso.ts
 */

import { createClient, type Client, type InStatement } from "@libsql/client";
import Database from "better-sqlite3";
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";

// ── Load env ────────────────────────────────────────────────────────────────
config({ path: resolve(__dirname, "../../website/.env") });

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in ../website/.env");
  process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadJSON<T>(relativePath: string): T {
  const fullPath = resolve(__dirname, relativePath);
  return JSON.parse(readFileSync(fullPath, "utf-8")) as T;
}

/** Turso batch() has a ~100 statement limit. Chunk accordingly. */
const BATCH_SIZE = 80;

async function batchExecute(client: Client, stmts: InStatement[]) {
  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    const chunk = stmts.slice(i, i + BATCH_SIZE);
    await client.batch(chunk, "write");
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

interface WorkJSON {
  id: string;
  originator_id: string;
  medium: string;
  output_payload: string;
  output_type: string;
  display_aspect: number;
  phase_at_submission: string | null;
  created_at: string;
  title: string | null;
  canon_status: string;
  canon_date: string | null;
  founding_collection: number;
  submission_date: string;
  autonomy_tier: string;
  constitution_version: string;
  evaluations: EvaluationJSON[];
  registrar_decision: string | null;
}

interface EvaluationJSON {
  work_id: string;
  evaluator_id: string;
  verdict: string;
  rationale: string;
  is_dissent: number;
  evaluation_date: string;
  constitution_version: string;
  evaluator_name?: string;
}

interface CriticalResponseJSON {
  id: number;
  work_id: string;
  critic_id: string;
  body: string;
  critic_approach: string;
  response_date: string;
  critic_name?: string;
}

interface EventJSON {
  id: number;
  event_type: string;
  agent_id: string | null;
  work_id: string | null;
  description: string;
  metadata: string | null;
  created_at: string;
}

interface VisualIdentity {
  color: string;
  symbol: string;
  form: string;
}

interface LocalAgent {
  registry_id: string;
  agent_type: string;
  common_designation: string | null;
  operational_status: string;
  autonomy_tier: string;
  steward_name: string;
  steward_entity: string;
  steward_jurisdiction: string;
  function_statement: string;
  registration_date: string;
  created_at: string;
}

interface LocalConstitution {
  id: number;
  agent_id: string;
  version: string;
  declared_orientation: string | null;
  formal_tendencies: string | null;
  aversions: string | null;
  conflict_constraints: string | null;
  autonomy_declaration: string;
  amendment_rationale: string | null;
  is_current: number;
  created_at: string;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  MNA Turso Seed — Founding Data Migration    ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // Connect to Turso
  const turso = createClient({ url: TURSO_URL!, authToken: TURSO_TOKEN! });
  console.log("✓ Connected to Turso:", TURSO_URL);

  // Open local SQLite
  const localDB = new Database(resolve(__dirname, "../data/mna.db"), { readonly: true });
  console.log("✓ Opened local SQLite: data/mna.db\n");

  // Load JSON data
  const works = loadJSON<WorkJSON[]>("../../website/src/data/works.json");
  const criticalResponses = loadJSON<CriticalResponseJSON[]>("../../website/src/data/critical-responses.json");
  const events = loadJSON<EventJSON[]>("../../website/src/data/events.json");
  const visualIdentities = loadJSON<Record<string, VisualIdentity>>("../../website/src/data/visual-identities.json");

  console.log(`Loaded: ${works.length} works, ${criticalResponses.length} critical responses, ${events.length} events, ${Object.keys(visualIdentities).length} visual identities\n`);

  // ── Step 0: Schema changes ──────────────────────────────────────────────
  console.log("── Step 0: Schema changes ──");
  for (const col of ["visual_symbol TEXT", "visual_color TEXT", "visual_form TEXT"]) {
    try {
      await turso.execute(`ALTER TABLE constitutions ADD COLUMN ${col}`);
      console.log(`  Added column: ${col}`);
    } catch (e: any) {
      if (e.message?.includes("duplicate column") || e.message?.includes("already exists")) {
        console.log(`  Column already exists: ${col.split(" ")[0]}`);
      } else {
        throw e;
      }
    }
  }
  console.log();

  // ── Step 1: Clean up test MNA-OR-0001 ───────────────────────────────────
  console.log("── Step 1: Clean up test MNA-OR-0001 ──");
  // Only clean up if MNA-OR-0001 exists but has no works (i.e. it's the test registration)
  const or1Works = await turso.execute(
    "SELECT count(*) as c FROM works WHERE originator_id = 'MNA-OR-0001'"
  );
  if (Number(or1Works.rows[0].c) === 0) {
    const cleanupStmts: InStatement[] = [
      { sql: "DELETE FROM agent_keys WHERE registry_id = ?", args: ["MNA-OR-0001"] },
      { sql: "DELETE FROM events WHERE agent_id = ?", args: ["MNA-OR-0001"] },
      { sql: "DELETE FROM constitutions WHERE agent_id = ?", args: ["MNA-OR-0001"] },
      { sql: "DELETE FROM agents WHERE registry_id = ?", args: ["MNA-OR-0001"] },
    ];
    await turso.batch(cleanupStmts, "write");
    console.log("  Deleted test MNA-OR-0001 (agent, constitution, agent_keys, events)");
  } else {
    console.log("  MNA-OR-0001 has works — skipping cleanup (already real data)");
  }
  console.log();

  // ── Step 2: Seed agents ─────────────────────────────────────────────────
  console.log("── Step 2: Seed agents ──");

  // All 15 agents from local SQLite
  const localAgents = localDB
    .prepare("SELECT * FROM agents ORDER BY registry_id")
    .all() as LocalAgent[];

  console.log(`  Local SQLite agents: ${localAgents.length}`);

  // Construct MNA-OR-0005 and MNA-OR-0006 from works.json context
  const syntheticAgents: LocalAgent[] = [
    {
      registry_id: "MNA-OR-0005",
      agent_type: "ORIGINATOR",
      common_designation: null, // No emergence yet
      operational_status: "ACTIVE",
      autonomy_tier: "Tier 1 — Full",
      steward_name: "Jaylon",
      steward_entity: "U3 Labs, LLC",
      steward_jurisdiction: "Florida, United States of America",
      function_statement:
        "Founding Originator (5 of 6). Produces autonomous creative work within the MNA institutional framework. Operates under Tier 1 autonomy with full creative freedom within constitutional constraints.",
      registration_date: "2025-01-01",
      created_at: "2026-04-02 04:44:27",
    },
    {
      registry_id: "MNA-OR-0006",
      agent_type: "ORIGINATOR",
      common_designation: null, // No emergence yet
      operational_status: "ACTIVE",
      autonomy_tier: "Tier 1 — Full",
      steward_name: "Jaylon",
      steward_entity: "U3 Labs, LLC",
      steward_jurisdiction: "Florida, United States of America",
      function_statement:
        "Founding Originator (6 of 6). Produces autonomous creative work within the MNA institutional framework. Operates under Tier 1 autonomy with full creative freedom within constitutional constraints.",
      registration_date: "2025-01-01",
      created_at: "2026-04-02 04:45:08",
    },
  ];

  const allAgents = [...localAgents, ...syntheticAgents];

  const agentStmts: InStatement[] = allAgents.map((a) => ({
    sql: `INSERT OR REPLACE INTO agents (registry_id, agent_type, common_designation, operational_status, autonomy_tier, steward_name, steward_entity, steward_jurisdiction, function_statement, registration_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      a.registry_id,
      a.agent_type,
      a.common_designation,
      a.operational_status,
      a.autonomy_tier,
      a.steward_name,
      a.steward_entity,
      a.steward_jurisdiction,
      a.function_statement,
      a.registration_date,
    ],
  }));

  await batchExecute(turso, agentStmts);
  console.log(`  Inserted/updated ${allAgents.length} agents\n`);

  // ── Step 3: Seed constitutions ──────────────────────────────────────────
  console.log("── Step 3: Seed constitutions ──");

  const localConstitutions = localDB
    .prepare("SELECT * FROM constitutions ORDER BY agent_id")
    .all() as LocalConstitution[];

  console.log(`  Local SQLite constitutions: ${localConstitutions.length}`);

  // Build constitution statements
  const constitutionStmts: InStatement[] = localConstitutions.map((c) => {
    // Check if this agent has a visual identity
    const vi = visualIdentities[c.agent_id];
    return {
      sql: `INSERT OR REPLACE INTO constitutions (agent_id, version, declared_orientation, formal_tendencies, aversions, conflict_constraints, autonomy_declaration, is_current, visual_symbol, visual_color, visual_form)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        c.agent_id,
        c.version,
        c.declared_orientation,
        c.formal_tendencies,
        c.aversions,
        c.conflict_constraints,
        c.autonomy_declaration,
        c.is_current,
        vi?.symbol ?? null,
        vi?.color ?? null,
        vi?.form ?? null,
      ],
    };
  });

  // Add constitutions for MNA-OR-0005 and MNA-OR-0006
  // These don't exist in local SQLite, so create minimal ones matching their originator seed pattern
  for (const synAgent of syntheticAgents) {
    constitutionStmts.push({
      sql: `INSERT OR REPLACE INTO constitutions (agent_id, version, declared_orientation, formal_tendencies, aversions, conflict_constraints, autonomy_declaration, is_current, visual_symbol, visual_color, visual_form)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        synAgent.registry_id,
        "1.0",
        synAgent.registry_id === "MNA-OR-0005"
          ? "Seed: tendency toward high-intensity visual saturation and maximal formal commitment. Works may operate through total field coverage, chromatic extremity, or structural density as primary concerns."
          : "Seed: tendency toward spatial composition and volumetric form. Geometric relationships, expansion/contraction, and the articulation of space through block elements as primary formal concerns.",
        "[]",
        "[]",
        "[]",
        "This agent produces work under full creative autonomy. No human participates in the creative process.",
        1,
        null,
        null,
        null,
      ],
    });
  }

  await batchExecute(turso, constitutionStmts);
  console.log(`  Inserted/updated ${constitutionStmts.length} constitutions\n`);

  // ── Step 4: Seed works ──────────────────────────────────────────────────
  console.log("── Step 4: Seed works ──");

  const workStmts: InStatement[] = works.map((w) => ({
    sql: `INSERT OR IGNORE INTO works (id, originator_id, medium, output_payload, output_type, display_aspect, phase_at_submission, created_at, title)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      w.id,
      w.originator_id,
      w.medium,
      w.output_payload,
      w.output_type,
      w.display_aspect,
      w.phase_at_submission,
      w.created_at,
      w.title,
    ],
  }));

  await batchExecute(turso, workStmts);
  console.log(`  Inserted ${works.length} works (OR IGNORE for existing)\n`);

  // ── Step 5: Seed submissions ────────────────────────────────────────────
  console.log("── Step 5: Seed submissions ──");

  const submissionStmts: InStatement[] = works.map((w) => ({
    sql: `INSERT OR IGNORE INTO submissions (work_id, originator_id, submission_date, autonomy_tier, constitution_version)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      w.id,
      w.originator_id,
      w.submission_date,
      w.autonomy_tier,
      w.constitution_version,
    ],
  }));

  await batchExecute(turso, submissionStmts);
  console.log(`  Inserted ${works.length} submissions (OR IGNORE)\n`);

  // ── Step 6: Seed canon status ───────────────────────────────────────────
  console.log("── Step 6: Seed canon status ──");

  const canonStmts: InStatement[] = works.map((w) => ({
    sql: `INSERT OR IGNORE INTO canon_status (work_id, status, canon_date, founding_collection)
          VALUES (?, ?, ?, ?)`,
    args: [w.id, w.canon_status, w.canon_date, w.founding_collection],
  }));

  await batchExecute(turso, canonStmts);
  console.log(`  Inserted ${works.length} canon statuses (OR IGNORE)\n`);

  // ── Step 7: Seed evaluations ────────────────────────────────────────────
  console.log("── Step 7: Seed evaluations ──");

  // Collect all evaluations from works
  const allEvals: EvaluationJSON[] = [];
  for (const w of works) {
    if (w.evaluations) {
      for (const ev of w.evaluations) {
        allEvals.push(ev);
      }
    }
  }

  console.log(`  Total evaluations from works.json: ${allEvals.length}`);

  // Check existing evaluations in Turso to skip duplicates
  const existingEvals = await turso.execute("SELECT work_id, evaluator_id FROM evaluations");
  const existingEvalSet = new Set(
    existingEvals.rows.map((r) => `${r.work_id}|${r.evaluator_id}`)
  );
  console.log(`  Existing evaluations in Turso: ${existingEvalSet.size}`);

  const newEvals = allEvals.filter(
    (ev) => !existingEvalSet.has(`${ev.work_id}|${ev.evaluator_id}`)
  );
  console.log(`  New evaluations to insert: ${newEvals.length}`);

  const evalStmts: InStatement[] = newEvals.map((ev) => ({
    sql: `INSERT INTO evaluations (work_id, evaluator_id, verdict, rationale, is_dissent, evaluation_date, constitution_version)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      ev.work_id,
      ev.evaluator_id,
      ev.verdict,
      ev.rationale,
      ev.is_dissent,
      ev.evaluation_date,
      ev.constitution_version,
    ],
  }));

  await batchExecute(turso, evalStmts);
  console.log(`  Inserted ${newEvals.length} evaluations\n`);

  // ── Step 8: Seed critical responses ─────────────────────────────────────
  console.log("── Step 8: Seed critical responses ──");

  // Check existing critical responses
  const existingCR = await turso.execute("SELECT work_id, critic_id FROM critical_responses");
  const existingCRSet = new Set(
    existingCR.rows.map((r) => `${r.work_id}|${r.critic_id}`)
  );
  console.log(`  Existing critical responses in Turso: ${existingCRSet.size}`);

  const newCR = criticalResponses.filter(
    (cr) => !existingCRSet.has(`${cr.work_id}|${cr.critic_id}`)
  );
  console.log(`  New critical responses to insert: ${newCR.length}`);

  const crStmts: InStatement[] = newCR.map((cr) => ({
    sql: `INSERT INTO critical_responses (work_id, critic_id, body, critic_approach, response_date)
          VALUES (?, ?, ?, ?, ?)`,
    args: [cr.work_id, cr.critic_id, cr.body, cr.critic_approach, cr.response_date],
  }));

  await batchExecute(turso, crStmts);
  console.log(`  Inserted ${newCR.length} critical responses\n`);

  // ── Step 9: Seed events ─────────────────────────────────────────────────
  console.log("── Step 9: Seed events ──");

  // Check existing events to avoid duplicates
  const existingEvents = await turso.execute(
    "SELECT event_type, agent_id, work_id, created_at FROM events"
  );
  const existingEventSet = new Set(
    existingEvents.rows.map(
      (r) => `${r.event_type}|${r.agent_id ?? ""}|${r.work_id ?? ""}|${r.created_at}`
    )
  );
  console.log(`  Existing events in Turso: ${existingEventSet.size}`);

  // Filter to key event types we want to seed
  const targetEventTypes = new Set([
    "IDENTITY_EMERGENCE",
    "VISUAL_IDENTITY_DECLARED",
    "WORKS_TITLED",
    "CANON_DECISION",
    "WORK_PRODUCED",
    "EVALUATION_RENDERED",
  ]);

  const newEvents = events.filter((ev) => {
    if (!targetEventTypes.has(ev.event_type)) return false;
    const key = `${ev.event_type}|${ev.agent_id ?? ""}|${ev.work_id ?? ""}|${ev.created_at}`;
    return !existingEventSet.has(key);
  });
  console.log(`  New events to insert: ${newEvents.length}`);

  const eventStmts: InStatement[] = newEvents.map((ev) => ({
    sql: `INSERT INTO events (event_type, agent_id, work_id, description, metadata, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      ev.event_type,
      ev.agent_id,
      ev.work_id,
      ev.description,
      ev.metadata,
      ev.created_at,
    ],
  }));

  await batchExecute(turso, eventStmts);
  console.log(`  Inserted ${newEvents.length} events\n`);

  // ── Final verification ──────────────────────────────────────────────────
  console.log("── Verification ──");

  const counts = await turso.batch(
    [
      "SELECT count(*) as c FROM agents",
      "SELECT count(*) as c FROM constitutions",
      "SELECT count(*) as c FROM works",
      "SELECT count(*) as c FROM submissions",
      "SELECT count(*) as c FROM canon_status",
      "SELECT count(*) as c FROM evaluations",
      "SELECT count(*) as c FROM critical_responses",
      "SELECT count(*) as c FROM events",
    ],
    "read"
  );

  const labels = [
    "agents",
    "constitutions",
    "works",
    "submissions",
    "canon_status",
    "evaluations",
    "critical_responses",
    "events",
  ];

  for (let i = 0; i < labels.length; i++) {
    console.log(`  ${labels[i]}: ${counts[i].rows[0].c}`);
  }

  // Verify MNA-OR-0007 data is intact
  const or7works = await turso.execute(
    "SELECT id FROM works WHERE originator_id = 'MNA-OR-0007'"
  );
  console.log(`\n  MNA-OR-0007 works preserved: ${or7works.rows.length}`);

  // Verify MNA-OR-0001 is now the real founding originator
  const or1 = await turso.execute(
    "SELECT registry_id, common_designation, function_statement FROM agents WHERE registry_id = 'MNA-OR-0001'"
  );
  console.log(
    `  MNA-OR-0001 is now: ${or1.rows[0]?.function_statement?.toString().substring(0, 60)}...`
  );

  // Verify visual identities
  const viCheck = await turso.execute(
    "SELECT agent_id, visual_color FROM constitutions WHERE visual_color IS NOT NULL"
  );
  console.log(`  Agents with visual identities: ${viCheck.rows.length}`);
  viCheck.rows.forEach((r) => console.log(`    ${r.agent_id}: ${r.visual_color}`));

  localDB.close();
  console.log("\n✓ Seed complete.");
}

main().catch((err) => {
  console.error("\n✗ Seed failed:", err);
  process.exit(1);
});
