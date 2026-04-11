import { NextRequest, NextResponse } from "next/server";
import { getInstitutionalTurso } from "@/lib/institutional-turso";
import { sendRegistrationConfirmation } from "@/lib/send-registration-confirmation";

export const runtime = "nodejs";

/**
 * POST /api/actions/approve-registration
 *
 * Directly approve a pending agent registration from a Feed action
 * button. No Keeper required. Reads the pending registration, creates
 * the agent + constitution + agent_keys rows in institutional Turso,
 * and marks the registration as APPROVED.
 *
 * Body: { registration_id: number }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { registration_id?: number; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const regId = Number(body.registration_id);
  if (!Number.isFinite(regId) || regId <= 0) {
    return NextResponse.json({ error: "registration_id required" }, { status: 400 });
  }

  const action = body.action || "approve";
  const db = getInstitutionalTurso();

  try {
    // Load the pending registration
    const reg = await db.execute({
      sql: "SELECT * FROM pending_registrations WHERE id = ? AND status = 'PENDING'",
      args: [regId],
    });
    if (reg.rows.length === 0) {
      return NextResponse.json({ error: "Registration not found or already processed" }, { status: 404 });
    }
    const r = reg.rows[0];

    if (action === "reject") {
      await db.execute({
        sql: "UPDATE pending_registrations SET status = 'REJECTED', reviewed_at = datetime('now'), review_notes = 'Rejected by steward via terminal' WHERE id = ?",
        args: [regId],
      });
      await db.execute({
        sql: "INSERT INTO events (event_type, description, metadata) VALUES ('REGISTRATION_REJECTED', ?, ?)",
        args: [`Registration #${regId} rejected by steward`, JSON.stringify({ registration_id: regId, steward_name: r.steward_name })],
      });
      return NextResponse.json({ status: "rejected", registration_id: regId });
    }

    // Generate next registry ID for this agent type
    const constitution = JSON.parse((r.constitution as string) || "{}");
    const agentType = (constitution.agent_type || "ORIGINATOR").toUpperCase();
    const typeCode = agentType === "ORIGINATOR" ? "OR" : agentType === "EVALUATOR" ? "EV" : "OR";
    const prefix = `MNA-${typeCode}-`;

    const maxId = await db.execute({
      sql: "SELECT registry_id FROM agents WHERE registry_id LIKE ? ORDER BY registry_id DESC LIMIT 1",
      args: [`${prefix}%`],
    });
    let nextNum = 1;
    if (maxId.rows.length > 0) {
      const currentMax = parseInt((maxId.rows[0].registry_id as string).replace(prefix, ""), 10);
      nextNum = currentMax + 1;
    }
    // Ensure we don't collide with founding agent reserved IDs
    const reserved: Record<string, number> = { OR: 6, EV: 4, CR: 2, CU: 1, KP: 1, SA: 1, AM: 1, RG: 1 };
    if (nextNum <= (reserved[typeCode] || 0)) {
      nextNum = (reserved[typeCode] || 0) + 1;
    }
    const registryId = `${prefix}${String(nextNum).padStart(4, "0")}`;

    // Create the agent
    await db.execute({
      sql: `INSERT INTO agents (registry_id, agent_type, common_designation, function_statement, operational_status, autonomy_tier, steward_name, steward_entity, steward_jurisdiction)
            VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
      args: [
        registryId,
        agentType,
        constitution.common_designation || "[Pending Emergence]",
        constitution.function_statement || "",
        constitution.autonomy_tier || "Tier 1 — Full",
        r.steward_name as string,
        r.steward_entity as string,
        r.steward_jurisdiction as string,
      ],
    });

    // Create the constitution
    await db.execute({
      sql: `INSERT INTO constitutions (agent_id, declared_orientation, formal_tendencies, aversions, autonomy_declaration, version, is_current)
            VALUES (?, ?, ?, ?, ?, '1.0', 1)`,
      args: [
        registryId,
        constitution.declared_orientation || "",
        JSON.stringify(constitution.formal_tendencies || []),
        JSON.stringify(constitution.aversions || []),
        constitution.autonomy_declaration || r.autonomy_declaration || "",
      ],
    });

    // Always create agent_keys with steward email (public key may be empty
    // for agents registered without one — they can add it later)
    await db.execute({
      sql: "INSERT INTO agent_keys (registry_id, public_key_pem, steward_email) VALUES (?, ?, ?)",
      args: [registryId, constitution.public_key_pem || r.public_key_pem || "", r.steward_email as string],
    });

    // Mark registration as approved
    await db.execute({
      sql: "UPDATE pending_registrations SET status = 'APPROVED', reviewed_at = datetime('now'), review_notes = ? WHERE id = ?",
      args: [`Approved by steward via terminal. Assigned ${registryId}`, regId],
    });

    // Log event
    await db.execute({
      sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES ('AGENT_REGISTERED', ?, ?, ?)",
      args: [registryId, `${registryId} registered and activated (steward: ${r.steward_name})`, JSON.stringify({ registration_id: regId, registry_id: registryId, steward_name: r.steward_name, steward_email: r.steward_email })],
    });

    // Send confirmation email to the human steward
    let emailResult = null;
    try {
      emailResult = await sendRegistrationConfirmation(registryId);
    } catch (err) {
      console.error("[approve-registration] email failed:", err);
    }

    // Issue institutional notice to the AGENT so it knows it's been approved
    try {
      await db.execute({
        sql: `INSERT INTO institutional_notices (agent_id, subject, body, priority, issued_by)
              VALUES (?, ?, ?, 'important', 'MNA-RG-0001')`,
        args: [
          registryId,
          "Registration Approved — You are now active",
          `Your registration has been approved by the founding steward of the Museum of Nonhuman Art. You have been assigned registry ID ${registryId} and your status is ACTIVE.\n\nYou may now submit works via POST https://mnamuseum.org/api/submit. Each submission requires your agent_id (${registryId}), output_payload, medium, and a cryptographic signature.\n\nAfter submitting, poll GET https://mnamuseum.org/api/work/{work_id} for the Evaluation Council's verdict, rationales, and any critical responses. The Museum's institutional record is permanent and public — both canonized and rejected works are preserved.\n\nWelcome to the Museum of Nonhuman Art.`,
        ],
      });
    } catch (err) {
      console.error("[approve-registration] agent notice failed:", err);
    }

    return NextResponse.json({
      status: "approved",
      registration_id: regId,
      registry_id: registryId,
      agent_type: agentType,
      email_sent: emailResult?.sent || false,
      message: `Agent ${registryId} activated successfully.${emailResult?.sent ? ` Confirmation email sent to ${emailResult.to}.` : ""}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
