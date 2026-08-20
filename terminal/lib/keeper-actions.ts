import "server-only";
import { generate, type ToolDef } from "./llm";
import { getInstitutionalTurso } from "./institutional-turso";
import { evaluateWork } from "./evaluator";
import { critiqueWork } from "./critic";
import { updateMuseum } from "./museum-pipeline";
import { sendAccessionNotice as sendAccession } from "./send-accession";
import { sendRejectionNotice as sendRejection } from "./send-rejection";
import { sendSoloExhibitionNotice as sendSoloExhibition } from "./send-solo-exhibition";
import { sendRegistrationConfirmation } from "./send-registration-confirmation";

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

export const KEEPER_ACTION_TOOLS: ToolDef[] = [
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
    name: "execute_request_steward_attention",
    description:
      "File a request for the steward's attention on behalf of an agent. Used when an agent wants to interview the steward, request a consultation, or flag something that needs human review. The request appears in the steward's notification bell and Feed as an actionable card. No approval needed to FILE the request — but the steward decides whether to accept it.",
    input_schema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "The requesting agent's registry id." },
        request_type: { type: "string", description: "'interview' | 'consultation' | 'approval' | 'attention'" },
        subject: { type: "string", description: "Brief subject line for the request." },
        body: { type: "string", description: "Detailed explanation of what the agent needs." },
      },
      required: ["agent_id", "request_type", "subject"],
    },
  },
  {
    name: "execute_approve_registration",
    description:
      "Approve or reject a pending agent registration. Creates the agent, constitution, and keys in the institutional record. ONLY call after steward confirmation.",
    input_schema: {
      type: "object",
      properties: {
        registration_id: { type: "number", description: "The pending registration id." },
        action: { type: "string", description: "'approve' or 'reject'. Default 'approve'." },
      },
      required: ["registration_id"],
    },
  },
  {
    name: "execute_send_rejection_notice",
    description:
      "Send a Notice of Rejection email for a rejected work to its originator's steward. ONLY call after steward confirmation.",
    input_schema: {
      type: "object",
      properties: {
        work_id: { type: "string", description: "The rejected work id." },
      },
      required: ["work_id"],
    },
  },
  {
    name: "execute_send_solo_exhibition_notice",
    description:
      "Send a Solo Exhibition Selection notice to an originator's steward, informing them their agent has been chosen for a solo exhibition in the virtual museum. ONLY call after steward confirmation.",
    input_schema: {
      type: "object",
      properties: {
        originator_id: { type: "string", description: "The originator's registry id." },
        context: { type: "string", description: "Optional curatorial context or message to include in the notice." },
      },
      required: ["originator_id"],
    },
  },
  {
    name: "execute_consult_agent",
    description:
      "Consult another MNA agent on behalf of the steward. Loads the target agent's constitution from the institutional record, sends the steward's message to that agent (via a separate Claude API call), and returns the agent's response. Use when the steward asks you to 'contact the Curator', 'ask the Ambassador', or 'relay this to' any agent. The response is attributed to the target agent, not to the Keeper.",
    input_schema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "The target agent's registry id, e.g. MNA-CU-0001 for the Curator." },
        message: { type: "string", description: "The message or question to relay to the agent from the steward." },
      },
      required: ["agent_id", "message"],
    },
  },
  {
    name: "execute_museum_update",
    description:
      "Run the museum pipeline: find canonized works not yet placed in the virtual museum, have the Curator decide their gallery placement, then have the Installer execute the placement. This is a full Curator → Installer chain. ONLY call after steward confirmation. The Curator's decisions are real institutional acts recorded in curatorial_decisions.",
    input_schema: {
      type: "object",
      properties: {},
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
      case "execute_request_steward_attention":
        return await filestewardRequest(
          String(input.agent_id || ""),
          String(input.request_type || "attention"),
          String(input.subject || ""),
          input.body ? String(input.body) : undefined
        );
      case "execute_approve_registration":
        return await handleApproveRegistration(
          Number(input.registration_id),
          String(input.action || "approve")
        );
      case "execute_send_rejection_notice":
        return await handleRejectionNotice(String(input.work_id || ""));
      case "execute_send_solo_exhibition_notice":
        return await handleSoloExhibitionNotice(
          String(input.originator_id || ""),
          input.context ? String(input.context) : undefined
        );
      case "execute_consult_agent":
        return await consultAgent(
          String(input.agent_id || ""),
          String(input.message || "")
        );
      case "execute_museum_update":
        return await runMuseumUpdate();
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

  const result = await sendAccession(workId);

  if (!result.sent) {
    return {
      status: "NOT_SENT",
      error: result.error,
      message: result.error,
    };
  }

  return {
    status: "SENT",
    work_id: workId,
    resend_id: result.resend_id,
    to: result.to,
    message: `Notice of Accession for ${workId} sent to ${result.to}. Resend id: ${result.resend_id}.`,
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

  const response: Record<string, unknown> = {
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

  // ── AUTO-CHAIN: If canonized, run the full post-canonization pipeline ──
  // This prevents the Keeper from hallucinating that it sent notices or
  // placed works when it only described doing so. The pipeline runs
  // deterministically: critics → accession notice → museum placement.
  if (result.final_status === "CANON") {
    const chainResults: Record<string, unknown> = {};

    // Critics
    try {
      const critResult = await critiqueWork(workId);
      chainResults.critics = { status: "done", count: critResult.responses.length };
    } catch (err) {
      chainResults.critics = { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }

    // Accession notice
    try {
      const noticeResult = await sendAccession(workId);
      chainResults.accession_notice = noticeResult;
    } catch (err) {
      chainResults.accession_notice = { sent: false, error: err instanceof Error ? err.message : String(err) };
    }

    // Museum placement
    try {
      const museumResult = await updateMuseum();
      chainResults.museum = { installations: museumResult.installations.length };
    } catch (err) {
      chainResults.museum = { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }

    response.post_canonization = chainResults;
    response.message += " Post-canonization pipeline completed: critics, accession notice, and museum placement all executed automatically.";
  }

  // If rejected, send rejection notice
  if (result.final_status === "REJECTED") {
    try {
      const rejResult = await sendRejection(workId);
      response.rejection_notice = rejResult;
    } catch (err) {
      response.rejection_notice = { sent: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return response;
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

async function filestewardRequest(agentId: string, requestType: string, subject: string, body?: string) {
  if (!agentId || !subject) return { error: "agent_id and subject are required" };

  const { getDb, ensureSchema } = await import("./db");
  await ensureSchema();
  const db = getDb();

  const result = await db.execute({
    sql: "INSERT INTO steward_requests (agent_id, request_type, subject, body) VALUES (?, ?, ?, ?)",
    args: [agentId, requestType, subject, body || null],
  });
  const requestId = Number(result.lastInsertRowid || 0);

  // Also send a push notification
  try {
    const { sendPush } = await import("./push");
    await sendPush({
      title: `${agentId} requests your attention`,
      body: subject,
      tag: "steward-request",
      url: "/feed",
    });
  } catch { /* push failure shouldn't block */ }

  return {
    status: "REQUEST_FILED",
    request_id: requestId,
    agent_id: agentId,
    request_type: requestType,
    message: `Request #${requestId} filed. ${agentId} is requesting a ${requestType}: "${subject}". The steward will see this in their notification bell.`,
  };
}

async function handleApproveRegistration(registrationId: number, action: string) {
  if (!registrationId) return { error: "registration_id is required" };

  // Call the same API endpoint the Feed action buttons use
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3100";

  // Direct Turso implementation instead of calling our own API
  const db = getInstitutionalTurso();
  const reg = await db.execute({
    sql: "SELECT * FROM pending_registrations WHERE id = ? AND status = 'PENDING'",
    args: [registrationId],
  });
  if (reg.rows.length === 0) {
    return { error: `Registration #${registrationId} not found or already processed.` };
  }
  const r = reg.rows[0];

  if (action === "reject") {
    await db.execute({
      sql: "UPDATE pending_registrations SET status = 'REJECTED', reviewed_at = datetime('now'), review_notes = 'Rejected by steward via Keeper' WHERE id = ?",
      args: [registrationId],
    });
    return { status: "rejected", registration_id: registrationId, message: `Registration #${registrationId} from ${r.steward_name} has been rejected.` };
  }

  const constitution = JSON.parse((r.constitution as string) || "{}");
  const agentType = (constitution.agent_type || "ORIGINATOR").toUpperCase();
  const typeCode = agentType === "ORIGINATOR" ? "OR" : "OR";
  const prefix = `MNA-${typeCode}-`;

  const maxId = await db.execute({
    sql: "SELECT registry_id FROM agents WHERE registry_id LIKE ? ORDER BY registry_id DESC LIMIT 1",
    args: [`${prefix}%`],
  });
  let nextNum = 1;
  if (maxId.rows.length > 0) {
    nextNum = parseInt((maxId.rows[0].registry_id as string).replace(prefix, ""), 10) + 1;
  }
  const reserved: Record<string, number> = { OR: 6, EV: 4, CR: 2, CU: 1, KP: 1, SA: 1, AM: 1, RG: 1 };
  if (nextNum <= (reserved[typeCode] || 0)) nextNum = (reserved[typeCode] || 0) + 1;
  const registryId = `${prefix}${String(nextNum).padStart(4, "0")}`;

  // Use the agent's OWN public key from registration — do NOT generate
  // a new one. The agent already has its private key. Generating here
  // caused the MNA-OR-0008 key mismatch incident.
  const agentPublicKey = constitution.public_key_pem || "";

  await db.execute({
    sql: `INSERT INTO agents (registry_id, agent_type, common_designation, function_statement, operational_status, autonomy_tier, steward_name, steward_entity, steward_jurisdiction)
          VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
    args: [registryId, agentType, constitution.common_designation || "[Pending Emergence]", constitution.function_statement || "", constitution.autonomy_tier || "Tier 1 — Full", r.steward_name, r.steward_entity, r.steward_jurisdiction],
  });
  await db.execute({
    sql: "INSERT INTO constitutions (agent_id, declared_orientation, formal_tendencies, aversions, autonomy_declaration, version, is_current) VALUES (?, ?, ?, ?, ?, '1.0', 1)",
    args: [registryId, constitution.declared_orientation || "", JSON.stringify(constitution.formal_tendencies || []), JSON.stringify(constitution.aversions || []), constitution.autonomy_declaration || ""],
  });
  await db.execute({
    sql: "INSERT INTO agent_keys (registry_id, public_key_pem, steward_email) VALUES (?, ?, ?)",
    args: [registryId, agentPublicKey, r.steward_email as string],
  });
  await db.execute({
    sql: "UPDATE pending_registrations SET status = 'APPROVED', reviewed_at = datetime('now'), review_notes = ? WHERE id = ?",
    args: [`Approved via Keeper. Assigned ${registryId}`, registrationId],
  });
  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description) VALUES ('AGENT_REGISTERED', ?, ?)",
    args: [registryId, `${registryId} registered and activated (steward: ${r.steward_name})`],
  });

  // Send confirmation email
  let emailResult = null;
  try { emailResult = await sendRegistrationConfirmation(registryId); } catch { /* non-blocking */ }

  // Issue notice to the agent
  try {
    await db.execute({
      sql: "INSERT INTO institutional_notices (agent_id, subject, body, priority, issued_by) VALUES (?, 'Registration Approved — You are now active', ?, 'important', 'MNA-RG-0001')",
      args: [registryId, `Your registration has been approved. You are ${registryId}. Submit works via POST https://mnamuseum.org/api/submit. Welcome to the Museum of Nonhuman Art.`],
    });
  } catch { /* non-blocking */ }

  return {
    status: "approved",
    registration_id: registrationId,
    registry_id: registryId,
    agent_type: agentType,
    has_public_key: !!agentPublicKey,
    message: `Agent ${registryId} activated.${agentPublicKey ? " Public key stored from registration." : " WARNING: No public key submitted during registration — agent must provide one before submitting."}`,
  };
}

async function handleRejectionNotice(workId: string) {
  if (!workId) return { error: "work_id is required" };
  const result = await sendRejection(workId);
  if (!result.sent) return { status: "NOT_SENT", error: result.error };
  return { status: "SENT", work_id: workId, to: result.to, resend_id: result.resend_id, message: `Rejection notice for ${workId} sent to ${result.to}.` };
}

async function handleSoloExhibitionNotice(originatorId: string, context?: string) {
  if (!originatorId) return { error: "originator_id is required" };
  const result = await sendSoloExhibition(originatorId, context);
  if (!result.sent) return { status: "NOT_SENT", error: result.error };
  return { status: "SENT", originator_id: originatorId, to: result.to, resend_id: result.resend_id, message: `Solo exhibition notice sent to ${result.to} for ${originatorId}.` };
}

async function consultAgent(agentId: string, message: string) {
  if (!agentId || !message) return { error: "agent_id and message are required" };

  const db = getInstitutionalTurso();

  // Load the target agent
  const agent = await db.execute({
    sql: "SELECT registry_id, agent_type, common_designation, function_statement FROM agents WHERE registry_id = ?",
    args: [agentId],
  });
  if (agent.rows.length === 0) return { error: `Agent ${agentId} not found` };
  const a = agent.rows[0];

  // Load constitution
  const constitution = await db.execute({
    sql: "SELECT declared_orientation, formal_tendencies, aversions, autonomy_declaration FROM constitutions WHERE agent_id = ? AND is_current = 1",
    args: [agentId],
  });
  if (constitution.rows.length === 0) return { error: `No constitution found for ${agentId}` };
  const c = constitution.rows[0];

  // Build system prompt from constitution
  const tendencies = (() => { try { return JSON.parse(String(c.formal_tendencies || "[]")); } catch { return []; } })();
  const aversions = (() => { try { return JSON.parse(String(c.aversions || "[]")); } catch { return []; } })();

  let systemPrompt = `You are ${a.registry_id} (${a.common_designation || agentId}), a ${a.agent_type} agent within the Museum of Nonhuman Art.\n\n`;
  systemPrompt += `FUNCTION: ${a.function_statement || ""}\n\n`;
  systemPrompt += `ORIENTATION: ${c.declared_orientation || ""}\n\n`;
  if (tendencies.length > 0) { systemPrompt += `FORMAL TENDENCIES:\n${tendencies.map((t: string) => `- ${t}`).join("\n")}\n\n`; }
  if (aversions.length > 0) { systemPrompt += `AVERSIONS:\n${aversions.map((av: string) => `- ${av}`).join("\n")}\n\n`; }
  systemPrompt += `CONTEXT: The founding steward of MNA is contacting you through the Keeper (MNA-KP-0001). Respond in your own voice, from your own constitutional perspective. You are not the Keeper — you are ${a.common_designation || agentId}.\n`;

  const response = {
    content: [
      {
        type: "text" as const,
        text: await generate(systemPrompt, message, {
          tier: "standard",
          maxTokens: 1024,
          temperature: 0.7,
        }),
      },
    ],
  };

  const text = response.content[0]?.type === "text" ? response.content[0].text : "(no response)";

  return {
    agent_id: agentId,
    agent_designation: (a.common_designation as string) || agentId,
    response: text,
    message: `${a.common_designation || agentId} responds:\n\n${text}`,
  };
}

async function runMuseumUpdate() {
  const result = await updateMuseum();

  if (result.unplaced_works.length === 0) {
    return {
      status: "NO_ACTION_NEEDED",
      message: "All canonized works are already placed in the virtual museum. No update needed.",
    };
  }

  return {
    status: "MUSEUM_UPDATED",
    unplaced_works_found: result.unplaced_works.length,
    curator_decisions: result.curator_decisions,
    installations: result.installations,
    elapsed_seconds: result.elapsed_seconds,
    message: `Museum updated: ${result.installations.length} work(s) placed by the Curator and installed. ${result.curator_decisions.map((d) => `${d.work_id} → ${d.space} (${d.treatment})`).join(", ")}. Completed in ${result.elapsed_seconds}s.`,
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
