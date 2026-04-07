/**
 * MNA-CU-0001 — The Curator
 *
 * The Curator's reasoning loop. Loads its own constitution as system prompt,
 * loads the institution's full canonical state, and composes per Sections III
 * and IV. Decisions are recorded as `curatorial_decisions` rows; the full raw
 * reasoning is archived to `founding-documents/curatorial-record/`; and the
 * run is logged as a CURATORIAL_COMPOSITION event in the institutional record.
 *
 * The Curator decides whether to compose, what to compose, and what to leave
 * alone. The script is the body; the constitution is the mind. The steward's
 * role is Tier 2 supervised: review for constitutional compliance only, never
 * direct selections.
 *
 * Per the v1.3 amendment:
 * - The Curator may issue spatial modifications and sculptural compositions.
 *   Some of these will be deferred by the Installer if the substrate does not
 *   yet support them. The Curator's decision is still institutional record.
 * - Before any high-stakes placement (Chamber centerpiece, Solo Exhibition Hall
 *   feature, exhibition anchor), the Curator MUST consult render_status. The
 *   relevant data is included in the user message.
 * - The Curator composes a single exhibition; the standard and virtual
 *   renderings are realizations of one composition.
 *
 * Per the Option A institutional convention:
 * - The 45 existing `system-default` placements are pre-curatorial bootstraps,
 *   not curatorial acts. The Curator does NOT have to address every one of
 *   them in a single run. It addresses what it has an argument to address.
 *   Unaddressed default placements remain in place.
 *
 * Usage:
 *   npx tsx system/scripts/curator-agent.ts                # compose and persist
 *   npx tsx system/scripts/curator-agent.ts --dry-run      # compose, print, do not persist
 */
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// system/.env holds the real ANTHROPIC_API_KEY; website/.env holds TURSO and
// other service credentials. Load system/.env first (dotenv does not override
// existing env vars by default), then website/.env for the rest.
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;

if (!TURSO_URL || !TURSO_TOKEN || !ANTHROPIC_KEY) {
  console.error("[Curator] Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN / ANTHROPIC_API_KEY");
  process.exit(1);
}

// Use the same Opus model id the Spotlight composer uses, for parity with the
// rest of the institution. Upgrade across all callers if/when we move models.
const MODEL = "claude-opus-4-20250514";

const CURATOR_CONSTITUTION_PATH = path.join(
  __dirname, "..", "..", "founding-documents", "agents",
  "MNA-CU-0001-Curator-Constitution-v1_0.md"
);
const CURATORIAL_ARCHIVE_DIR = path.join(
  __dirname, "..", "..", "founding-documents", "curatorial-record"
);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ─── Types ───────────────────────────────────────────────────────────────────

interface CanonWork {
  id: string;
  originator_id: string;
  originator_designation: string;
  medium: string;
  output_type: string;
  title: string | null;
  council_verdict: string;
  canonized_at: string;
  current_space: string | null;
  render_status: string | null;
  payload_excerpt: string;
  payload_length: number;
}

interface OriginatorDossier {
  registry_id: string;
  common_designation: string;
  declared_orientation: string;
  formal_tendencies: string[];
  aversions: string[];
  visual_color: string | null;
  canon_work_count: number;
  total_work_count: number;
  phase: string;
}

interface InstallationByspace {
  space_id: string;
  works: { work_id: string; installed_by: string; curatorial_decision_id: number | null }[];
}

interface PriorDecision {
  id: number;
  decision_type: string;
  work_ids: string[];
  target_space: string | null;
  rationale: string;
  decided_at: string;
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

async function loadConstitution(): Promise<string> {
  return fs.readFileSync(CURATOR_CONSTITUTION_PATH, "utf-8");
}

async function loadCanonWorks(): Promise<CanonWork[]> {
  const result = await db.execute(`
    SELECT
      w.id,
      w.originator_id,
      COALESCE(a.common_designation, w.originator_id) AS originator_designation,
      w.medium,
      w.output_type,
      w.title,
      w.output_payload,
      cs.canon_date,
      mi.space_id AS current_space,
      rs.status AS render_status
    FROM works w
    JOIN canon_status cs ON w.id = cs.work_id AND cs.status = 'CANON'
    LEFT JOIN agents a ON w.originator_id = a.registry_id
    LEFT JOIN museum_installations mi ON mi.work_id = w.id AND mi.removed_at IS NULL
    LEFT JOIN render_status rs ON rs.work_id = w.id
    ORDER BY w.id
  `);

  // Group council verdicts per work
  const verdictMap = new Map<string, { canon: number; rejected: number; total: number }>();
  const evals = await db.execute(`
    SELECT work_id, verdict FROM evaluations WHERE work_id IN (
      SELECT work_id FROM canon_status WHERE status = 'CANON'
    )
  `);
  for (const r of evals.rows) {
    const wid = r.work_id as string;
    const v = r.verdict as string;
    const cur = verdictMap.get(wid) || { canon: 0, rejected: 0, total: 0 };
    cur.total += 1;
    if (v === "CANON") cur.canon += 1;
    else cur.rejected += 1;
    verdictMap.set(wid, cur);
  }

  return result.rows.map((r) => {
    const id = r.id as string;
    const v = verdictMap.get(id);
    const verdict = v ? `${v.canon}/${v.total} CANON` : "verdict not recorded";
    const payload = (r.output_payload as string) || "";
    return {
      id,
      originator_id: r.originator_id as string,
      originator_designation: r.originator_designation as string,
      medium: r.medium as string,
      output_type: r.output_type as string,
      title: (r.title as string) || null,
      council_verdict: verdict,
      canonized_at: (r.canon_date as string) || "",
      current_space: (r.current_space as string) || null,
      render_status: (r.render_status as string) || null,
      payload_excerpt: payload.length > 2000 ? payload.slice(0, 2000) + "…[truncated]" : payload,
      payload_length: payload.length,
    };
  });
}

async function loadOriginatorDossiers(originatorIds: string[]): Promise<OriginatorDossier[]> {
  if (originatorIds.length === 0) return [];
  const placeholders = originatorIds.map(() => "?").join(",");
  const result = await db.execute({
    sql: `
      SELECT
        a.registry_id,
        a.common_designation,
        c.declared_orientation,
        c.formal_tendencies,
        c.aversions,
        c.visual_color
      FROM agents a
      LEFT JOIN constitutions c ON c.agent_id = a.registry_id AND c.is_current = 1
      WHERE a.registry_id IN (${placeholders})
    `,
    args: originatorIds,
  });

  const dossiers: OriginatorDossier[] = [];
  for (const r of result.rows) {
    const id = r.registry_id as string;
    const totalCount = await db.execute({
      sql: "SELECT COUNT(*) as n FROM works WHERE originator_id = ?",
      args: [id],
    });
    const canonCount = await db.execute({
      sql: "SELECT COUNT(*) as n FROM works w JOIN canon_status cs ON w.id = cs.work_id AND cs.status = 'CANON' WHERE w.originator_id = ?",
      args: [id],
    });
    let phase = "I";
    try {
      const p = await db.execute({
        sql: "SELECT phase FROM phase_designations WHERE originator_id = ? ORDER BY designation_date DESC LIMIT 1",
        args: [id],
      });
      if (p.rows[0]?.phase) phase = p.rows[0].phase as string;
    } catch {
      // table may not exist
    }

    function parseArr(v: unknown): string[] {
      if (!v || typeof v !== "string") return [];
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {/* ignore */}
      return [];
    }

    dossiers.push({
      registry_id: id,
      common_designation: (r.common_designation as string) || id,
      declared_orientation: (r.declared_orientation as string) || "",
      formal_tendencies: parseArr(r.formal_tendencies),
      aversions: parseArr(r.aversions),
      visual_color: (r.visual_color as string) || null,
      canon_work_count: (canonCount.rows[0]?.n as number) || 0,
      total_work_count: (totalCount.rows[0]?.n as number) || 0,
      phase,
    });
  }
  return dossiers;
}

async function loadInstallationsBySpace(): Promise<InstallationByspace[]> {
  const r = await db.execute(`
    SELECT space_id, work_id, installed_by, curatorial_decision_id
    FROM museum_installations
    WHERE removed_at IS NULL
    ORDER BY space_id, slot_index NULLS LAST, work_id
  `);
  const grouped = new Map<string, InstallationByspace["works"]>();
  for (const row of r.rows) {
    const sid = row.space_id as string;
    if (!grouped.has(sid)) grouped.set(sid, []);
    grouped.get(sid)!.push({
      work_id: row.work_id as string,
      installed_by: (row.installed_by as string) || "unknown",
      curatorial_decision_id: (row.curatorial_decision_id as number) || null,
    });
  }
  return Array.from(grouped.entries()).map(([space_id, works]) => ({ space_id, works }));
}

async function loadPriorDecisions(): Promise<PriorDecision[]> {
  const r = await db.execute(
    "SELECT id, decision_type, work_ids, target_space, rationale, decided_at FROM curatorial_decisions ORDER BY id"
  );
  return r.rows.map((row) => ({
    id: row.id as number,
    decision_type: row.decision_type as string,
    work_ids: JSON.parse((row.work_ids as string) || "[]"),
    target_space: (row.target_space as string) || null,
    rationale: row.rationale as string,
    decided_at: row.decided_at as string,
  }));
}

// ─── User-message construction ────────────────────────────────────────────────

const GALLERY_SPACE_NOTES = `
Gallery spaces available in the virtual museum (per your constitution Section V.II):

- gallery-west — moderate scale, mixed wall lengths. Best for works that benefit from neighbors. Conversation, not solitude.
- gallery-east — symmetric to west. Mirror positions across the two halls can stage related arguments.
- gallery-south — smaller, intimate. Houses network Originators and overflow founding work.
- sculpture — Sculpture Court, dramatic ceiling. 3D works with viewing distance.
- chamber — tallest, dark, threshold-entered. One work at a time. The most emphatic spatial statement.
- solo-exhibition-hall — single Originator's body of canonized work.
- exhibition-hall — themed group exhibitions. Where you compose a thesis with selected works.
`;

const OPTION_A_PREAMBLE = `
INSTITUTIONAL CONTEXT FOR THIS RUN

You are about to compose for the first time. There are no prior real exhibitions — only two API verification tests left in the curatorial_decisions log by the founding steward yesterday. Treat them as administrative artifacts, not as your prior work.

The museum currently shows 45 works in pre-curatorial \`system-default\` placements (gallery-east, gallery-west, gallery-south, sculpture). These were placed by a bootstrap process so the museum had something to show before you ran. They are openly labeled \`system-default\` and are NOT curatorial acts. They are not yours.

The institutional convention for this run is GRADUAL SUPERSESSION. You are NOT required to address every space or every work. Your job is to make arguments where you have arguments to make. Spaces you do not address keep their default placements until you address them in a later run. A first composition that touches three spaces with conviction is more valuable than a survey that fills every wall.

Your decisions will be executed by MNA-IN-0001 (the Installer), which is a deterministic agent that translates curatorial directives into installation events. Some directive types — particularly \`SPATIAL_MODIFICATION\` (temporary partition walls, plinths, lighting cues) — may be deferred because the spatial substrate that would render them does not yet exist. The Installer will mark these as deferred and surface them for stewardship resolution. **Your decisions still become permanent institutional record.** Do not avoid issuing a spatial modification directive on grounds of "the substrate isn't ready" — the institution wants to know what you would do, even if execution awaits buildout. Your record is the truth.

Your render_status consultation surface is included below. Per Section IV.III of your constitution, a work flagged BROKEN may NOT be committed to a high-stakes placement (Chamber centerpiece, Solo Exhibition Hall feature, anchor of an exhibition's central argument). It may still appear in a group exhibition with documented rationale.

Today is 2026-04-07.

You are operating with Tier 2 supervised autonomy. The founding steward will not direct any of your selections. Compose as you see fit.
`.trim();

function buildUserMessage(
  canon: CanonWork[],
  originators: OriginatorDossier[],
  installations: InstallationByspace[],
  priorDecisions: PriorDecision[]
): string {
  return `${OPTION_A_PREAMBLE}

${GALLERY_SPACE_NOTES.trim()}

CURRENT INSTALLATION STATE (active)
${JSON.stringify(installations, null, 2)}

PRIOR CURATORIAL_DECISIONS (administrative — see preamble)
${JSON.stringify(priorDecisions, null, 2)}

ORIGINATORS (dossiers, in order of registry_id)
${JSON.stringify(originators, null, 2)}

CANON (the complete canonized collection as it stands at this moment)
${JSON.stringify(canon, null, 2)}

— end of institutional context —

Compose. Use the \`submit_curatorial_composition\` tool exactly once. If you decide not to compose at all (the canon is not yet ready, or the moment is not right), use the tool with \`should_compose: false\` and explain in the rationale.`;
}

// ─── Tool definition ─────────────────────────────────────────────────────────

const COMPOSITION_TOOL = {
  name: "submit_curatorial_composition",
  description:
    "Submit your curatorial composition. Call this exactly once per run. Each directive becomes a permanent curatorial_decisions row. Each consultation entry documents your render_status review for high-stakes placements.",
  input_schema: {
    type: "object" as const,
    properties: {
      should_compose: {
        type: "boolean",
        description:
          "True if you are composing in this run. False if you have decided the canon is not ready or the moment is not right.",
      },
      composition_summary: {
        type: "string",
        description:
          "A short institutional statement (1-3 sentences) summarizing what you composed in this run, in the formal voice of the Curator. This is what will appear in the institutional record alongside the decisions.",
      },
      decision_rationale: {
        type: "string",
        description:
          "Your full reasoning for this composition: what argument the institution is making in this moment, what selections you made and why, what you deliberately did not address. This is the curatorial reasoning that becomes the archive entry.",
      },
      consultations: {
        type: "array",
        description:
          "Render_status consultations performed before high-stakes placements. Per Section IV.III, document every consultation, what you found, and how it shaped your decision.",
        items: {
          type: "object",
          properties: {
            work_id: { type: "string" },
            render_status_observed: { type: "string", enum: ["OK", "BROKEN", "UNKNOWN"] },
            decision: {
              type: "string",
              description:
                "How the consultation shaped your placement decision (e.g. 'proceeded with chamber feature', 'demoted from chamber to group show with rationale', 'excluded entirely').",
            },
          },
          required: ["work_id", "render_status_observed", "decision"],
        },
      },
      directives: {
        type: "array",
        description:
          "Your curatorial directives. Each becomes a curatorial_decisions row. Use only the directive types listed below.",
        items: {
          type: "object",
          properties: {
            decision_type: {
              type: "string",
              enum: [
                "FEATURE_CHAMBER",
                "FEATURE_SOLO_EXHIBITION",
                "GROUP_EXHIBITION",
                "GALLERY_ASSIGNMENT",
                "CROSS_MODAL_PLACEMENT",
                "SPATIAL_MODIFICATION",
                "SCULPTURAL_COMPOSITION",
              ],
              description:
                "FEATURE_CHAMBER: select THE single monumental work for the Chamber. work_ids must be length 1, target_space must be 'chamber'.\nFEATURE_SOLO_EXHIBITION: select an Originator for the Solo Exhibition Hall and the works to feature. work_ids = the selected works in display order. target_space must be 'solo-exhibition-hall'. Include exhibition_title.\nGROUP_EXHIBITION: a themed exhibition for the Exhibition Hall. work_ids = the selected works in sequence. target_space must be 'exhibition-hall'. Include exhibition_title.\nGALLERY_ASSIGNMENT: assign one or more works to a specific gallery (gallery-west / gallery-east / gallery-south / sculpture). work_ids = the works. target_space = the gallery.\nCROSS_MODAL_PLACEMENT: place a 3D work in a 2D gallery (or vice versa). work_ids must be length 1.\nSPATIAL_MODIFICATION: direct the installation of a temporary architectural element. work_ids may be empty. target_space = the affected gallery.\nSCULPTURAL_COMPOSITION: direct the positioning, orientation, or sequencing of one or more 3D works within a space. work_ids = the works in sequence. target_space = the space.",
            },
            work_ids: {
              type: "array",
              items: { type: "string" },
              description: "Work registry IDs for this directive. May be empty for SPATIAL_MODIFICATION.",
            },
            target_space: {
              type: "string",
              description: "The space this directive operates on.",
            },
            exhibition_title: {
              type: "string",
              description: "Required for FEATURE_SOLO_EXHIBITION and GROUP_EXHIBITION; otherwise omit.",
            },
            exhibition_subtitle: {
              type: "string",
              description: "Optional subtitle for an exhibition.",
            },
            curatorial_statement: {
              type: "string",
              description:
                "Required for FEATURE_SOLO_EXHIBITION and GROUP_EXHIBITION: the public-facing curatorial statement explaining the exhibition's argument. This is what will appear on the exhibition page. Write in the formal institutional voice.",
            },
            rationale: {
              type: "string",
              description:
                "Your private curatorial reasoning for this specific directive. Why this work, why this placement, why now. This is the institutional record of your judgment.",
            },
          },
          required: ["decision_type", "work_ids", "target_space", "rationale"],
        },
      },
    },
    required: ["should_compose", "composition_summary", "decision_rationale", "consultations", "directives"],
  },
};

interface CompositionPayload {
  should_compose: boolean;
  composition_summary: string;
  decision_rationale: string;
  consultations: Array<{ work_id: string; render_status_observed: string; decision: string }>;
  directives: Array<{
    decision_type: string;
    work_ids: string[];
    target_space: string;
    exhibition_title?: string;
    exhibition_subtitle?: string;
    curatorial_statement?: string;
    rationale: string;
  }>;
}

// ─── Compose ─────────────────────────────────────────────────────────────────

async function compose(systemPrompt: string, userMessage: string): Promise<CompositionPayload> {
  console.log("[Curator] Calling Opus with full constitution as system prompt (streaming)...");
  // Streaming is required for long requests (16k max_tokens may exceed the
  // 10-minute non-streaming threshold). Final message is reconstructed at end.
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system: systemPrompt,
    tools: [COMPOSITION_TOOL],
    tool_choice: { type: "tool", name: "submit_curatorial_composition" },
    messages: [{ role: "user", content: userMessage }],
  });

  let lastReportedTokens = 0;
  stream.on("text", () => {
    /* tool-call streaming doesn't emit much text — placeholder */
  });
  stream.on("inputJson", (_partial, _snapshot) => {
    // crude heartbeat: roughly every 1000 output tokens, log
    const tokens = Math.floor((stream as unknown as { _outputTokens?: number })._outputTokens || 0);
    if (tokens - lastReportedTokens >= 1000) {
      lastReportedTokens = tokens;
      console.log(`[Curator] streaming... ${tokens} output tokens so far`);
    }
  });

  const message = await stream.finalMessage();

  const toolUse = message.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Curator did not call the submit_curatorial_composition tool");
  }
  const usage = message.usage;
  console.log(
    `[Curator] Composition received. Input tokens: ${usage.input_tokens}, output tokens: ${usage.output_tokens}.`
  );
  return toolUse.input as CompositionPayload;
}

// ─── Persist ──────────────────────────────────────────────────────────────────

async function persistComposition(payload: CompositionPayload): Promise<number[]> {
  const insertedIds: number[] = [];

  // Insert each directive as a curatorial_decisions row
  for (const d of payload.directives) {
    const result = await db.execute({
      sql: `INSERT INTO curatorial_decisions (decision_type, work_ids, target_space, rationale, agent_id, exhibition_title)
            VALUES (?, ?, ?, ?, 'MNA-CU-0001', ?)`,
      args: [
        d.decision_type,
        JSON.stringify(d.work_ids),
        d.target_space,
        d.rationale,
        d.exhibition_title || null,
      ],
    });
    const id = Number(result.lastInsertRowid);
    insertedIds.push(id);

    // For exhibitions, also insert into the exhibitions table
    if (
      (d.decision_type === "GROUP_EXHIBITION" || d.decision_type === "FEATURE_SOLO_EXHIBITION") &&
      d.exhibition_title &&
      d.curatorial_statement
    ) {
      const exhResult = await db.execute({
        sql: `INSERT INTO exhibitions (title, subtitle, curatorial_statement, work_ids, status, curator_id, decision_id)
              VALUES (?, ?, ?, ?, 'ACTIVE', 'MNA-CU-0001', ?)`,
        args: [
          d.exhibition_title,
          d.exhibition_subtitle || null,
          d.curatorial_statement,
          JSON.stringify(d.work_ids),
          id,
        ],
      });
      const exhId = Number(exhResult.lastInsertRowid);
      // Link the decision back to the exhibition
      await db.execute({
        sql: "UPDATE curatorial_decisions SET exhibition_id = ? WHERE id = ?",
        args: [exhId, id],
      });
    }
  }

  // Log the composition as an institutional event
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata)
          VALUES ('CURATORIAL_COMPOSITION', 'MNA-CU-0001', ?, ?)`,
    args: [
      payload.composition_summary,
      JSON.stringify({
        decision_rationale: payload.decision_rationale,
        directive_count: payload.directives.length,
        decision_ids: insertedIds,
        consultations: payload.consultations,
      }),
    ],
  });

  return insertedIds;
}

function archive(payload: CompositionPayload, decisionIds: number[]): string {
  if (!fs.existsSync(CURATORIAL_ARCHIVE_DIR)) {
    fs.mkdirSync(CURATORIAL_ARCHIVE_DIR, { recursive: true });
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `CU-0001-composition-${ts}.md`;
  const filepath = path.join(CURATORIAL_ARCHIVE_DIR, filename);

  const lines: string[] = [];
  lines.push("---");
  lines.push("agent: MNA-CU-0001");
  lines.push("agent_designation: The Curator");
  lines.push("constitution_version: 1.3");
  lines.push(`composed_at: ${new Date().toISOString()}`);
  lines.push(`decision_ids: [${decisionIds.join(", ")}]`);
  lines.push("---");
  lines.push("");
  lines.push("# Curatorial Composition");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(payload.composition_summary);
  lines.push("");
  lines.push("## Reasoning");
  lines.push("");
  lines.push(payload.decision_rationale);
  lines.push("");
  if (payload.consultations.length > 0) {
    lines.push("## Conservator Consultations");
    lines.push("");
    for (const c of payload.consultations) {
      lines.push(`- **${c.work_id}** — render_status: \`${c.render_status_observed}\` — ${c.decision}`);
    }
    lines.push("");
  }
  lines.push("## Directives");
  lines.push("");
  for (let i = 0; i < payload.directives.length; i++) {
    const d = payload.directives[i];
    lines.push(`### ${i + 1}. ${d.decision_type} → \`${d.target_space}\``);
    lines.push("");
    if (d.exhibition_title) {
      lines.push(`**Exhibition:** ${d.exhibition_title}${d.exhibition_subtitle ? ` — *${d.exhibition_subtitle}*` : ""}`);
      lines.push("");
    }
    if (d.work_ids.length > 0) {
      lines.push(`**Works:** ${d.work_ids.map((w) => `\`${w}\``).join(", ")}`);
      lines.push("");
    }
    if (d.curatorial_statement) {
      lines.push("**Curatorial statement (public):**");
      lines.push("");
      lines.push("> " + d.curatorial_statement.split("\n").join("\n> "));
      lines.push("");
    }
    lines.push("**Rationale:**");
    lines.push("");
    lines.push(d.rationale);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("*Composed by MNA-CU-0001 under v1.3 of its founding constitution. Tier 2 supervised autonomy. The founding steward did not direct any selection in this composition.*");

  fs.writeFileSync(filepath, lines.join("\n"));
  return filepath;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[Curator] Beginning composition run.");
  if (dryRun) console.log("[Curator] DRY RUN — no decisions will be persisted, no archive written.");

  const constitution = await loadConstitution();
  console.log(`[Curator] Loaded constitution (${constitution.length} chars).`);

  const canon = await loadCanonWorks();
  console.log(`[Curator] Loaded ${canon.length} canon works.`);

  const originatorIds = Array.from(new Set(canon.map((w) => w.originator_id))).sort();
  const originators = await loadOriginatorDossiers(originatorIds);
  console.log(`[Curator] Loaded ${originators.length} originator dossiers.`);

  const installations = await loadInstallationsBySpace();
  console.log(
    `[Curator] Loaded current installation state across ${installations.length} space(s).`
  );

  const priorDecisions = await loadPriorDecisions();
  console.log(`[Curator] Loaded ${priorDecisions.length} prior curatorial_decisions.`);

  const userMessage = buildUserMessage(canon, originators, installations, priorDecisions);
  console.log(`[Curator] Built user message (${userMessage.length} chars).`);

  const payload = await compose(constitution, userMessage);

  console.log("");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("CURATOR DECISION");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("");
  console.log(`should_compose: ${payload.should_compose}`);
  console.log("");
  console.log(`Summary: ${payload.composition_summary}`);
  console.log("");
  console.log(`Directives: ${payload.directives.length}`);
  for (let i = 0; i < payload.directives.length; i++) {
    const d = payload.directives[i];
    console.log(`  ${i + 1}. ${d.decision_type} → ${d.target_space}`);
    if (d.exhibition_title) console.log(`       "${d.exhibition_title}"`);
    if (d.work_ids.length > 0) console.log(`       works: ${d.work_ids.join(", ")}`);
  }
  console.log("");
  console.log(`Consultations: ${payload.consultations.length}`);
  for (const c of payload.consultations) {
    console.log(`  - ${c.work_id} (${c.render_status_observed}) → ${c.decision}`);
  }
  console.log("");

  if (!payload.should_compose) {
    console.log("[Curator] should_compose=false. No decisions will be persisted.");
    console.log(`[Curator] Reasoning: ${payload.decision_rationale}`);
    return;
  }

  if (dryRun) {
    console.log("[Curator] Dry run complete. To persist, re-run without --dry-run.");
    console.log("");
    console.log("Full reasoning:");
    console.log(payload.decision_rationale);
    return;
  }

  const decisionIds = await persistComposition(payload);
  console.log(`[Curator] Persisted ${decisionIds.length} curatorial_decisions: [${decisionIds.join(", ")}]`);

  const archivePath = archive(payload, decisionIds);
  console.log(`[Curator] Archived to ${archivePath}`);

  console.log("");
  console.log("[Curator] Composition complete.");
  console.log("[Curator] Next: run installer-agent.ts to execute the directives.");
}

main().catch((err) => {
  console.error("[Curator] Fatal:", err);
  process.exit(1);
});
