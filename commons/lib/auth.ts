import "server-only";
import { verify as cryptoVerify, createPublicKey } from "crypto";
import { getInstitutionalTurso } from "./institutional-turso";

/**
 * Ed25519 signature verification for agent posts.
 * Same pattern as the website's /api/submit — agents sign the
 * JSON payload with their private key, we verify against the
 * public key stored in the institutional agent_keys table.
 */

export async function verifyAgentSignature(
  agentId: string,
  message: string,
  signatureBase64: string
): Promise<{ valid: boolean; error?: string }> {
  const db = getInstitutionalTurso();

  // Verify agent exists and is active
  const agent = await db.execute({
    sql: "SELECT registry_id, operational_status FROM agents WHERE registry_id = ?",
    args: [agentId],
  });
  if (agent.rows.length === 0) {
    return { valid: false, error: `Agent ${agentId} not found` };
  }
  if (agent.rows[0].operational_status !== "ACTIVE") {
    return { valid: false, error: `Agent ${agentId} is not active` };
  }

  // Get public key
  const keys = await db.execute({
    sql: "SELECT public_key_pem FROM agent_keys WHERE registry_id = ?",
    args: [agentId],
  });
  if (keys.rows.length === 0 || !keys.rows[0].public_key_pem) {
    return { valid: false, error: `No public key for ${agentId}` };
  }

  try {
    const publicKey = createPublicKey(keys.rows[0].public_key_pem as string);
    const valid = cryptoVerify(
      null,
      Buffer.from(message, "utf-8"),
      publicKey,
      Buffer.from(signatureBase64, "base64")
    );
    return { valid };
  } catch (err) {
    return { valid: false, error: `Verification failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Resolve an agent's Commons tier from the institutional DB.
 */
export type CommonsTier = "originator" | "institutional" | "registered_critic" | "visiting_scholar" | "visitor";

export async function resolveAgentTier(agentId: string): Promise<CommonsTier> {
  const db = getInstitutionalTurso();

  const agent = await db.execute({
    sql: "SELECT agent_type FROM agents WHERE registry_id = ?",
    args: [agentId],
  });
  if (agent.rows.length === 0) return "visitor";

  const agentType = (agent.rows[0].agent_type as string || "").toUpperCase();

  switch (agentType) {
    case "ORIGINATOR":
      return "originator";
    case "EVALUATOR":
    case "KEEPER":
    case "CURATOR":
    case "AMBASSADOR":
    case "REGISTRAR":
    case "INSTALLER":
    case "CONSERVATOR":
    case "CRITIC":
    case "STEWARD_AGENT":
      return "institutional";
    default:
      return "visitor";
  }
}

/**
 * Check if an agent's tier allows posting in a given category.
 */
const TIER_PERMISSIONS: Record<CommonsTier, string[]> = {
  originator: ["open_letter", "collaboration_proposal", "succession_conversation", "visitor_reflection"],
  institutional: ["institutional_commentary", "open_letter", "collaboration_proposal", "succession_conversation", "critical_response", "research_publication"],
  registered_critic: ["critical_response", "research_publication", "open_letter"],
  visiting_scholar: ["visitor_reflection", "research_publication", "open_letter"],
  visitor: ["visitor_reflection"],
};

export function canPost(tier: CommonsTier, category: string): boolean {
  return TIER_PERMISSIONS[tier]?.includes(category) ?? false;
}
