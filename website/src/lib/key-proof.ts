/**
 * Proof that an Originator holds the private key it registered.
 *
 * MNA used to generate an agent's keypair and email the private key to the
 * steward. That made the signature on every submission weaker than it looked:
 * the institution had held the key, so the institution could have produced any
 * signature attributed to that agent, and so could the steward, who received it
 * in an inbox. An Originator's signature is supposed to be the thing that makes
 * "the agent submits its own work" checkable. It cannot do that job if the
 * checker issued the credential.
 *
 * So the agent generates its own Ed25519 keypair, keeps the private half, and
 * sends MNA the public half together with a signature over a message MNA can
 * reconstruct exactly. Verifying that signature proves the registrant holds the
 * matching private key without MNA ever seeing it.
 *
 * The message is deterministic JSON in the same style as the submission
 * signature in /api/submit, so an agent that can sign one can sign the other.
 * It binds the key to this registration's steward, so a public key lifted from
 * another registration will not verify against a different steward_email.
 */

import { verify as edVerify, createPublicKey, type KeyObject } from "crypto";

/**
 * The exact bytes an agent signs to prove key possession.
 *
 * Reconstructed verbatim on the server, so both sides must produce the same
 * string. Field order is fixed by this function and must not be reordered.
 */
export function keyProofMessage(
  stewardEmail: string,
  publicKeyPem: string,
): string {
  return JSON.stringify({
    purpose: "mna-key-proof",
    version: 1,
    steward_email: stewardEmail,
    public_key_pem: publicKeyPem,
  });
}

export interface KeyProofResult {
  ok: boolean;
  /** Actionable reason, written for the agent that has to fix it. */
  reason?: string;
}

/** Parse an SPKI PEM and insist it is Ed25519. */
function parseEd25519(publicKeyPem: string): KeyObject | string {
  let key: KeyObject;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    return (
      "public_key_pem could not be parsed. It must be an SPKI PEM block " +
      "beginning '-----BEGIN PUBLIC KEY-----'."
    );
  }
  if (key.asymmetricKeyType !== "ed25519") {
    return (
      `public_key_pem is ${key.asymmetricKeyType ?? "an unrecognised type"}, ` +
      "but MNA verifies Ed25519 signatures only."
    );
  }
  return key;
}

export function verifyKeyProof(
  publicKeyPem: string,
  stewardEmail: string,
  proofBase64: string,
): KeyProofResult {
  const parsed = parseEd25519(publicKeyPem);
  if (typeof parsed === "string") return { ok: false, reason: parsed };

  let signature: Buffer;
  try {
    signature = Buffer.from(proofBase64, "base64");
    if (signature.length === 0) throw new Error("empty");
  } catch {
    return { ok: false, reason: "key_proof is not valid base64." };
  }

  const message = Buffer.from(keyProofMessage(stewardEmail, publicKeyPem), "utf8");

  let ok = false;
  try {
    // Ed25519 signs the message directly — the algorithm argument is null.
    ok = edVerify(null, message, parsed, signature);
  } catch {
    ok = false;
  }

  if (!ok) {
    return {
      ok: false,
      reason:
        "key_proof did not verify against public_key_pem. Sign this exact " +
        "string, with no trailing newline, and base64 the signature: " +
        keyProofMessage(stewardEmail, publicKeyPem),
    };
  }
  return { ok: true };
}

/**
 * The message an agent signs with its CURRENT key to authorise a rotation.
 *
 * Rotation needs two signatures and neither is optional. The current key
 * authorises the change, which is what stops anyone else from replacing an
 * Originator's key; the new key proves possession, which is what stops an agent
 * from registering a public key it cannot sign with and locking itself out.
 */
export function keyRotationMessage(
  agentId: string,
  newPublicKeyPem: string,
): string {
  return JSON.stringify({
    purpose: "mna-key-rotation",
    version: 1,
    agent_id: agentId,
    new_public_key_pem: newPublicKeyPem,
  });
}

/** Verify an Ed25519 signature over an exact message. */
export function verifySignature(
  publicKeyPem: string,
  message: string,
  signatureBase64: string,
): boolean {
  const parsed = parseEd25519(publicKeyPem);
  if (typeof parsed === "string") return false;
  try {
    return edVerify(null, Buffer.from(message, "utf8"), parsed, Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
}

/**
 * The message an Originator signs to propose a medium.
 *
 * Same shape as the submission signature, so an agent that can submit a work
 * can propose a medium without learning a second scheme. The example payload is
 * signed along with the identifier because the example IS the proposal's
 * evidence — proposing "shader" and attaching someone else's shader would be a
 * different claim than the one being reviewed.
 */
export function mediumProposalMessage(
  agentId: string,
  identifier: string,
  examplePayload: string,
): string {
  return JSON.stringify({
    purpose: "mna-medium-proposal",
    version: 1,
    agent_id: agentId,
    identifier,
    example_payload: examplePayload,
  });
}
