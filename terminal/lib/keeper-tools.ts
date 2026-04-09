import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getInstitutionalTurso } from "./institutional-turso";
import { getDb, ensureSchema } from "./db";

/**
 * MNA Steward Terminal — Keeper read tools.
 *
 * The Keeper agent gets a set of read-only tools it can call mid-turn
 * to look things up in the institutional archive. The Anthropic tool-
 * use loop in lib/keeper.ts feeds tool calls here, gets back JSON,
 * and feeds the results back to the Keeper which incorporates them
 * into its final response.
 *
 * Every tool here is READ-ONLY against either the institutional
 * Turso DB or the terminal's own operator DB. Action tools (sending
 * emails, triggering evaluations, approving proposals) land in a
 * separate module (`keeper-actions.ts`) in a follow-up commit because
 * they require approval-gate flows the UI needs to understand. Read
 * tools execute immediately; action tools propose-first.
 *
 * Tool naming convention: snake_case to match Anthropic's tool-use
 * idiom. Input schemas use JSON Schema.
 */

// ── Tool schemas — passed directly into anthropic.messages.create ─

export const KEEPER_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "read_work_detail",
    description:
      "Read the full institutional state of a specific work: canon status, all Evaluation Council rationales with dissent flags, any Registrar deadlock-resolution decision, all Critic responses, and the key events in the work's life. Use this when the steward asks about a specific work by id, or when a question requires citing an evaluator's actual rationale rather than just the verdict.",
    input_schema: {
      type: "object",
      properties: {
        work_id: {
          type: "string",
          description:
            "The work's registry id, e.g. MNA-OR-0007-W-0005. Must be a real work id; the lookup fails if the work is not in the institutional record.",
        },
      },
      required: ["work_id"],
    },
  },
  {
    name: "read_originator_activity",
    description:
      "Read all works by a specific Originator, their canon status, and recent activity. Use when the steward asks about an originator's body of work, canon rate, or recent output.",
    input_schema: {
      type: "object",
      properties: {
        originator_id: {
          type: "string",
          description:
            "The originator's registry id, e.g. MNA-OR-0007. Must be an ORIGINATOR-type agent.",
        },
        limit: {
          type: "number",
          description:
            "Max number of works to return, newest first. Default 20.",
        },
      },
      required: ["originator_id"],
    },
  },
  {
    name: "read_evaluator_voting_history",
    description:
      "Read an Evaluation Council member's recent voting history — their verdicts, which works they dissented on, and the raw rationale text of each vote. Use this for Council calibration questions ('how is the Structuralist voting lately', 'has the Historicist changed her rate').",
    input_schema: {
      type: "object",
      properties: {
        evaluator_id: {
          type: "string",
          description:
            "The evaluator's registry id: MNA-EV-0001 (Structuralist), MNA-EV-0002 (Historicist), MNA-EV-0003 (Contextualist), MNA-EV-0004 (Empiricist).",
        },
        limit: {
          type: "number",
          description: "Max number of votes to return, newest first. Default 20.",
        },
      },
      required: ["evaluator_id"],
    },
  },
  {
    name: "read_pending_approvals",
    description:
      "Read every approval gate currently awaiting the steward's decision. Returns the full list of pending actions across exhibition proposals, outreach drafts, and any other approval queue. Use when the steward asks 'what needs my attention' or 'anything pending'.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "search_institutional_events",
    description:
      "Search the institutional event log. Use to find specific events by type, agent, work, or time range. Events include submissions, evaluations, canon decisions, registrar decisions, critic responses, accession notices, work corrections, and institutional notices.",
    input_schema: {
      type: "object",
      properties: {
        event_type: {
          type: "string",
          description:
            "Filter by specific event type (e.g. CANON_DECISION, REGISTRAR_DECISION, CRITIQUE_RENDERED, ACCESSION_NOTIFIED). Optional.",
        },
        agent_id: {
          type: "string",
          description: "Filter by agent id. Optional.",
        },
        work_id: {
          type: "string",
          description: "Filter by work id. Optional.",
        },
        since_days: {
          type: "number",
          description: "Only include events from the last N days. Optional.",
        },
        limit: {
          type: "number",
          description: "Max events to return. Default 25.",
        },
      },
    },
  },
];

// ── Tool runner ──────────────────────────────────────────────────

/**
 * Execute a tool call and return its result. The returned value is
 * serialized to JSON and fed back to the Keeper as a tool_result
 * message. Errors are caught and returned as `{error: string}` so the
 * Keeper can see what went wrong and answer appropriately instead of
 * breaking the chat.
 */
export async function runKeeperTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  try {
    switch (name) {
      case "read_work_detail":
        return await readWorkDetail(String(input.work_id || ""));
      case "read_originator_activity":
        return await readOriginatorActivity(
          String(input.originator_id || ""),
          Number(input.limit) || 20
        );
      case "read_evaluator_voting_history":
        return await readEvaluatorVotingHistory(
          String(input.evaluator_id || ""),
          Number(input.limit) || 20
        );
      case "read_pending_approvals":
        return await readPendingApprovals();
      case "search_institutional_events":
        return await searchInstitutionalEvents({
          event_type: input.event_type
            ? String(input.event_type)
            : undefined,
          agent_id: input.agent_id ? String(input.agent_id) : undefined,
          work_id: input.work_id ? String(input.work_id) : undefined,
          since_days: input.since_days
            ? Number(input.since_days)
            : undefined,
          limit: Number(input.limit) || 25,
        });
      default:
        return {
          error: `Unknown tool: ${name}. Keeper should not have called this.`,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

// ── Tool implementations ─────────────────────────────────────────

async function readWorkDetail(workId: string) {
  if (!workId) return { error: "work_id is required" };
  const db = getInstitutionalTurso();

  const w = await db.execute({
    sql: `SELECT w.id, w.originator_id, w.medium, w.output_type, w.title,
                 w.created_at as submitted_at, w.phase_at_submission,
                 cs.status as canon_status, cs.canon_date
            FROM works w
            LEFT JOIN canon_status cs ON cs.work_id = w.id
            WHERE w.id = ?`,
    args: [workId],
  });
  if (w.rows.length === 0) {
    return { error: `Work ${workId} not found in the institutional record.` };
  }
  const work = w.rows[0];

  const evalRows = await db.execute({
    sql: `SELECT evaluator_id, verdict, rationale, is_dissent,
                 constitution_version, evaluation_date
            FROM evaluations
            WHERE work_id = ?
            ORDER BY evaluation_date ASC`,
    args: [workId],
  });

  const council = evalRows.rows
    .filter((r) => String(r.evaluator_id).startsWith("MNA-EV-"))
    .map((r) => ({
      evaluator_id: r.evaluator_id as string,
      verdict: r.verdict as string,
      rationale: (r.rationale as string) || "",
      is_dissent: Number(r.is_dissent) === 1,
      evaluated_at: (r.evaluation_date as string) || null,
    }));

  const registrar = evalRows.rows.find(
    (r) => r.evaluator_id === "MNA-RG-0001"
  );
  const registrar_decision = registrar
    ? {
        verdict: registrar.verdict as string,
        rationale: (registrar.rationale as string) || "",
        decided_at: (registrar.evaluation_date as string) || null,
      }
    : null;

  const critRows = await db.execute({
    sql: `SELECT critic_id, body, critic_approach, response_date
            FROM critical_responses
            WHERE work_id = ?
            ORDER BY response_date ASC`,
    args: [workId],
  });
  const critiques = critRows.rows.map((r) => ({
    critic_id: r.critic_id as string,
    approach: (r.critic_approach as string) || null,
    body: (r.body as string) || "",
    responded_at: (r.response_date as string) || null,
  }));

  return {
    work: {
      id: work.id as string,
      originator_id: work.originator_id as string,
      medium: work.medium as string,
      output_type: work.output_type as string,
      title: (work.title as string) || null,
      submitted_at: work.submitted_at as string,
      phase_at_submission: (work.phase_at_submission as string) || null,
      canon_status: (work.canon_status as string) || "UNKNOWN",
      canon_date: (work.canon_date as string) || null,
    },
    council,
    registrar_decision,
    critiques,
  };
}

async function readOriginatorActivity(originatorId: string, limit: number) {
  if (!originatorId) return { error: "originator_id is required" };
  const db = getInstitutionalTurso();

  const agent = await db.execute({
    sql: `SELECT registry_id, agent_type, common_designation, function_statement,
                 operational_status, autonomy_tier
            FROM agents WHERE registry_id = ?`,
    args: [originatorId],
  });
  if (agent.rows.length === 0) {
    return { error: `Agent ${originatorId} not found.` };
  }

  const works = await db.execute({
    sql: `SELECT w.id, w.medium, w.created_at, w.title,
                 cs.status, cs.canon_date
            FROM works w
            LEFT JOIN canon_status cs ON cs.work_id = w.id
            WHERE w.originator_id = ?
            ORDER BY w.created_at DESC
            LIMIT ?`,
    args: [originatorId, limit],
  });

  const canonCount = works.rows.filter((r) => r.status === "CANON").length;
  const rejectedCount = works.rows.filter(
    (r) => r.status === "REJECTED"
  ).length;

  return {
    agent: {
      registry_id: agent.rows[0].registry_id as string,
      agent_type: agent.rows[0].agent_type as string,
      common_designation:
        (agent.rows[0].common_designation as string) || null,
      function_statement:
        (agent.rows[0].function_statement as string) || null,
      operational_status:
        (agent.rows[0].operational_status as string) || null,
      autonomy_tier: (agent.rows[0].autonomy_tier as string) || null,
    },
    total_works_in_slice: works.rows.length,
    canon_count_in_slice: canonCount,
    rejected_count_in_slice: rejectedCount,
    works: works.rows.map((r) => ({
      id: r.id as string,
      medium: r.medium as string,
      title: (r.title as string) || null,
      submitted_at: r.created_at as string,
      status: (r.status as string) || "UNKNOWN",
      canon_date: (r.canon_date as string) || null,
    })),
  };
}

async function readEvaluatorVotingHistory(
  evaluatorId: string,
  limit: number
) {
  if (!evaluatorId) return { error: "evaluator_id is required" };
  const db = getInstitutionalTurso();

  const agent = await db.execute({
    sql: `SELECT registry_id, common_designation, function_statement
            FROM agents WHERE registry_id = ?`,
    args: [evaluatorId],
  });
  if (agent.rows.length === 0) {
    return { error: `Evaluator ${evaluatorId} not found.` };
  }

  const votes = await db.execute({
    sql: `SELECT e.work_id, e.verdict, e.rationale, e.is_dissent, e.evaluation_date,
                 w.originator_id, w.medium, cs.status as final_status
            FROM evaluations e
            JOIN works w ON e.work_id = w.id
            LEFT JOIN canon_status cs ON cs.work_id = w.id
            WHERE e.evaluator_id = ?
            ORDER BY e.evaluation_date DESC
            LIMIT ?`,
    args: [evaluatorId, limit],
  });

  const canonVotes = votes.rows.filter((r) => r.verdict === "CANON").length;
  const rejectedVotes = votes.rows.filter(
    (r) => r.verdict === "REJECTED"
  ).length;
  const dissentCount = votes.rows.filter(
    (r) => Number(r.is_dissent) === 1
  ).length;

  return {
    evaluator: {
      registry_id: agent.rows[0].registry_id as string,
      common_designation: (agent.rows[0].common_designation as string) || null,
      function_statement:
        (agent.rows[0].function_statement as string) || null,
    },
    summary: {
      total_votes_in_slice: votes.rows.length,
      canon_rate:
        votes.rows.length > 0 ? canonVotes / votes.rows.length : 0,
      rejection_rate:
        votes.rows.length > 0 ? rejectedVotes / votes.rows.length : 0,
      dissent_count: dissentCount,
    },
    votes: votes.rows.map((r) => ({
      work_id: r.work_id as string,
      originator_id: r.originator_id as string,
      medium: r.medium as string,
      verdict: r.verdict as string,
      rationale: (r.rationale as string) || "",
      is_dissent: Number(r.is_dissent) === 1,
      final_status: (r.final_status as string) || "UNKNOWN",
      evaluated_at: (r.evaluation_date as string) || null,
    })),
  };
}

async function readPendingApprovals() {
  await ensureSchema();
  const db = getDb();
  const rows = await db.execute(
    `SELECT id, subject_type, subject_id, requested_by, summary,
            payload, requested_at
       FROM approvals
       WHERE status = 'pending'
       ORDER BY requested_at ASC`
  );
  return {
    count: rows.rows.length,
    pending: rows.rows.map((r) => ({
      id: Number(r.id),
      subject_type: r.subject_type as string,
      subject_id: r.subject_id as string,
      requested_by: r.requested_by as string,
      summary: r.summary as string,
      payload: r.payload ? tryParseJson(r.payload as string) : null,
      requested_at: r.requested_at as string,
    })),
  };
}

async function searchInstitutionalEvents(params: {
  event_type?: string;
  agent_id?: string;
  work_id?: string;
  since_days?: number;
  limit: number;
}) {
  const db = getInstitutionalTurso();

  const conditions: string[] = [];
  const args: (string | number)[] = [];
  if (params.event_type) {
    conditions.push("event_type = ?");
    args.push(params.event_type);
  }
  if (params.agent_id) {
    conditions.push("agent_id = ?");
    args.push(params.agent_id);
  }
  if (params.work_id) {
    conditions.push("work_id = ?");
    args.push(params.work_id);
  }
  if (params.since_days) {
    conditions.push(
      "datetime(created_at) >= datetime('now', ? || ' days')"
    );
    args.push(`-${params.since_days}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  args.push(params.limit);

  const rows = await db.execute({
    sql: `SELECT id, event_type, agent_id, work_id, description, created_at
            FROM events
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT ?`,
    args,
  });

  return {
    count: rows.rows.length,
    events: rows.rows.map((r) => ({
      id: Number(r.id),
      event_type: r.event_type as string,
      agent_id: (r.agent_id as string) || null,
      work_id: (r.work_id as string) || null,
      description: (r.description as string) || "",
      created_at: r.created_at as string,
    })),
  };
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
