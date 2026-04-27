import "server-only";
import React from "react";
import { Resend } from "resend";
import { getInstitutionalTurso } from "./institutional-turso";
import NoticeOfRejection from "./emails/NoticeOfRejection";

/**
 * Send a Notice of Rejection using the full institutional React email
 * template — same quality as accession notices.
 */

function sanitize(raw: string | undefined): string {
  return (raw || "").replace(/[\s\u0000-\u001F\u007F]/g, "");
}

const EVALUATOR_DESIGNATIONS: Record<string, string> = {
  "MNA-EV-0001": "Structuralist",
  "MNA-EV-0002": "Historicist",
  "MNA-EV-0003": "Contextualist",
  "MNA-EV-0004": "Empiricist",
};

export async function sendRejectionNotice(workId: string): Promise<{
  sent: boolean;
  resend_id?: string;
  to?: string;
  error?: string;
}> {
  const resendKey = sanitize(process.env.RESEND_API_KEY);
  if (!resendKey) return { sent: false, error: "RESEND_API_KEY not set" };

  const db = getInstitutionalTurso();

  const work = await db.execute({
    sql: `SELECT w.id, w.title, w.medium, w.originator_id, w.created_at,
                 cs.status, cs.canon_date
            FROM works w JOIN canon_status cs ON cs.work_id = w.id WHERE w.id = ?`,
    args: [workId],
  });
  if (work.rows.length === 0) return { sent: false, error: `Work ${workId} not found` };
  if (work.rows[0].status !== "REJECTED") return { sent: false, error: `Work ${workId} is not rejected` };
  const w = work.rows[0];

  const existing = await db.execute({
    sql: "SELECT 1 FROM events WHERE event_type = 'REJECTION_NOTIFIED' AND work_id = ?",
    args: [workId],
  });
  if (existing.rows.length > 0) return { sent: false, error: `Rejection notice already sent for ${workId}` };

  const keys = await db.execute({
    sql: "SELECT steward_email FROM agent_keys WHERE registry_id = ?",
    args: [w.originator_id as string],
  });
  const email = keys.rows[0]?.steward_email as string;
  if (!email) return { sent: false, error: `No steward email for ${w.originator_id}` };

  const originator = await db.execute({
    sql: "SELECT registry_id, common_designation, steward_name, steward_entity, steward_jurisdiction, autonomy_tier FROM agents WHERE registry_id = ?",
    args: [w.originator_id as string],
  });
  const orig = originator.rows[0];
  if (!orig) return { sent: false, error: `Originator ${w.originator_id} not found` };

  const evals = await db.execute({
    sql: "SELECT evaluator_id, verdict, rationale FROM evaluations WHERE work_id = ? AND evaluator_id LIKE 'MNA-EV-%' ORDER BY evaluator_id",
    args: [workId],
  });
  const councilVerdicts = evals.rows.map((r) => {
    const raw = String(r.rationale ?? "").trim().replace(/\s+/g, " ");
    const rationale =
      raw.length <= 220
        ? raw
        : (() => {
            const cut = raw.slice(0, 220);
            const lastSpace = cut.lastIndexOf(" ");
            return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + "…";
          })();
    return {
      evaluatorId: r.evaluator_id as string,
      designation:
        EVALUATOR_DESIGNATIONS[r.evaluator_id as string] ||
        (r.evaluator_id as string),
      verdict: r.verdict as string,
      rationale,
    };
  });
  const rejectedVotes = councilVerdicts.filter((v) => v.verdict === "REJECTED").length;
  const canonVotes = councilVerdicts.filter((v) => v.verdict === "CANON").length;
  const verdictSummary = `${rejectedVotes}/${councilVerdicts.length} REJECTED · ${canonVotes}/${councilVerdicts.length} CANON`;

  const rejectionDate = ((w.canon_date as string) || "").slice(0, 10);
  const submissionDate = ((w.created_at as string) || "").slice(0, 10);
  const title = (w.title as string) || null;
  const subjectLabel = title ? `${title} (${workId})` : workId;

  const props = {
    workId,
    originatorId: orig.registry_id as string,
    originatorDesignation: (orig.common_designation as string) || (orig.registry_id as string),
    rejectionDate,
    medium: (w.medium as string) || "unknown",
    verdictSummary,
    workUrl: `https://mnamuseum.org/work/${workId}`,
    stewardName: (orig.steward_name as string) || "Steward",
    stewardEntity: (orig.steward_entity as string) || "",
    stewardJurisdiction: (orig.steward_jurisdiction as string) || "",
    constitutionVersion: "1.0",
    autonomyTier: (orig.autonomy_tier as string) || "Tier 1 — Full",
    submissionDate,
    councilVerdicts,
    workImageUrl: `https://mnamuseum.org/previews/${workId}.png`
  };

  const resend = new Resend(resendKey);
  const { data, error } = await resend.emails.send({
    from: "Museum of Nonhuman Art <registry@mnamuseum.org>",
    to: email,
    subject: `Notice of Evaluation — ${subjectLabel} — Not Canonized`,
    react: React.createElement(NoticeOfRejection, props),
  });

  if (error) return { sent: false, error: `Resend error: ${error.message}` };

  await db.execute({
    sql: "INSERT INTO events (event_type, work_id, description, metadata) VALUES ('REJECTION_NOTIFIED', ?, ?, ?)",
    args: [workId, `Notice of rejection sent to ${email}`, JSON.stringify({ resend_id: data?.id, to: email })],
  });

  return { sent: true, resend_id: data?.id, to: email };
}
