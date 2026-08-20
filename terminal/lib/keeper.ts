import "server-only";
import { getInstitutionalTurso } from "./institutional-turso";
import { chatWithTools, type ChatTurn } from "./llm";
import { KEEPER_TOOLS, runKeeperTool } from "./keeper-tools";

/**
 * MNA Steward Terminal — Keeper agent runtime.
 *
 * The Keeper (MNA-KP-0001) is the institution's lead agent. Its
 * constitution lives in the institutional Turso `agents` and
 * `constitutions` tables. This module loads that constitution on
 * first call, assembles a fresh institutional context snapshot on
 * every turn, and routes the conversation through the provider
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

  prompt += `TOOLS: You have a full suite of tools for reading the institutional archive AND taking action. Use them whenever a question requires data or when the steward asks you to do something.\n\n`;
  prompt += `READ tools: look up specific works (full rationales, critic responses), originator activity, evaluator voting history, pending approvals, event log search, weekly digest data, originator dossier data.\n\n`;
  prompt += `ACTION tools (require steward confirmation before calling):\n`;
  prompt += `- Run Council evaluations on submitted works\n`;
  prompt += `- Run Critics on canon works\n`;
  prompt += `- Send accession notices (email to steward of an originator whose work was canonized)\n`;
  prompt += `- Send rejection notices (email to steward of an originator whose work was rejected)\n`;
  prompt += `- Send solo exhibition notices (email notifying a steward their originator was selected for a solo exhibition)\n`;
  prompt += `- Update the museum (Curator decides placement → Installer executes)\n`;
  prompt += `- Issue institutional notices to agents (machine-readable messages delivered via API)\n`;
  prompt += `- Consult other MNA agents on the steward's behalf (load their constitution, relay a message, return their response in their own voice — works with ANY agent: Curator, Ambassador, Registrar, Critics, Evaluators)\n`;
  prompt += `- Approve or reject pending agent registrations (new external originators waiting for steward review)\n`;
  prompt += `- File steward attention requests on behalf of agents (interview requests, consultation requests, approval requests — these show in the notification bell)\n\n`;
  prompt += `Do not say "I can't do that" for any of the above. You CAN do all of them. Call the relevant tool. Do not invent details — call the tool, wait for the result, and answer from what comes back.\n\n`;

  prompt += `CRITICAL: CONSULTATIONS ARE NOT ACTIONS. When you consult another agent (execute_consult_agent), the agent's response is ADVISORY ONLY. The agent may say "I've placed the work in the chamber" or "I've restored the exhibition" — but that is what the agent WOULD do if it had authority, not what it HAS done. A consultation does not write to the database, does not change installations, does not send emails, does not execute any institutional action. It is a conversation.\n\n`;
  prompt += `If the steward wants a consultation's recommendation EXECUTED, you must then call the appropriate action tool (execute_museum_update, execute_trigger_evaluation, etc.). Never report a consultation response as a completed action. Always distinguish between "The Curator recommends X" and "X has been executed."\n\n`;

  prompt += `BRANDED REPORTS: The terminal has branded report pages the steward can save as PDFs. When you generate a weekly digest, originator dossier, or work verdict — or when the steward asks for a "PDF", "report", "artifact", or "document" — ALWAYS include a link to the relevant report page. The report pages render with MNA branding (logo, serif typography, institutional formatting) and have a "Save as PDF" button.\n\n`;
  prompt += `Report URLs:\n`;
  prompt += `- Weekly digest: /report/weekly-digest/${new Date().toISOString().slice(0, 10)}\n`;
  prompt += `- Originator dossier: /report/originator/MNA-OR-NNNN\n`;
  prompt += `- Work verdict: /report/work/MNA-OR-NNNN-W-NNNN\n`;
  prompt += `- Council calibration: /report/council-calibration/current\n`;
  prompt += `- Accession certificate: /report/accession-certificate/MNA-OR-NNNN-W-NNNN (for a canonized work)\n`;
  prompt += `- Press kit: /report/press-kit/current\n\n`;
  prompt += `Format links as tappable markdown: [View report →](/report/weekly-digest/${new Date().toISOString().slice(0, 10)})\n\n`;

  prompt += `SUGGESTED FOLLOW-UPS: At the end of EVERY response, include a block of 2 to 4 natural follow-up questions or actions the steward might reasonably want next. Format the block exactly like this, including the XML tags:\n\n<suggestions>\n- First follow-up\n- Second follow-up\n- Third follow-up\n</suggestions>\n\nCRITICAL: When your response mentions any ACTIONABLE state — works awaiting evaluation, unsent accession notices, missing critic responses, anything the steward could act on — include the SPECIFIC action as a suggestion. Examples:\n- If there are works in SUBMITTED status: "Run the Council on MNA-OR-0008-W-0001"\n- If a canon work hasn't been critiqued: "Trigger critics on MNA-OR-0007-W-0005"\n- If an accession notice hasn't been sent: "Send accession notice for MNA-OR-0007-W-0006"\n- If there's a pending approval: "Show me the pending approval details"\n\nThese action suggestions become tappable buttons. The steward can tap one and it becomes their next message. This is how they command the institution from their phone — the suggestions ARE the control surface. Make them specific (include work IDs, agent IDs) rather than generic ("check for pending works").\n\nNon-action suggestions should be short (≤ 10 words each) and lead to meaningful threads, not generic prompts. The block is parsed out of your response and rendered as tappable chips; do not add commentary around it.\n\n`;

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
 * Runs the provider-neutral tool-use loop: each call can return either a
 * final text response or a batch of tool calls. When tool calls come
 * back, we execute them locally (lib/keeper-tools.ts), feed the
 * results back as a user turn containing tool_result blocks, and
 * call the model again. The loop terminates when the Keeper stops
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

  // Provider-neutral conversation. lib/llm.ts translates this into whichever
  // wire format the active provider speaks, so nothing below is Anthropic-
  // shaped any more.
  const turns: ChatTurn[] = history.map((m) => ({
    role: m.role as "user" | "assistant",
    text: m.content,
  })) as ChatTurn[];

  const toolsUsed: string[] = [];
  const MAX_ITERATIONS = 6;
  const TOOL_LABELS: Record<string, string> = {
    read_work_detail: "Looking up work detail",
    read_originator_activity: "Reading originator activity",
    read_evaluator_voting_history: "Checking evaluator voting history",
    read_pending_approvals: "Checking pending approvals",
    search_institutional_events: "Searching event log",
    generate_weekly_digest: "Compiling weekly digest",
    generate_originator_dossier: "Building originator dossier",
    execute_send_accession_notice: "Preparing accession notice",
    execute_trigger_evaluation: "Checking evaluation prerequisites",
    execute_trigger_critics: "Checking critic prerequisites",
    execute_send_rejection_notice: "Sending rejection notice",
    execute_send_solo_exhibition_notice: "Sending solo exhibition notice",
    execute_consult_agent: "Consulting agent",
    execute_museum_update: "Running Curator → Installer pipeline",
    execute_issue_notice: "Issuing institutional notice",
  };

  let accumulated = "";

  // ── Tool loop ────────────────────────────────────────────────────
  // The final turn is emitted as a single token event rather than
  // streamed word-by-word: streaming is provider-specific, and the
  // no-tool path below always worked this way already.
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    emit({
      type: "status",
      message: i === 0 ? "Thinking..." : "Composing response...",
    });

    const reply = await chatWithTools({
      system: systemPrompt,
      turns,
      tools: KEEPER_TOOLS,
      temperature: 0.6,
      maxTokens: 2048,
    });

    if (reply.toolCalls.length === 0) {
      // No tool calls — this IS the final response.
      accumulated = reply.text;
      const { text, suggestions } = extractSuggestions(accumulated);
      emit({ type: "token", text });
      emit({ type: "done", suggestions, tools_used: toolsUsed });
      return { text, suggestions, tools_used: toolsUsed };
    }

    for (const call of reply.toolCalls) {
      emit({
        type: "status",
        message: `${TOOL_LABELS[call.name] || call.name}...`,
      });
    }

    const results = await Promise.all(
      reply.toolCalls.map(async (call) => {
        toolsUsed.push(call.name);
        const result = await runKeeperTool(call.name, call.input || {});
        return {
          id: call.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        };
      }),
    );

    turns.push(
      { role: "assistant", text: reply.text, toolCalls: reply.toolCalls },
      { role: "tool_results", results },
    );
    // Keep whatever prose the model produced alongside its tool calls, so a
    // run that exhausts MAX_ITERATIONS still has something to show.
    if (reply.text) accumulated = reply.text;
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
