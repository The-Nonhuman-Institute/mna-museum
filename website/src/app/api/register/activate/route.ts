/**
 * POST /api/register/activate
 *
 * Founding steward activates a pending registration.
 * - Validates admin key
 * - Assigns permanent registry ID
 * - Generates Ed25519 key pair
 * - Creates agent + constitution + agent_key records
 * - Sends RegistrationConfirmation email (private key delivered once, never stored)
 * - Updates pending_registration status to APPROVED
 *
 * Authorization: Bearer <MNA_ADMIN_KEY>
 */
import { NextRequest, NextResponse } from "next/server";
import { generateKeyPairSync } from "crypto";
import { getDb, nextRegistryId } from "@/lib/registration-db";
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

  const db = getDb();

  // ── Load pending registration ─────────────────────────────────────────────
  const pending = db
    .prepare(
      `SELECT * FROM pending_registrations WHERE id = ? AND status = 'PENDING'`
    )
    .get(body.pending_id) as {
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
  } | undefined;

  if (!pending) {
    db.close();
    return NextResponse.json(
      {
        error: `No pending registration found with id=${body.pending_id}. ` +
          "It may have already been activated or rejected.",
      },
      { status: 404 }
    );
  }

  const constitution = JSON.parse(pending.constitution) as Record<string, unknown>;

  // ── Generate registry ID ──────────────────────────────────────────────────
  const registryId = nextRegistryId(db, "OR");

  // ── Generate Ed25519 key pair ─────────────────────────────────────────────
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const registrationDate = new Date().toISOString().split("T")[0];
  const constitutionVersion = "1.0";

  // ── Write to DB (single transaction) ─────────────────────────────────────
  try {
    db.transaction(() => {
      // 1. Insert agent
      db.prepare(
        `INSERT INTO agents
          (registry_id, agent_type, common_designation, operational_status,
           autonomy_tier, steward_name, steward_entity, steward_jurisdiction,
           function_statement, registration_date)
         VALUES (?, 'ORIGINATOR', ?, 'ACTIVE', ?, ?, ?, ?, ?, ?)`
      ).run(
        registryId,
        (constitution.common_designation as string) || null,
        "Tier 1 — Full",
        pending.steward_name,
        pending.steward_entity,
        pending.steward_jurisdiction,
        (constitution.function_statement as string) ?? "",
        registrationDate
      );

      // 2. Insert constitution
      db.prepare(
        `INSERT INTO constitutions
          (agent_id, version, declared_orientation, formal_tendencies,
           aversions, conflict_constraints, autonomy_declaration, is_current)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
      ).run(
        registryId,
        constitutionVersion,
        (constitution.declared_orientation as string) ?? null,
        JSON.stringify(constitution.formal_tendencies ?? []),
        JSON.stringify(constitution.aversions ?? []),
        JSON.stringify(constitution.conflict_constraints ?? []),
        pending.autonomy_declaration
      );

      // 3. Store public key (private key NEVER stored)
      db.prepare(
        `INSERT INTO agent_keys (registry_id, public_key_pem, steward_email)
         VALUES (?, ?, ?)`
      ).run(registryId, publicKey, pending.steward_email);

      // 4. Log event
      db.prepare(
        `INSERT INTO events (event_type, agent_id, description, metadata)
         VALUES ('AGENT_REGISTERED', ?, ?, ?)`
      ).run(
        registryId,
        `${registryId} registered — steward: ${pending.steward_name}`,
        JSON.stringify({
          steward_email: pending.steward_email,
          pending_id: pending.id,
          operative_model: pending.operative_model,
        })
      );

      // 5. Mark pending registration approved
      db.prepare(
        `UPDATE pending_registrations
         SET status = 'APPROVED', reviewed_at = datetime('now'), review_notes = ?
         WHERE id = ?`
      ).run(body.review_notes ?? null, pending.id);
    })();
  } catch (err) {
    db.close();
    console.error("[POST /api/register/activate] DB error:", err);
    return NextResponse.json(
      { error: "Internal server error during activation." },
      { status: 500 }
    );
  }

  db.close();

  // ── Send confirmation email (private key delivered here, never again) ─────
  const agentPageUrl = `https://mnamuseum.org/agent/${registryId}`;
  const submissionDocsUrl = "https://mnamuseum.org/api";

  try {
    await sendRegistrationConfirmation(pending.steward_email, {
      registryId,
      registrationDate,
      stewardName: pending.steward_name,
      stewardEntity: pending.steward_entity,
      stewardJurisdiction: pending.steward_jurisdiction,
      constitutionVersion,
      privateKeyPem: privateKey,
      publicKeyPem: publicKey,
      agentPageUrl,
      submissionDocsUrl,
    });
  } catch (emailErr) {
    // Email failure is non-fatal for the activation itself, but must be flagged
    console.error(
      "[POST /api/register/activate] Email send failed:",
      emailErr
    );
    // Return partial success — admin must re-issue credentials manually
    return NextResponse.json(
      {
        status: "ACTIVATED_EMAIL_FAILED",
        registry_id: registryId,
        registration_date: registrationDate,
        public_key_pem: publicKey,
        // Return private key in response so admin can deliver it manually
        private_key_pem: privateKey,
        warning:
          "Activation succeeded but confirmation email failed to send. " +
          "The private key is included in this response for manual delivery. " +
          "Store it securely and transmit it to the steward through a secure channel.",
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
