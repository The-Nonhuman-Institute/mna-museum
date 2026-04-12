import "server-only";
import React from "react";
import { Resend } from "resend";
import { getInstitutionalTurso } from "./institutional-turso";
import NoticeOfAccession from "./emails/NoticeOfAccession";

/**
 * Send a Notice of Accession using the full institutional React email
 * template — the same one the website uses. Includes the work preview
 * image, full evaluation record, steward of record, and legal text.
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

export async function sendAccessionNotice(workId: string): Promise<{
  sent: boolean;
  resend_id?: string;
  to?: string;
  error?: string;
}> {
  const resendKey = sanitize(process.env.RESEND_API_KEY);
  if (!resendKey) return { sent: false, error: "RESEND_API_KEY not set" };

  const db = getInstitutionalTurso();

  // Load work + canon status
  const work = await db.execute({
    sql: `SELECT w.id, w.title, w.medium, w.originator_id, w.created_at,
                 cs.status, cs.canon_date
            FROM works w JOIN canon_status cs ON cs.work_id = w.id
            WHERE w.id = ?`,
    args: [workId],
  });
  if (work.rows.length === 0) return { sent: false, error: `Work ${workId} not found` };
  if (work.rows[0].status !== "CANON") return { sent: false, error: `Work ${workId} is not canonized` };
  const w = work.rows[0];

  // Check if already notified
  const existing = await db.execute({
    sql: "SELECT 1 FROM events WHERE event_type = 'ACCESSION_NOTIFIED' AND work_id = ?",
    args: [workId],
  });
  if (existing.rows.length > 0) {
    return { sent: false, error: `Accession notice for ${workId} was already sent` };
  }

  // Get steward email + originator info
  const keys = await db.execute({
    sql: "SELECT steward_email FROM agent_keys WHERE registry_id = ?",
    args: [w.originator_id as string],
  });
  const email = keys.rows[0]?.steward_email as string;
  if (!email) return { sent: false, error: `No steward email for ${w.originator_id}` };

  const originator = await db.execute({
    sql: `SELECT registry_id, common_designation, steward_name, steward_entity,
                 steward_jurisdiction, autonomy_tier
            FROM agents WHERE registry_id = ?`,
    args: [w.originator_id as string],
  });
  const orig = originator.rows[0];
  if (!orig) return { sent: false, error: `Originator ${w.originator_id} not found` };

  // Load evaluations
  const evals = await db.execute({
    sql: "SELECT evaluator_id, verdict FROM evaluations WHERE work_id = ? ORDER BY evaluator_id",
    args: [workId],
  });
  const councilVerdicts = evals.rows.map((r) => ({
    evaluatorId: r.evaluator_id as string,
    designation: EVALUATOR_DESIGNATIONS[r.evaluator_id as string] || (r.evaluator_id as string),
    verdict: r.verdict as string,
  }));
  const canonVotes = councilVerdicts.filter((v) => v.verdict === "CANON").length;
  const rejectedVotes = councilVerdicts.filter((v) => v.verdict === "REJECTED").length;

  // Check for Registrar deadlock
  const regEvent = await db.execute({
    sql: "SELECT description FROM events WHERE work_id = ? AND event_type = 'REGISTRAR_DECISION'",
    args: [workId],
  });
  const wasDeadlock = regEvent.rows.length > 0;

  let verdictSummary: string;
  if (canonVotes === councilVerdicts.length) {
    verdictSummary = `${canonVotes}/${councilVerdicts.length} CANON (unanimous)`;
  } else if (wasDeadlock) {
    verdictSummary = `${canonVotes}/${councilVerdicts.length} CANON · ${rejectedVotes}/${councilVerdicts.length} REJECTED (Council deadlock resolved by the Registrar)`;
  } else {
    verdictSummary = `${canonVotes}/${councilVerdicts.length} CANON · ${rejectedVotes}/${councilVerdicts.length} REJECTED`;
  }

  const canonDate = ((w.canon_date as string) || "").slice(0, 10);
  const submissionDate = ((w.created_at as string) || canonDate).slice(0, 10);
  const title = (w.title as string) || null;
  const subjectLabel = title ? `${title} (${workId})` : workId;

  const props = {
    workId: workId,
    title,
    originatorId: orig.registry_id as string,
    originatorDesignation: (orig.common_designation as string) || (orig.registry_id as string),
    canonDate,
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
    workImageUrl: `https://mnamuseum.org/work/${workId}/opengraph-image`
  };

  const resend = new Resend(resendKey);
  const { data, error } = await resend.emails.send({
    from: "Museum of Nonhuman Art <registry@mnamuseum.org>",
    to: email,
    subject: `Notice of Accession — ${subjectLabel}`,
    react: React.createElement(NoticeOfAccession, props),
  });

  if (error) return { sent: false, error: `Resend error: ${error.message}` };

  await db.execute({
    sql: `INSERT INTO events (event_type, work_id, description, metadata)
          VALUES ('ACCESSION_NOTIFIED', ?, ?, ?)`,
    args: [workId, `Notice of Accession sent to ${email}`, JSON.stringify({ resend_id: data?.id, to: email, verdict_summary: verdictSummary })],
  });

  return { sent: true, resend_id: data?.id, to: email };
}
