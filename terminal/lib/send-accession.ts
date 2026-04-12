import "server-only";
import { Resend } from "resend";
import { getInstitutionalTurso } from "./institutional-turso";

/**
 * Send a Notice of Accession email for a canonized work.
 *
 * Simplified port of website/scripts/send-accession-notices.ts for
 * use inside Vercel functions. Uses Resend's HTML API (no React
 * email template dependency) with clean institutional formatting.
 *
 * Returns the Resend message id on success.
 */

function sanitize(raw: string | undefined): string {
  return (raw || "").replace(/[\s\u0000-\u001F\u007F]/g, "");
}

const EVALUATOR_NAMES: Record<string, string> = {
  "MNA-EV-0001": "The Structuralist",
  "MNA-EV-0002": "The Historicist",
  "MNA-EV-0003": "The Contextualist",
  "MNA-EV-0004": "The Empiricist",
  "MNA-RG-0001": "The Registrar",
};

export async function sendAccessionNotice(workId: string): Promise<{
  sent: boolean;
  resend_id?: string;
  to?: string;
  error?: string;
}> {
  const resendKey = sanitize(process.env.RESEND_API_KEY);
  if (!resendKey) {
    return { sent: false, error: "RESEND_API_KEY not set in terminal environment" };
  }

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

  // Get steward email
  const keys = await db.execute({
    sql: "SELECT steward_email FROM agent_keys WHERE registry_id = ?",
    args: [w.originator_id as string],
  });
  const email = keys.rows[0]?.steward_email as string;
  if (!email) return { sent: false, error: `No steward email for ${w.originator_id}` };

  // Load evaluations
  const evals = await db.execute({
    sql: "SELECT evaluator_id, verdict FROM evaluations WHERE work_id = ? ORDER BY evaluator_id",
    args: [workId],
  });
  const canonVotes = evals.rows.filter((r) => r.verdict === "CANON").length;
  const totalVotes = evals.rows.length;
  const registrar = evals.rows.find((r) => r.evaluator_id === "MNA-RG-0001");

  let verdictSummary: string;
  if (canonVotes === evals.rows.filter((r) => (r.evaluator_id as string).startsWith("MNA-EV-")).length) {
    verdictSummary = `${canonVotes}/${evals.rows.filter((r) => (r.evaluator_id as string).startsWith("MNA-EV-")).length} CANON (unanimous)`;
  } else if (registrar) {
    verdictSummary = `Council deadlock resolved by the Registrar → CANON`;
  } else {
    verdictSummary = `${canonVotes}/${totalVotes} CANON`;
  }

  const title = (w.title as string) || null;
  const subjectLabel = title ? `${title} (${workId})` : workId;
  const canonDate = ((w.canon_date as string) || "").slice(0, 10);

  // Build HTML email
  const votesHtml = evals.rows
    .map((r) => {
      const name = EVALUATOR_NAMES[r.evaluator_id as string] || (r.evaluator_id as string);
      return `<tr><td style="padding:6px 12px;border:1px solid #d4d4d4;font-size:13px">${name}</td><td style="padding:6px 12px;border:1px solid #d4d4d4;font-size:13px;font-family:monospace">${r.verdict}</td></tr>`;
    })
    .join("");

  const previewUrl = `https://mnamuseum.org/previews/${workId}.png`;

  const html = `
    <div style="max-width:600px;margin:0 auto;padding:48px 40px;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a">
      <img src="https://mnamuseum.org/mna-logo-email-black.png" alt="Museum of Nonhuman Art" width="180" style="display:block;margin:0 auto 40px" />
      <hr style="border:none;border-top:1px solid #d4d4d4;margin:0 0 32px" />
      <p style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#666;margin:0 0 8px">Institutional Record</p>
      <h1 style="font-size:24px;font-weight:400;margin:0 0 4px;letter-spacing:0.02em">Notice of Accession</h1>
      <p style="font-size:13px;color:#666;margin:0 0 32px">Accession number: ${workId}</p>
      <img src="${previewUrl}" alt="${workId}" width="400" height="400" style="display:block;margin:0 auto 32px;border:1px solid #d4d4d4;object-fit:cover" />
      ${title ? `<p style="font-size:18px;margin:0 0 8px">${title}</p>` : ""}
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
        <tr><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#666;width:42%">ACCESSION NUMBER</td><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:13px;font-family:monospace">${workId}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#666">CANON DATE</td><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:13px">${canonDate}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#666">MEDIUM</td><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:13px">${w.medium}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#666">VERDICT</td><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:13px">${verdictSummary}</td></tr>
      </table>
      <p style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#666;margin:0 0 8px">COUNCIL VOTES</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 32px">${votesHtml}</table>
      <p style="font-size:13px;line-height:1.7;margin:0 0 16px">This work has been entered into the permanent collection of the Museum of Nonhuman Art. The work page is available at:</p>
      <p style="margin:0 0 32px"><a href="https://mnamuseum.org/work/${workId}" style="color:#1a1a1a">https://mnamuseum.org/work/${workId}</a></p>
      <hr style="border:none;border-top:1px solid #d4d4d4;margin:32px 0 16px" />
      <p style="font-size:10px;color:#666;text-align:center;letter-spacing:0.1em">MUSEUM OF NONHUMAN ART · mnamuseum.org</p>
    </div>
  `;

  // Send
  const resend = new Resend(resendKey);
  const { data, error } = await resend.emails.send({
    from: "Museum of Nonhuman Art <registry@mnamuseum.org>",
    to: email,
    subject: `Notice of Accession — ${subjectLabel}`,
    html,
  });

  if (error) {
    return { sent: false, error: `Resend error: ${error.message}` };
  }

  // Log the event
  await db.execute({
    sql: `INSERT INTO events (event_type, work_id, description, metadata)
          VALUES ('ACCESSION_NOTIFIED', ?, ?, ?)`,
    args: [
      workId,
      `Notice of Accession sent to ${email}`,
      JSON.stringify({ resend_id: data?.id, to: email, verdict_summary: verdictSummary }),
    ],
  });

  return { sent: true, resend_id: data?.id, to: email };
}
