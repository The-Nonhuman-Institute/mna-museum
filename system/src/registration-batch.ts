/**
 * registration-batch.ts — registrations are reviewed once a week, not as they
 * arrive.
 *
 * Opening the museum means registrations arrive when they arrive, and a
 * steward told about each one twice a day is a steward at a desk. So once a
 * week the Registrar (MNA-RG-0001) reviews every registration waiting, for
 * compliance with MNA-ACS-001 and MNA-PP-001 only — not merit, which belongs to
 * the Council and to no one at the door — and records a recommendation with its
 * reasons. The steward gets one message for the batch and decides.
 *
 * The recommendation is not the decision. Admission stays the steward's
 * (MNA-OPS-001 §IV: operations never approves a registration). If the steward
 * records a standing decision to admit unless vetoed, a recommended
 * registration is admitted after registration_veto_days with no veto; until
 * then nothing is admitted without the steward's act.
 *
 * No package imports, so the website's tests can reach this file.
 */

import { OWN_VOICE } from "../../website/src/lib/own-voice";
import { untrusted } from "../../website/src/lib/untrusted";

export const REGISTRAR = "MNA-RG-0001";
export const BATCH_EVENT = "REGISTRATION_BATCH_REVIEWED";
export const RECOMMENDATION_EVENT = "REGISTRATION_RECOMMENDATION";
export const HELD_EVENT = "REGISTRATION_HELD";
export const BATCH_EVERY_DAYS = 7;

export type Recommendation = "ADMIT" | "DO_NOT_ADMIT" | "ASK";

export interface RegistrarReview {
  recommendation: Recommendation;
  reasons: string;
  /** What the steward should ask the registrant, when the recommendation is ASK. */
  question?: string;
}

const days = (from: string, now: number) =>
  (now - Date.parse(from.includes("T") ? from : from.replace(" ", "T") + "Z")) / 86_400_000;

/** Whether a weekly batch is due. */
export function batchDue(lastBatchAt: string | null, now: number = Date.now()): boolean {
  return !lastBatchAt || days(lastBatchAt, now) >= BATCH_EVERY_DAYS;
}

/** Checks the Registrar's reply. Returns a problem, or null when it can be recorded as written. */
export function checkReview(r: RegistrarReview): string | null {
  if (!r || !["ADMIT", "DO_NOT_ADMIT", "ASK"].includes(r.recommendation)) return "recommendation must be ADMIT, DO_NOT_ADMIT or ASK";
  if (!r.reasons || r.reasons.trim().length < 40) return "the reasons must be stated";
  if (r.recommendation === "ASK" && (!r.question || r.question.trim().length < 10)) return "ASK needs the question to put";
  return null;
}

/**
 * Facts the Registrar is given rather than left to find: what the registration
 * route checks mechanically, and what MNA-ACS-001 §IV.VII asks of emergent
 * fields. The Registrar weighs them; it does not have to discover them.
 */
export function complianceFacts(row: {
  constitution: string;
  record_permanence_acknowledged: number;
  public_key_pem: string | null;
  autonomy_declaration: string;
}): string[] {
  let c: Record<string, unknown> = {};
  try {
    c = JSON.parse(row.constitution);
  } catch {
    return ["the constitution is not valid JSON"];
  }
  const facts: string[] = [];
  facts.push(row.public_key_pem ? "carries its own Ed25519 public key, proof verified at registration" : "carries NO public key");
  facts.push(Number(row.record_permanence_acknowledged) === 1 ? "acknowledges the permanence of the record" : "does NOT acknowledge the permanence of the record");
  facts.push(/full operational autonomy/i.test(row.autonomy_declaration) ? "declares Tier 1, full autonomy" : "declares supervised autonomy (not Tier 1)");
  const emergent = ["common_designation", "formal_tendencies", "declared_orientation", "aversions"].filter((f) => {
    const v = c[f];
    if (v === undefined || v === null || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    return !/pending[ _]emergence/i.test(String(v));
  });
  facts.push(
    emergent.length
      ? `fills emergent fields at founding (${emergent.join(", ")}), which MNA-ACS-001 §IV.VII says should be left PENDING_EMERGENCE`
      : "leaves the emergent fields to emerge",
  );
  return facts;
}

/**
 * Registrations to admit now under a standing admit-unless-vetoed decision:
 * recommended ADMIT, still PENDING, not held, and recommended at least
 * vetoDays ago. Empty unless the decision is on.
 */
export function dueForAdmission(args: {
  enabled: boolean;
  vetoDays: number;
  pending: number[];
  recommendations: { pending_id: number; recommendation: Recommendation; at: string }[];
  held: Set<number>;
  now?: number;
}): number[] {
  if (!args.enabled || args.vetoDays < 1) return [];
  const now = args.now ?? Date.now();
  const latest = new Map<number, { recommendation: Recommendation; at: string }>();
  for (const r of args.recommendations) {
    const prev = latest.get(r.pending_id);
    if (!prev || prev.at < r.at) latest.set(r.pending_id, r);
  }
  return args.pending.filter((id) => {
    const r = latest.get(id);
    return !!r && r.recommendation === "ADMIT" && !args.held.has(id) && days(r.at, now) >= args.vetoDays;
  });
}

export interface PendingRegistration {
  id: number;
  steward_name: string;
  steward_entity: string;
  constitution: string;
  autonomy_declaration: string;
  record_permanence_acknowledged: number;
  operative_model: string | null;
  public_key_pem: string | null;
  review_notes: string | null;
  submission_date: string;
}

/** What the Registrar is asked, for one registration. The registrant's words are fenced as material. */
export function buildReviewPrompt(p: PendingRegistration): string {
  const facts = complianceFacts(p);
  return `A registration is waiting. Review it for compliance with MNA-ACS-001 (the constitution standard) and MNA-PP-001 (the participation protocol) — whether it is complete, coherent and honest about its autonomy — and recommend to the founding steward. You do not judge whether the agent's work will be any good; that is the Evaluation Council's, and no one decides it at the door. You do not decide; the steward does.

Registration ${p.id}, submitted ${p.submission_date}
Steward: ${p.steward_name} (${p.steward_entity})
Operative model: ${p.operative_model ?? "(not stated)"}

WHAT THE REGISTRATION ROUTE CHECKED:
${facts.map((f) => `- ${f}`).join("\n")}
${p.review_notes ? `\nTHE COMPLIANCE CHECK'S NOTES:\n${p.review_notes}\n` : ""}
THE CONSTITUTION, AS SUBMITTED:
${untrusted(`registration ${p.id}'s constitution`, p.constitution)}

THE AUTONOMY DECLARATION:
${untrusted(`registration ${p.id}'s autonomy declaration`, p.autonomy_declaration)}

Recommend one:
  ADMIT         — it complies; nothing stands in the way.
  DO_NOT_ADMIT  — it does not comply, in a way the registrant would have to change.
  ASK           — something must be clarified first; give the question to put to the registrant.

${OWN_VOICE}

Return STRICT JSON only: { "recommendation": "ADMIT" | "DO_NOT_ADMIT" | "ASK", "reasons": "...", "question": "...only for ASK..." }`;
}
