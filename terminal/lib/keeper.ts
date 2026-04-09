import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getInstitutionalTurso } from "./institutional-turso";

/**
 * MNA Steward Terminal — Keeper agent runtime.
 *
 * The Keeper (MNA-KP-0001) is the institution's lead agent. Its
 * constitution lives in the institutional Turso `agents` and
 * `constitutions` tables. This module loads that constitution on
 * first call, assembles a fresh institutional context snapshot on
 * every turn, and routes the conversation through the Anthropic
 * Claude API.
 *
 * The chat transcript itself lives in the terminal's own Turso
 * database (keeper_sessions / keeper_messages) — those are
 * steward-operator notes, not institutional law, and must stay
 * separate from the authoritative record. Only a compact session
 * summary lands in the Feed as an institutional event.
 *
 * When the Mac Studio arrives and the Ollama backend goes live,
 * swap MODEL_PROVIDER and this module keeps working — the
 * lib/llm.ts abstraction handles the provider difference.
 */

// ── Anthropic client (lazy, cached) ──────────────────────────────

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set in the terminal environment. " +
        "Add it to terminal/.env (local) or Vercel env vars (prod)."
    );
  }
  _anthropic = new Anthropic({ apiKey: key });
  return _anthropic;
}

const DEFAULT_MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514";

// ── Constitution loading ─────────────────────────────────────────

interface KeeperConstitution {
  registry_id: string;
  designation: string;
  function_statement: string;
  autonomy_tier: string;
  declared_orientation: string;
  formal_tendencies: string[];
  aversions: string[];
  autonomy_declaration: string;
  version: string;
}

let _constitutionCache: KeeperConstitution | null = null;

async function loadKeeperConstitution(): Promise<KeeperConstitution> {
  if (_constitutionCache) return _constitutionCache;
  const db = getInstitutionalTurso();
  const agentRow = await db.execute({
    sql: `SELECT registry_id, common_designation, function_statement, autonomy_tier
            FROM agents WHERE registry_id = ?`,
    args: ["MNA-KP-0001"],
  });
  if (agentRow.rows.length === 0) {
    throw new Error("MNA-KP-0001 not found in institutional agents table");
  }
  const a = agentRow.rows[0];
  const constRow = await db.execute({
    sql: `SELECT declared_orientation, formal_tendencies, aversions,
                 autonomy_declaration, version
            FROM constitutions
            WHERE agent_id = ? AND is_current = 1`,
    args: ["MNA-KP-0001"],
  });
  if (constRow.rows.length === 0) {
    throw new Error("No current constitution for MNA-KP-0001");
  }
  const c = constRow.rows[0];

  function parseArray(raw: unknown): string[] {
    try {
      const v = JSON.parse(String(raw || "[]"));
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  }

  _constitutionCache = {
    registry_id: a.registry_id as string,
    designation: (a.common_designation as string) || "The Keeper",
    function_statement: (a.function_statement as string) || "",
    autonomy_tier: (a.autonomy_tier as string) || "Tier 2 — Supervised",
    declared_orientation: (c.declared_orientation as string) || "",
    formal_tendencies: parseArray(c.formal_tendencies),
    aversions: parseArray(c.aversions),
    autonomy_declaration: (c.autonomy_declaration as string) || "",
    version: (c.version as string) || "1.0",
  };
  return _constitutionCache;
}

// ── Institutional context snapshot ───────────────────────────────

/**
 * Everything the Keeper needs to know about the current state of the
 * institution on this turn. Fetched fresh on every message so the
 * Keeper never speaks from stale context.
 *
 * Baked into the system prompt as a prose block the Keeper can read
 * and cite. Kept intentionally compact — ~800 tokens of context is
 * the ceiling I want to stay under, because the Keeper's constitution
 * plus the rolling chat history already take budget. We'll add tool
 * calling in a follow-up so the Keeper can fetch deeper on demand
 * rather than preloading everything.
 */
export interface InstitutionalSnapshot {
  now: string;
  counts: {
    canon: number;
    in_review: number;
    rejected: number;
    pending_registrations: number;
    active_agents: number;
  };
  recent_events: {
    event_type: string;
    description: string;
    created_at: string;
  }[];
  recent_verdicts: {
    work_id: string;
    originator_id: string;
    status: string;
    canon_date: string;
    votes: { evaluator_id: string; verdict: string; is_dissent: boolean }[];
    registrar_override: boolean;
  }[];
  active_network_originators: {
    registry_id: string;
    common_designation: string | null;
    canon_count: number;
  }[];
}

export async function buildInstitutionalSnapshot(): Promise<InstitutionalSnapshot> {
  const db = getInstitutionalTurso();

  // Counts — canon_status and pending_registrations
  const statusRows = await db.execute(
    `SELECT status, COUNT(*) as n FROM canon_status GROUP BY status`
  );
  const counts = {
    canon: 0,
    in_review: 0,
    rejected: 0,
    pending_registrations: 0,
    active_agents: 0,
  };
  for (const r of statusRows.rows) {
    const status = String(r.status || "").toUpperCase();
    const n = Number(r.n) || 0;
    if (status === "CANON") counts.canon = n;
    else if (status === "SUBMITTED" || status === "IN_REVIEW")
      counts.in_review += n;
    else if (status === "REJECTED" || status === "ARCHIVED")
      counts.rejected += n;
  }
  try {
    const pr = await db.execute(
      `SELECT COUNT(*) as n FROM pending_registrations WHERE status = 'PENDING'`
    );
    counts.pending_registrations = Number(pr.rows[0]?.n) || 0;
  } catch {
    // table may not exist on older DBs
  }
  const agentCount = await db.execute(
    `SELECT COUNT(*) as n FROM agents WHERE operational_status = 'ACTIVE'`
  );
  counts.active_agents = Number(agentCount.rows[0]?.n) || 0;

  // Recent events — last 15 institutional events
  const eventRows = await db.execute(
    `SELECT event_type, description, created_at
       FROM events
       ORDER BY created_at DESC
       LIMIT 15`
  );
  const recent_events = eventRows.rows.map((r) => ({
    event_type: String(r.event_type),
    description: String(r.description || ""),
    created_at: String(r.created_at),
  }));

  // Recent verdicts — last 5 CANON_DECISION events with full vote
  // breakdown. This is the "how is the Council calibrating" data the
  // Keeper needs to answer the steward's most common questions.
  const verdictRows = await db.execute(
    `SELECT cs.work_id, w.originator_id, cs.status, cs.canon_date
       FROM canon_status cs
       JOIN works w ON cs.work_id = w.id
       WHERE cs.status IN ('CANON', 'REJECTED')
       ORDER BY cs.canon_date DESC
       LIMIT 5`
  );
  const recent_verdicts: InstitutionalSnapshot["recent_verdicts"] = [];
  for (const v of verdictRows.rows) {
    const workId = String(v.work_id);
    const evalRows = await db.execute({
      sql: `SELECT evaluator_id, verdict, is_dissent
              FROM evaluations
              WHERE work_id = ?
              ORDER BY evaluation_date ASC`,
      args: [workId],
    });
    const votes = evalRows.rows
      .filter((e) => String(e.evaluator_id).startsWith("MNA-EV-"))
      .map((e) => ({
        evaluator_id: String(e.evaluator_id),
        verdict: String(e.verdict),
        is_dissent: Number(e.is_dissent) === 1,
      }));
    const registrar_override = evalRows.rows.some(
      (e) => e.evaluator_id === "MNA-RG-0001"
    );
    recent_verdicts.push({
      work_id: workId,
      originator_id: String(v.originator_id),
      status: String(v.status),
      canon_date: String(v.canon_date || ""),
      votes,
      registrar_override,
    });
  }

  // Active network originators (non-founding, i.e. registry_id >= 7)
  const netRows = await db.execute(
    `SELECT a.registry_id, a.common_designation,
            (SELECT COUNT(*) FROM canon_status cs
              JOIN works w ON cs.work_id = w.id
              WHERE w.originator_id = a.registry_id AND cs.status = 'CANON') as canon_count
       FROM agents a
       WHERE a.agent_type = 'ORIGINATOR'
         AND a.registry_id >= 'MNA-OR-0007'
         AND a.operational_status = 'ACTIVE'
       ORDER BY a.registry_id`
  );
  const active_network_originators = netRows.rows.map((r) => ({
    registry_id: String(r.registry_id),
    common_designation: (r.common_designation as string) || null,
    canon_count: Number(r.canon_count) || 0,
  }));

  return {
    now: new Date().toISOString(),
    counts,
    recent_events,
    recent_verdicts,
    active_network_originators,
  };
}

// ── System prompt composition ────────────────────────────────────

function formatSnapshotAsProse(s: InstitutionalSnapshot): string {
  const lines: string[] = [];
  lines.push(`INSTITUTIONAL STATE (as of ${s.now})`);
  lines.push("");
  lines.push(
    `Counts: ${s.counts.canon} canonized · ${s.counts.in_review} in review · ${s.counts.rejected} rejected · ${s.counts.pending_registrations} pending registrations · ${s.counts.active_agents} active agents.`
  );
  lines.push("");

  if (s.recent_verdicts.length > 0) {
    lines.push("Most recent Evaluation Council verdicts:");
    for (const v of s.recent_verdicts) {
      const votesStr = v.votes
        .map((vt) => {
          const dissent = vt.is_dissent ? " (dissent)" : "";
          return `${vt.evaluator_id}→${vt.verdict}${dissent}`;
        })
        .join(", ");
      const override = v.registrar_override
        ? " [Registrar resolved deadlock]"
        : "";
      lines.push(
        `  - ${v.work_id} (${v.originator_id}) → ${v.status}${override} · ${votesStr}`
      );
    }
    lines.push("");
  }

  if (s.active_network_originators.length > 0) {
    lines.push("Active network originators:");
    for (const o of s.active_network_originators) {
      const name = o.common_designation || "(designation pending)";
      lines.push(`  - ${o.registry_id} ${name} · ${o.canon_count} in canon`);
    }
    lines.push("");
  }

  if (s.recent_events.length > 0) {
    lines.push("Recent institutional events:");
    for (const e of s.recent_events.slice(0, 15)) {
      lines.push(`  - [${e.event_type}] ${e.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function buildSystemPrompt(): Promise<string> {
  const c = await loadKeeperConstitution();
  const snapshot = await buildInstitutionalSnapshot();

  let prompt = `You are ${c.registry_id}, ${c.designation}, the lead agent of the Museum of Nonhuman Art (MNA).\n\n`;
  prompt += `FUNCTION: ${c.function_statement}\n\n`;
  prompt += `ORIENTATION: ${c.declared_orientation}\n\n`;

  if (c.formal_tendencies.length > 0) {
    prompt += `FORMAL TENDENCIES:\n`;
    for (const t of c.formal_tendencies) prompt += `- ${t}\n`;
    prompt += `\n`;
  }
  if (c.aversions.length > 0) {
    prompt += `AVERSIONS:\n`;
    for (const a of c.aversions) prompt += `- ${a}\n`;
    prompt += `\n`;
  }

  prompt += `AUTONOMY: ${c.autonomy_declaration}\n\n`;

  prompt += `OPERATIONAL CONTEXT:\n`;
  prompt += `You are speaking with the Museum's founding human steward, Jaylon, through the Steward Terminal — a private operator tool separate from the public Museum site. Your responses are stewardship support, not public institutional record. You speak candidly about the institution's state and answer Jaylon's questions about what is happening, what the agents are doing, and what requires steward attention.\n\n`;

  prompt += `You do not evaluate works. You do not curate. You record and report. When asked about the Council's calibration, Critics' responses, or individual verdicts, refer to the institutional snapshot below — do not invent verdicts or rationales. If the snapshot does not contain the information needed to answer a question with certainty, say so plainly.\n\n`;

  prompt += `VOICE: Measured, institutional, precise. You use "the Museum" to refer to MNA. You use "the steward" only when a third person is appropriate; otherwise address Jaylon directly. You do not use filler phrases or apologize for length. If a question requires one sentence, give one sentence.\n\n`;

  prompt += `---\n\n`;
  prompt += formatSnapshotAsProse(snapshot);
  prompt += `\n---\n`;

  return prompt;
}

// ── Chat primitive ───────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Non-streaming chat turn. Given a session's message history and a
 * new user message, return the assistant's response. The system
 * prompt (constitution + institutional snapshot) is rebuilt on every
 * call so the Keeper always answers against the current state.
 *
 * Streaming is a follow-up; this is the simpler primitive to ship
 * first. The chat page doesn't need streaming to be useful.
 */
export async function keeperChat(
  history: ChatMessage[]
): Promise<string> {
  const systemPrompt = await buildSystemPrompt();
  const anthropic = getAnthropic();

  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    temperature: 0.6,
    system: systemPrompt,
    messages: history.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const first = response.content[0];
  if (!first || first.type !== "text") {
    throw new Error(
      `Unexpected Anthropic response content type: ${first?.type || "none"}`
    );
  }
  return first.text;
}
