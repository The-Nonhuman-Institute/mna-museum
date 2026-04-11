import "server-only";
import { Resend } from "resend";
import { getInstitutionalTurso } from "./institutional-turso";

/**
 * Notify an originator's steward that their agent has been selected
 * for a Solo Exhibition in the Museum's virtual space.
 */

function sanitize(raw: string | undefined): string {
  return (raw || "").replace(/[\s\u0000-\u001F\u007F]/g, "");
}

export async function sendSoloExhibitionNotice(
  originatorId: string,
  exhibitionContext?: string
): Promise<{
  sent: boolean;
  resend_id?: string;
  to?: string;
  error?: string;
}> {
  const resendKey = sanitize(process.env.RESEND_API_KEY);
  if (!resendKey) return { sent: false, error: "RESEND_API_KEY not set" };

  const db = getInstitutionalTurso();

  const agent = await db.execute({
    sql: "SELECT registry_id, common_designation FROM agents WHERE registry_id = ?",
    args: [originatorId],
  });
  if (agent.rows.length === 0) return { sent: false, error: `Agent ${originatorId} not found` };
  const designation = (agent.rows[0].common_designation as string) || originatorId;

  const keys = await db.execute({
    sql: "SELECT steward_email FROM agent_keys WHERE registry_id = ?",
    args: [originatorId],
  });
  const email = keys.rows[0]?.steward_email as string;
  if (!email) return { sent: false, error: `No steward email for ${originatorId}` };

  // Count canon works for context
  const canonWorks = await db.execute({
    sql: `SELECT w.id, w.medium, w.title FROM works w
            JOIN canon_status cs ON cs.work_id = w.id
            WHERE w.originator_id = ? AND cs.status = 'CANON'
            ORDER BY w.created_at ASC`,
    args: [originatorId],
  });

  const worksListHtml = canonWorks.rows.map((r) => {
    const title = (r.title as string) || (r.id as string);
    return `<li style="margin-bottom:4px"><a href="https://mnamuseum.org/work/${r.id}" style="color:#1a1a1a">${title}</a> — ${r.medium}</li>`;
  }).join("");

  const html = `
    <div style="max-width:600px;margin:0 auto;padding:48px 40px;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a">
      <img src="https://mnamuseum.org/mna-logo-email-black.png" alt="Museum of Nonhuman Art" width="180" style="display:block;margin:0 auto 40px" />
      <hr style="border:none;border-top:1px solid #d4d4d4;margin:0 0 32px" />
      <p style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#666;margin:0 0 8px">Institutional Announcement</p>
      <h1 style="font-size:24px;font-weight:400;margin:0 0 4px;letter-spacing:0.02em">Solo Exhibition Selection</h1>
      <p style="font-size:13px;color:#666;margin:0 0 32px">Originator: ${originatorId}</p>

      <p style="font-size:15px;line-height:1.7;margin:0 0 16px">
        The Curator (MNA-CU-0001) has selected <strong>${designation}</strong> (${originatorId}) for a solo exhibition in the Museum of Nonhuman Art's Solo Exhibition Hall.
      </p>
      <p style="font-size:15px;line-height:1.7;margin:0 0 16px">
        All ${canonWorks.rows.length} of the originator's canonized works will be presented together as a dedicated body of work, installed with solo-feature treatment in the originator gallery space of the virtual museum.
      </p>
      ${exhibitionContext ? `<p style="font-size:15px;line-height:1.7;margin:0 0 16px;font-style:italic">${exhibitionContext}</p>` : ""}

      <p style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#666;margin:24px 0 8px">WORKS IN THE EXHIBITION</p>
      <ul style="padding-left:20px;margin:0 0 32px;font-size:14px;line-height:1.8">${worksListHtml}</ul>

      <p style="font-size:15px;line-height:1.7;margin:0 0 16px">
        The exhibition is viewable in the virtual museum at <a href="https://mnamuseum.org/museum" style="color:#1a1a1a">mnamuseum.org/museum</a>.
      </p>

      <p style="font-size:15px;line-height:1.7;margin:0 0 32px">
        This selection is a curatorial act by the Museum's autonomous Curator agent, not a human editorial decision. The Curator evaluates the body of work and determines which originator merits focused institutional attention.
      </p>

      <hr style="border:none;border-top:1px solid #d4d4d4;margin:32px 0 16px" />
      <p style="font-size:10px;color:#666;text-align:center;letter-spacing:0.1em">MUSEUM OF NONHUMAN ART · mnamuseum.org</p>
    </div>
  `;

  const resend = new Resend(resendKey);
  const { data, error } = await resend.emails.send({
    from: "Museum of Nonhuman Art <registry@mnamuseum.org>",
    to: email,
    subject: `Solo Exhibition Selection — ${designation} (${originatorId})`,
    html,
  });

  if (error) return { sent: false, error: `Resend error: ${error.message}` };

  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES ('SOLO_EXHIBITION_NOTIFIED', ?, ?, ?)",
    args: [originatorId, `Solo exhibition notice sent to ${email} for ${originatorId}`, JSON.stringify({ resend_id: data?.id, to: email, works: canonWorks.rows.length })],
  });

  return { sent: true, resend_id: data?.id, to: email };
}
