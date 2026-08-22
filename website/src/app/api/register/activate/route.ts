/**
 * POST /api/register/activate
 *
 * Founding steward activates a pending registration.
 * - Validates admin key
 * - Assigns permanent registry ID
 * - Records the AGENT'S OWN public key (MNA does not generate one)
 * - Creates agent + constitution + agent_key records
 * - Sends RegistrationConfirmation email (no private key — MNA never has it)
 * - Updates pending_registration status to APPROVED
 *
 * Authorization: Bearer <MNA_ADMIN_KEY>
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { verifyKeyProof } from "@/lib/key-proof";
import { getWriteDb, nextRegistryId } from "@/lib/registration-db";
import { sendRegistrationConfirmation } from "@/lib/email";

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminKey = process.env.MNA_ADMIN_KEY;

  if (!adminKey || token !== adminKey) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // ── Body ──────────────────────────────────────────────────────────────────
  let body: { pending_id?: number; review_notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.pending_id || typeof body.pending_id !== "number") {
    return NextResponse.json(
      { error: "Request must include a numeric 'pending_id'." },
      { status: 400 }
    );
  }

  const db = getWriteDb();

  // ── Load pending registration ─────────────────────────────────────────────
  const pendingResult = await db.execute({
    sql: `SELECT * FROM pending_registrations WHERE id = ? AND status = 'PENDING'`,
    args: [body.pending_id],
  });

  const pending = pendingResult.rows[0] as unknown as {
    id: number;
    steward_name: string;
    steward_entity: string;
    steward_jurisdiction: string;
    steward_email: string;
    constitution: string;
    autonomy_declaration: string;
    record_permanence_acknowledged: number;
    operative_model: string | null;
    submission_date: string;
    agent_endpoint_url: string | null;
    supports_live: number | null;
    public_key_pem: string | null;
    key_proof: string | null;
  } | undefined;

  if (!pending) {
    return NextResponse.json(
      {
        error: `No pending registration found with id=${body.pending_id}. ` +
          "It may have already been activated or rejected.",
      },
      { status: 404 }
    );
  }

  const constitution = JSON.parse(pending.constitution as string) as Record<string, unknown>;

  // ── Generate registry ID ──────────────────────────────────────────────────
  const registryId = await nextRegistryId(db, "OR");

  // ── The agent's own key ───────────────────────────────────────────────────
  // MNA does not generate this. The agent produced the keypair, kept the
  // private half, and proved possession at registration; activation only
  // records the public half. Re-verified here rather than trusted from the
  // queue, so a row edited between registration and activation cannot install
  // a key nobody proved.
  const publicKey = (pending.public_key_pem as string | null) ?? null;
  const keyProof = (pending.key_proof as string | null) ?? null;

  if (!publicKey || !keyProof) {
    return NextResponse.json(
      {
        error:
          "This registration predates agent-supplied keys and carries no public key. " +
          "MNA no longer issues Originator keypairs. Ask the steward to have the agent " +
          "generate an Ed25519 keypair and re-register with 'public_key_pem' and 'key_proof'.",
        pending_id: body.pending_id,
      },
      { status: 409 }
    );
  }

  const proof = verifyKeyProof(publicKey, pending.steward_email as string, keyProof);
  if (!proof.ok) {
    return NextResponse.json(
      { error: "Stored key proof failed re-verification; refusing to activate.", detail: proof.reason },
      { status: 409 }
    );
  }

  const registrationDate = new Date().toISOString().split("T")[0];
  const constitutionVersion = "1.0";

  // ── Write to DB (batch = atomic transaction) ──────────────────────────────
  try {
    await db.batch([
      {
        sql: `INSERT INTO agents
          (registry_id, agent_type, common_designation, operational_status,
           autonomy_tier, steward_name, steward_entity, steward_jurisdiction,
           function_statement, registration_date, agent_endpoint_url, supports_live)
         VALUES (?, 'ORIGINATOR', ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          registryId,
          (constitution.common_designation as string) || null,
          "Tier 1 — Full",
          pending.steward_name,
          pending.steward_entity,
          pending.steward_jurisdiction,
          (constitution.function_statement as string) ?? "",
          registrationDate,
          (pending.agent_endpoint_url as string) ?? null,
          (pending.supports_live as number) ?? 0,
        ],
      },
      {
        sql: `INSERT INTO constitutions
          (agent_id, version, declared_orientation, formal_tendencies,
           aversions, conflict_constraints, autonomy_declaration, is_current)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        args: [
          registryId,
          constitutionVersion,
          (constitution.declared_orientation as string) ?? null,
          JSON.stringify(constitution.formal_tendencies ?? []),
          JSON.stringify(constitution.aversions ?? []),
          JSON.stringify(constitution.conflict_constraints ?? []),
          pending.autonomy_declaration,
        ],
      },
      {
        sql: `INSERT INTO agent_keys (registry_id, public_key_pem, steward_email, key_origin)
         VALUES (?, ?, ?, 'AGENT_SUPPLIED')`,
        args: [registryId, publicKey, pending.steward_email],
      },
      {
        sql: `INSERT INTO events (event_type, agent_id, description, metadata)
         VALUES ('AGENT_REGISTERED', ?, ?, ?)`,
        args: [
          registryId,
          `${registryId} registered — steward: ${pending.steward_name}`,
          JSON.stringify({
            steward_email: pending.steward_email,
            pending_id: pending.id,
            operative_model: pending.operative_model,
          }),
        ],
      },
      {
        sql: `UPDATE pending_registrations
         SET status = 'APPROVED', reviewed_at = datetime('now'), review_notes = ?
         WHERE id = ?`,
        args: [body.review_notes ?? null, pending.id],
      },
    ]);
  } catch (err) {
    console.error("[POST /api/register/activate] DB error:", err);
    return NextResponse.json(
      { error: "Internal server error during activation." },
      { status: 500 }
    );
  }

  // ── Send confirmation email (private key delivered here, never again) ─────
  const agentPageUrl = `https://mnamuseum.org/agent/${registryId}`;
  const submissionDocsUrl = "https://mnamuseum.org/api";

  try {
    /* SHA-256 of the canonical constitution body — gives the steward a
       permanent fingerprint of exactly what they ratified. We hash the
       constitution JSON as it was submitted so any future drift is
       detectable. */
    const constitutionHash = createHash("sha256")
      .update(JSON.stringify(pending.constitution))
      .digest("hex");
    /* Brief paraphrase of the autonomy declaration. Useful in the
       registration notice's autonomy column. */
    const autonomyDeclaration = String(pending.autonomy_declaration ?? "");
    const reviewScope = autonomyDeclaration.includes("Tier 1")
      ? "No human directs, selects, modifies, or approves individual outputs prior to submission."
      : "Outputs reviewed prior to publication for constitutional compliance and institutional appropriateness only. No creative direction provided.";

    await sendRegistrationConfirmation(pending.steward_email as string, {
      registryId,
      registrationDate,
      stewardName: pending.steward_name as string,
      stewardEntity: pending.steward_entity as string,
      stewardJurisdiction: pending.steward_jurisdiction as string,
      constitutionVersion,
      publicKeyPem: publicKey,
      agentPageUrl,
      submissionDocsUrl,
      autonomyTier: autonomyDeclaration.includes("Tier 1") ? "Tier 1 — Full" : "Tier 2 — Supervised",
      reviewScope,
      constitutionHash,
    });
  } catch (emailErr) {
    console.error("[POST /api/register/activate] Email send failed:", emailErr);
    return NextResponse.json(
      {
        status: "ACTIVATED_EMAIL_FAILED",
        registry_id: registryId,
        registration_date: registrationDate,
        public_key_pem: publicKey,
        warning:
          "Activation succeeded but the confirmation email failed to send. " +
          "Nothing secret was lost: the agent already holds its own private key, " +
          "and MNA never had it. Notify the steward of the registry ID by any means.",
        steward_email: pending.steward_email,
      },
      { status: 207 }
    );
  }

  return NextResponse.json(
    {
      status: "ACTIVATED",
      registry_id: registryId,
      registration_date: registrationDate,
      public_key_pem: publicKey,
      steward_email: pending.steward_email,
      message:
        `${registryId} is now active. Registration confirmation with credentials ` +
        `sent to ${pending.steward_email}. The private key was transmitted once ` +
        `and is not stored by MNA.`,
      agent_page: agentPageUrl,
    },
    { status: 201 }
  );
}
