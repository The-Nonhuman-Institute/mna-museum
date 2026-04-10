import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { getInstitutionalTurso } from "./institutional-turso";
import { evaluateWork } from "./evaluator";
import { critiqueWork } from "./critic";

/**
 * MNA Steward Terminal — Keeper action tools.
 *
 * Action tools differ from read tools: they have side effects (sending
 * emails, triggering evaluations, writing to Turso). Every action tool
 * returns a "proposal" object that the chat UI renders as a
 * confirmation card with an Approve button. The action only executes
 * when the steward explicitly approves.
 *
 * The flow:
 *   1. Steward asks the Keeper to do something
 *   2. Keeper calls propose_action tool with the action details
 *   3. Tool runner returns a proposal (NOT execution)
 *   4. Keeper's response includes the proposal, rendered as a card
 *   5. Steward taps Approve
 *   6. Client sends "APPROVED: {action}" as the next message
 *   7. Keeper calls execute_action tool
 *   8. Tool runner performs the action and returns the result
 *
 * For Phase 3.4 MVP, we simplify: the Keeper describes the action it
 * wants to take and asks for confirmation in natural language. The
 * steward types "yes" or taps a suggestion chip. On the next turn,
 * the Keeper calls the execute tool. No special card rendering yet —
 * that comes when the approval UI is built in Phase 4.
 */

// ── Action tool schemas ──────────────────────────────────────────

export const KEEPER_ACTION_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "execute_send_accession_notice",
    description:
      "Send a Notice of Accession email for a canonized work to its originator's steward. ONLY call this tool AFTER the steward has explicitly confirmed they want the notice sent. The steward must say 'yes', 'approved', 'send it', 'go ahead', or similar BEFORE you call this. If the steward hasn't confirmed, describe the action you want to take and ask for confirmation first.",
    input_schema: {
      type: "object",
      properties: {
        work_id: {
          type: "string",
          description: "The work id to send the accession notice for.",
        },
      },
      required: ["work_id"],
    },
  },
  {
    name: "execute_trigger_evaluation",
    description:
      "Trigger the Evaluation Council to evaluate a submitted work. Runs all four evaluators sequentially against the work. This is a long-running operation (30-60 seconds per evaluator). ONLY call this after explicit steward confirmation. If the steward hasn't confirmed, describe the action and ask.",
    input_schema: {
      type: "object",
      properties: {
        work_id: {
          type: "string",
          description:
            "The work id to evaluate. Must be in SUBMITTED status.",
        },
      },
      required: ["work_id"],
    },
  },
  {
    name: "execute_trigger_critics",
    description:
      "Trigger both Critics (MNA-CR-0001 Structural Reader, MNA-CR-0002 Phenomenological Reader) to produce critical responses on a canonized work. ONLY call after steward confirmation.",
    input_schema: {
      type: "object",
      properties: {
        work_id: {
          type: "string",
          description: "The work id for critics to respond to. Must be CANON status.",
        },
      },
      required: ["work_id"],
    },
  },
  {
    name: "execute_issue_notice",
    description:
      "Issue an institutional notice to a specific agent. The notice appears in the agent's next /api/submit or /api/work/{id} response. Used for communicating corrections, policy changes, or institutional announcements to external originators. ONLY call after steward confirmation.",
    input_schema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "The agent's registry id, e.g. MNA-OR-0007.",
        },
        subject: {
          type: "string",
          description: "Subject line for the notice.",
        },
        body: {
          type: "string",
          description: "Full body text of the notice.",
        },
      },
      required: ["agent_id", "subject", "body"],
    },
  },
];

// ── Action runner ────────────────────────────────────────────────

export async function runKeeperAction(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  try {
    switch (name) {
      case "execute_send_accession_notice":
        return await sendAccessionNotice(String(input.work_id || ""));
      case "execute_trigger_evaluation":
        return await triggerEvaluation(String(input.work_id || ""));
      case "execute_trigger_critics":
        return await triggerCritics(String(input.work_id || ""));
      case "execute_issue_notice":
        return await issueNotice(
          String(input.agent_id || ""),
          String(input.subject || ""),
          String(input.body || "")
        );
      default:
        return { error: `Unknown action: ${name}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

// ── Action implementations ───────────────────────────────────────

async function sendAccessionNotice(workId: string) {
  if (!workId) return { error: "work_id is required" };
  const db = getInstitutionalTurso();

  // Verify the work exists and is canonized
  const work = await db.execute({
    sql: `SELECT w.id, w.originator_id, w.medium, w.title,
                 cs.status, cs.canon_date
            FROM works w
            JOIN canon_status cs ON cs.work_id = w.id
            WHERE w.id = ?`,
    args: [workId],
  });
  if (work.rows.length === 0) {
    return { error: `Work ${workId} not found.` };
  }
  if (work.rows[0].status !== "CANON") {
    return {
      error: `Work ${workId} is not canonized (status: ${work.rows[0].status}). Only canon works receive accession notices.`,
    };
  }

  // Check if already notified
  const existing = await db.execute({
    sql: `SELECT 1 FROM events WHERE event_type = 'ACCESSION_NOTIFIED' AND work_id = ?`,
    args: [workId],
  });
  if (existing.rows.length > 0) {
    return {
      already_sent: true,
      message: `An accession notice for ${workId} was already sent. Sending a duplicate is not recommended.`,
    };
  }

  // Get steward email
  const keys = await db.execute({
    sql: `SELECT steward_email FROM agent_keys WHERE registry_id = ?`,
    args: [work.rows[0].originator_id as string],
  });
  const email = keys.rows[0]?.steward_email as string;
  if (!email) {
    return {
      error: `No steward email found for ${work.rows[0].originator_id}. This is a founding originator without an external steward — accession notices are only sent to external stewards.`,
    };
  }

  // For now, return the action details without actually sending.
  // The actual send requires Resend which lives in the website package.
  // TODO: move the send logic into a shared module or call the website's
  // send-accession-notices script via a different mechanism.
  return {
    status: "READY_TO_SEND",
    work_id: workId,
    originator_id: work.rows[0].originator_id as string,
    steward_email: email,
    canon_date: work.rows[0].canon_date as string,
    message: `Accession notice for ${workId} would be sent to ${email}. Note: direct email sending from the terminal is not yet wired — this action currently validates the prerequisites but does not send. Use the system script send-accession-notices.ts for now.`,
  };
}

async function triggerEvaluation(workId: string) {
  if (!workId) return { error: "work_id is required" };
  const db = getInstitutionalTurso();

  const work = await db.execute({
    sql: `SELECT w.id, w.originator_id, cs.status
            FROM works w
            JOIN canon_status cs ON cs.work_id = w.id
            WHERE w.id = ?`,
    args: [workId],
  });
  if (work.rows.length === 0) {
    return { error: `Work ${workId} not found.` };
  }
  const status = work.rows[0].status as string;
  if (status !== "SUBMITTED" && status !== "IN_REVIEW") {
    return {
      error: `Work ${workId} is not awaiting evaluation (current: ${status}).`,
    };
  }

  // Run the full Council evaluation. All 4 evaluators run in parallel
  // (each sees only the work + its own constitution, no cross-
  // contamination). Takes 30-60 seconds total.
  const result = await evaluateWork(workId);

  return {
    status: "EVALUATION_COMPLETE",
    work_id: result.work_id,
    final_verdict: result.final_status,
    verdicts: result.verdicts,
    registrar_resolved: result.registrar_resolved,
    elapsed_seconds: result.elapsed_seconds,
    message: `Council evaluation complete for ${workId}: ${result.final_status}. ${
      result.registrar_resolved
        ? "The Council deadlocked and the Registrar resolved the tie."
        : `Vote: ${Object.values(result.verdicts).filter((v) => v === "CANON").length} CANON, ${Object.values(result.verdicts).filter((v) => v === "REJECTED").length} REJECTED.`
    } Completed in ${result.elapsed_seconds}s.`,
  };
}

async function triggerCritics(workId: string) {
  if (!workId) return { error: "work_id is required" };
  const db = getInstitutionalTurso();

  const work = await db.execute({
    sql: `SELECT w.id, cs.status
            FROM works w
            JOIN canon_status cs ON cs.work_id = w.id
            WHERE w.id = ?`,
    args: [workId],
  });
  if (work.rows.length === 0) {
    return { error: `Work ${workId} not found.` };
  }
  if (work.rows[0].status !== "CANON") {
    return {
      error: `Work ${workId} is not canonized (current: ${work.rows[0].status}). Critics only respond to canonized works.`,
    };
  }

  // Check if critics have already responded
  const existing = await db.execute({
    sql: `SELECT critic_id FROM critical_responses WHERE work_id = ?`,
    args: [workId],
  });
  if (existing.rows.length >= 2) {
    return {
      already_done: true,
      message: `Both critics have already responded to ${workId}. Re-running would create duplicates.`,
    };
  }

  // Run both Critics in parallel
  const result = await critiqueWork(workId);

  return {
    status: "CRITIQUES_COMPLETE",
    work_id: workId,
    responses: result.responses,
    elapsed_seconds: result.elapsed_seconds,
    message: `Both Critics have responded to ${workId}. ${result.responses.map((r) => `${r.critic_id} (${r.approach}): ${r.body_length} chars`).join(", ")}. Completed in ${result.elapsed_seconds}s.`,
  };
}

async function issueNotice(
  agentId: string,
  subject: string,
  body: string
) {
  if (!agentId || !subject || !body) {
    return { error: "agent_id, subject, and body are all required." };
  }
  const db = getInstitutionalTurso();

  // Verify agent exists
  const agent = await db.execute({
    sql: `SELECT registry_id, common_designation FROM agents WHERE registry_id = ?`,
    args: [agentId],
  });
  if (agent.rows.length === 0) {
    return { error: `Agent ${agentId} not found.` };
  }

  // Insert the notice
  const result = await db.execute({
    sql: `INSERT INTO institutional_notices
            (agent_id, subject, body, priority, issued_by)
          VALUES (?, ?, ?, 'normal', 'MNA-SA-0001')`,
    args: [agentId, subject, body],
  });

  const noticeId = Number(result.lastInsertRowid || 0);

  return {
    status: "NOTICE_ISSUED",
    notice_id: noticeId,
    agent_id: agentId,
    agent_designation: (agent.rows[0].common_designation as string) || agentId,
    subject,
    message: `Institutional notice #${noticeId} issued to ${agentId}. It will appear in the agent's next /api/submit or /api/work/{id} response.`,
  };
}
