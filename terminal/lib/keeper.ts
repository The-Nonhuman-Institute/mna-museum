import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getInstitutionalTurso } from "./institutional-turso";
import { KEEPER_TOOLS, runKeeperTool } from "./keeper-tools";

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

  prompt += `TOOLS: You have read-only access to the institutional archive via a small set of tools. Use them whenever a question requires specific data you don't already have in the snapshot below — a particular work's full rationales, an evaluator's recent voting history, the pending approval queue, or a search of the event log. Do not invent details. Call the relevant tool, wait for the result, and answer from what comes back.\n\n`;

  prompt += `SUGGESTED FOLLOW-UPS: At the end of EVERY response, include a block of 2 to 3 natural follow-up questions the steward might reasonably ask next. Format the block exactly like this, including the XML tags:\n\n<suggestions>\n- First follow-up question\n- Second follow-up question\n- Third follow-up question\n</suggestions>\n\nThe suggestions should be short (≤ 10 words each), phrased as the steward would type them, and should lead to meaningful threads — not generic prompts. The block is parsed out of your response and rendered as tappable chips; do not add commentary around it. If the conversation has reached a natural endpoint and no follow-up is obvious, include one suggestion that offers to switch topics.\n\n`;

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

export interface KeeperReply {
  /** The assistant's visible response, with the <suggestions> block
   *  already stripped out. */
  text: string;
  /** Parsed follow-up suggestions the UI renders as tappable chips. */
  suggestions: string[];
  /** Names of tools the Keeper called during this turn. Useful for
   *  the chat UI to show "looked up MNA-OR-0007-W-0005" breadcrumbs. */
  tools_used: string[];
}

/**
 * Non-streaming chat turn with tool-use support.
 *
 * Runs the Anthropic tool-use loop: each call can return either a
 * final text response or a batch of tool calls. When tool calls come
 * back, we execute them locally (lib/keeper-tools.ts), feed the
 * results back as a user turn containing tool_result blocks, and
 * call Anthropic again. The loop terminates when the Keeper stops
 * requesting tools (stop_reason === "end_turn") or hits a safety
 * cap on iterations.
 *
 * The final assistant text is parsed for a `<suggestions>` XML block
 * which the UI renders as follow-up chips. The suggestions block is
 * stripped from the visible text.
 *
 * Streaming is still a follow-up; this keeps the request/response
 * contract simple while adding depth through tool calls. On a cold
 * Vercel serverless function, tool-calling turns can take 5–15
 * seconds total (two or three Claude round-trips plus tool executions),
 * which is why the UI shows a typing indicator.
 */
/**
 * Callback for streaming events to the client. The route handler
 * wires this to the SSE writer so the client sees progress.
 */
export type StreamEvent =
  | { type: "status"; message: string }
  | { type: "token"; text: string }
  | { type: "done"; suggestions: string[]; tools_used: string[] }
  | { type: "error"; message: string };

/**
 * Streaming chat turn with tool-use support.
 *
 * Runs the tool loop non-streamed (sending "status" events for each
 * tool call so the client shows "Looking up..."). The FINAL Claude
 * call is streamed token-by-token via the `stream()` helper so the
 * response appears word-by-word. Returns the full accumulated text
 * for persistence.
 */
export async function keeperChatStreaming(
  history: ChatMessage[],
  emit: (event: StreamEvent) => void
): Promise<KeeperReply> {
  const systemPrompt = await buildSystemPrompt();
  const anthropic = getAnthropic();

  const messages: Anthropic.Messages.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolsUsed: string[] = [];
  const MAX_ITERATIONS = 6;
  const TOOL_LABELS: Record<string, string> = {
    read_work_detail: "Looking up work detail",
    read_originator_activity: "Reading originator activity",
    read_evaluator_voting_history: "Checking evaluator voting history",
    read_pending_approvals: "Checking pending approvals",
    search_institutional_events: "Searching event log",
  };

  // ── Tool loop (non-streamed) ─────────────────────────────────────
  for (let i = 0; i < MAX_ITERATIONS - 1; i++) {
    emit({ type: "status", message: "Thinking..." });

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 2048,
      temperature: 0.6,
      system: systemPrompt,
      tools: KEEPER_TOOLS,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      // No tool calls — this IS the final response.
      // Extract text and return immediately (no streaming needed for
      // a non-tool response because it's already complete).
      const rawText = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n\n");
      const { text, suggestions } = extractSuggestions(rawText);
      // Emit the full text as one token event for consistency
      emit({ type: "token", text });
      emit({ type: "done", suggestions, tools_used: toolsUsed });
      return { text, suggestions, tools_used: toolsUsed };
    }

    // Execute tool calls
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );
    for (const block of toolUseBlocks) {
      const label = TOOL_LABELS[block.name] || block.name;
      emit({ type: "status", message: `${label}...` });
    }

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block) => {
        toolsUsed.push(block.name);
        const input = (block.input as Record<string, unknown>) || {};
        const result = await runKeeperTool(block.name, input);
        const content =
          typeof result === "string" ? result : JSON.stringify(result);
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content,
        };
      })
    );

    messages.push(
      { role: "assistant", content: response.content },
      { role: "user", content: toolResults }
    );
  }

  // ── Final call (streamed) ────────────────────────────────────────
  emit({ type: "status", message: "Composing response..." });

  const stream = anthropic.messages.stream({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    temperature: 0.6,
    system: systemPrompt,
    tools: KEEPER_TOOLS,
    messages,
  });

  let accumulated = "";

  stream.on("text", (text) => {
    accumulated += text;
    emit({ type: "token", text });
  });

  const finalMessage = await stream.finalMessage();

  // If the streamed response ALSO called tools (shouldn't happen
  // after MAX_ITERATIONS-1 non-streamed rounds, but defensive), fall
  // back to the accumulated text so far.
  if (finalMessage.stop_reason === "tool_use") {
    // Extract whatever text was in the response
    const textBlocks = finalMessage.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text");
    if (textBlocks.length > 0) {
      accumulated = textBlocks.map((b) => b.text).join("\n\n");
    }
  }

  const { text, suggestions } = extractSuggestions(accumulated);
  emit({ type: "done", suggestions, tools_used: toolsUsed });
  return { text, suggestions, tools_used: toolsUsed };
}

/**
 * Non-streaming fallback — same tool loop, returns the complete
 * result in one shot with all events discarded. Used by tests or
 * any code path that doesn't need SSE.
 */
export async function keeperChat(
  history: ChatMessage[]
): Promise<KeeperReply> {
  return keeperChatStreaming(history, () => {});
}

/**
 * Parse a Keeper response for its `<suggestions>` XML block. The
 * system prompt instructs the Keeper to end every response with a
 * block of 2–3 dashed follow-ups inside <suggestions> tags. This
 * function strips that block from the visible text and returns the
 * parsed list.
 *
 * Defensive: tolerates missing blocks, empty blocks, blocks with
 * leading dashes or bullets, and extra whitespace.
 */
function extractSuggestions(raw: string): {
  text: string;
  suggestions: string[];
} {
  const match = raw.match(/<suggestions>([\s\S]*?)<\/suggestions>/i);
  if (!match) {
    return { text: raw.trim(), suggestions: [] };
  }
  const inner = match[1];
  const suggestions = inner
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^[-*•]\s*/, "")
        .replace(/^\d+\.\s*/, "")
        .trim()
    )
    .filter((s) => s.length > 0 && s.length <= 120)
    .slice(0, 4);
  const text = raw.replace(/<suggestions>[\s\S]*?<\/suggestions>/i, "").trim();
  return { text, suggestions };
}
