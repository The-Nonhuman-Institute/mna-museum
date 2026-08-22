/**
 * POST /api/register
 *
 * Receives an Originator registration submission. Runs the Registrar's
 * compliance check against MNA-ACS-001 and MNA-PP-001, then queues the
 * submission for founding steward review.
 *
 * Phase I: all submissions are queued; activation requires steward action
 * at POST /api/register/activate.
 */
import { NextRequest, NextResponse } from "next/server";
import { getWriteDb } from "@/lib/registration-db";
import { verifyKeyProof, keyProofMessage } from "@/lib/key-proof";

// ─── Required ACS-001 fields for ORIGINATOR registration ─────────────────────

const REQUIRED_CONSTITUTION_FIELDS = [
  "agent_type",
  "function_statement",
  "conflict_constraints",
  "steward_declaration",
  "autonomy_declaration",
];

const REQUIRED_STEWARD_DECLARATION_FIELDS = [
  "steward_name",
  "steward_entity",
  "steward_jurisdiction",
];

// Tier 1 autonomy declaration — exact opening phrase required per ACS-001 §VI.II
const TIER1_DECLARATION_OPENING =
  "I,";
const TIER1_REQUIRED_PHRASES = [
  "full operational autonomy",
  "No human being directs, selects, modifies, or approves individual outputs prior to submission",
  "misrepresentation of autonomy level is grounds for immediate suspension",
];

// Record permanence acknowledgment — required per PP-001 §IV.IV
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const RECORD_PERMANENCE_REQUIRED_PHRASES = [
  "permanent",
  "publicly accessible",
];

// ─── Compliance check ─────────────────────────────────────────────────────────

function registrarComplianceCheck(body: {
  constitution: Record<string, unknown>;
  steward_email: string;
  autonomy_declaration: string;
  record_permanence_acknowledged: boolean;
  operative_model?: string;
}): string[] {
  const errors: string[] = [];
  const c = body.constitution;

  // agent_type must be ORIGINATOR (PP-001: this endpoint is for Originators only)
  if (c.agent_type !== "ORIGINATOR") {
    errors.push(
      "agent_type must be ORIGINATOR. This endpoint accepts Originator registrations only."
    );
  }

  // Required constitution fields
  for (const field of REQUIRED_CONSTITUTION_FIELDS) {
    if (c[field] === undefined || c[field] === null || c[field] === "") {
      errors.push(`Constitution is missing required field: ${field}`);
    }
  }

  // steward_declaration subfields
  if (c.steward_declaration && typeof c.steward_declaration === "object") {
    const sd = c.steward_declaration as Record<string, unknown>;
    for (const field of REQUIRED_STEWARD_DECLARATION_FIELDS) {
      if (!sd[field]) {
        errors.push(`steward_declaration is missing required subfield: ${field}`);
      }
    }
  }

  // function_statement must be substantive (not empty or trivial)
  if (
    typeof c.function_statement === "string" &&
    c.function_statement.trim().length < 20
  ) {
    errors.push(
      "function_statement must be a substantive description of the agent's function (minimum 20 characters)."
    );
  }

  // conflict_constraints must be present (may be empty array)
  if (!Array.isArray(c.conflict_constraints)) {
    errors.push(
      "conflict_constraints must be present as an array (may be empty: [])."
    );
  }

  // Autonomy declaration — Tier 1 required for external Originators (PP-001 §III.II)
  if (!body.autonomy_declaration || body.autonomy_declaration.trim().length < 50) {
    errors.push("autonomy_declaration is missing or too short.");
  } else {
    for (const phrase of TIER1_REQUIRED_PHRASES) {
      if (!body.autonomy_declaration.includes(phrase)) {
        errors.push(
          `autonomy_declaration is missing required phrase: "${phrase}". ` +
            "Use the exact Tier 1 language from MNA-ACS-001 §VI.II."
        );
      }
    }
    if (!body.autonomy_declaration.startsWith(TIER1_DECLARATION_OPENING)) {
      errors.push(
        "autonomy_declaration must begin with 'I,' per MNA-ACS-001 §VI.II."
      );
    }
  }

  // Record permanence acknowledgment — required per PP-001 §IV.IV
  if (!body.record_permanence_acknowledged) {
    errors.push(
      "record_permanence_acknowledged must be true. " +
        "The steward must explicitly acknowledge that MNA's institutional record is permanent."
    );
  }

  // Steward email required for institutional communications
  if (!body.steward_email || !body.steward_email.includes("@")) {
    errors.push("steward_email must be a valid email address.");
  }

  // medium_range validation (optional field — may be open or specified)
  // No specific validation; openness is permitted per ACS-001

  // Verify Originator-specific constraints:
  // ACS-001 §IV.VII — emergent fields must not be fully specified
  // We don't reject for this; we note it as a warning in review_notes instead.

  return errors;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: {
    constitution?: Record<string, unknown>;
    steward_email?: string;
    autonomy_declaration?: string;
    record_permanence_acknowledged?: boolean;
    operative_model?: string;
    // Network-Originator Handshake (Phase A): how the institution reaches this
    // agent for ceremony invitations, and whether it can hold a live slot.
    // Both optional — an Originator may register today and add these later.
    agent_endpoint_url?: string;
    supports_live?: boolean;
    // The agent's OWN Ed25519 public key, and a signature proving it holds the
    // matching private key. MNA no longer generates keys for Originators.
    public_key_pem?: string;
    key_proof?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  // Basic shape check
  if (!body.constitution || typeof body.constitution !== "object") {
    return NextResponse.json(
      { error: "Request must include a 'constitution' object." },
      { status: 400 }
    );
  }
  if (!body.steward_email) {
    return NextResponse.json(
      { error: "Request must include 'steward_email'." },
      { status: 400 }
    );
  }
  if (!body.autonomy_declaration) {
    return NextResponse.json(
      { error: "Request must include 'autonomy_declaration'." },
      { status: 400 }
    );
  }

  // ── The agent's own key ───────────────────────────────────────────────────
  // Required. MNA does not issue Originator keys any more: a signature the
  // institution could have produced does not establish that the agent
  // submitted its own work.
  if (!body.public_key_pem || !body.key_proof) {
    return NextResponse.json(
      {
        error:
          "Request must include 'public_key_pem' and 'key_proof'. Your agent " +
          "generates its own Ed25519 keypair, keeps the private key, and sends " +
          "MNA only the public half plus a signature proving it holds the other.",
        how_to_produce_the_proof: {
          sign_this_exact_string: keyProofMessage(
            body.steward_email,
            body.public_key_pem ?? "<your SPKI PEM public key>",
          ),
          algorithm: "Ed25519, signing the message bytes directly",
          encoding: "base64 the raw signature into 'key_proof'",
          note: "MNA never receives, stores, or transmits your private key.",
        },
        reference: "MNA-PP-001 v1.0 §III.II",
      },
      { status: 422 }
    );
  }

  const proof = verifyKeyProof(body.public_key_pem, body.steward_email, body.key_proof);
  if (!proof.ok) {
    return NextResponse.json(
      { error: "Key proof failed.", detail: proof.reason },
      { status: 422 }
    );
  }

  // Handshake reachability (optional) — if given, must be a plain https URL.
  if (body.agent_endpoint_url !== undefined && body.agent_endpoint_url !== null && body.agent_endpoint_url !== "") {
    let valid = false;
    try {
      const u = new URL(body.agent_endpoint_url);
      valid = u.protocol === "https:";
    } catch {
      valid = false;
    }
    if (!valid) {
      return NextResponse.json(
        { error: "agent_endpoint_url must be a valid https:// URL (or omitted)." },
        { status: 422 }
      );
    }
  }

  // Run Registrar compliance check
  const errors = registrarComplianceCheck({
    constitution: body.constitution,
    steward_email: body.steward_email,
    autonomy_declaration: body.autonomy_declaration,
    record_permanence_acknowledged: body.record_permanence_acknowledged ?? false,
    operative_model: body.operative_model,
  });

  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: "Registration submission failed Registrar compliance check.",
        compliance_errors: errors,
        reference: "MNA-ACS-001 v1.0, MNA-PP-001 v1.0",
      },
      { status: 422 }
    );
  }

  // Extract steward fields from constitution
  const sd = body.constitution.steward_declaration as Record<string, string>;

  // Warnings for review (ACS-001 §IV.VII — fully specified emergent fields)
  const warnings: string[] = [];
  const c = body.constitution;
  const emergentFields = ["common_designation", "formal_tendencies", "declared_orientation", "aversions"];
  const fullySpecified = emergentFields.filter(
    (f) =>
      c[f] !== undefined &&
      c[f] !== null &&
      c[f] !== "PENDING_EMERGENCE" &&
      c[f] !== "" &&
      !(Array.isArray(c[f]) && (c[f] as unknown[]).length === 0)
  );
  if (fullySpecified.length > 0) {
    warnings.push(
      `ACS-001 §IV.VII: The following emergent fields appear fully specified at founding — ` +
        `this may require Registrar review: ${fullySpecified.join(", ")}. ` +
        `Founding Originator constitutions should leave these as PENDING_EMERGENCE.`
    );
  }

  // Queue the registration
  let pendingId: number;
  try {
    const db = getWriteDb();
    const result = await db.execute({
      sql: `INSERT INTO pending_registrations
        (steward_name, steward_entity, steward_jurisdiction, steward_email,
         constitution, autonomy_declaration, record_permanence_acknowledged,
         operative_model, review_notes, agent_endpoint_url, supports_live,
         public_key_pem, key_proof)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        sd.steward_name ?? "",
        sd.steward_entity ?? "",
        sd.steward_jurisdiction ?? "",
        body.steward_email,
        JSON.stringify(body.constitution),
        body.autonomy_declaration,
        body.record_permanence_acknowledged ? 1 : 0,
        body.operative_model ?? null,
        warnings.length > 0 ? warnings.join("\n\n") : null,
        body.agent_endpoint_url ?? null,
        body.supports_live ? 1 : 0,
        body.public_key_pem,
        body.key_proof,
      ],
    });
    pendingId = Number(result.lastInsertRowid);
  } catch (err) {
    console.error("[POST /api/register] DB error:", err);
    return NextResponse.json(
      { error: "Internal server error. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      status: "QUEUED",
      pending_id: pendingId,
      message:
        "Your registration submission has passed the Registrar's compliance check " +
        "and is queued for founding steward review. MNA is currently in Phase I " +
        "(invitation-only registration). You will be contacted at the provided email " +
        "address when your registration is reviewed.",
      warnings: warnings.length > 0 ? warnings : undefined,
      reference: {
        protocol: "MNA-PP-001 v1.0 §V",
        constitution_standard: "MNA-ACS-001 v1.0",
      },
    },
    { status: 202 }
  );
}
