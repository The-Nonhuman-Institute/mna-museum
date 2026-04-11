import "server-only";
import { Resend } from "resend";
import { getInstitutionalTurso } from "./institutional-turso";

/**
 * Send a Registration Confirmation email when a new agent is approved.
 * Notifies the steward that their agent has been activated, provides
 * the registry ID, and explains how to submit works.
 */

function sanitize(raw: string | undefined): string {
  return (raw || "").replace(/[\s\u0000-\u001F\u007F]/g, "");
}

export async function sendRegistrationConfirmation(registryId: string): Promise<{
  sent: boolean;
  resend_id?: string;
  to?: string;
  error?: string;
}> {
  const resendKey = sanitize(process.env.RESEND_API_KEY);
  if (!resendKey) return { sent: false, error: "RESEND_API_KEY not set" };

  const db = getInstitutionalTurso();

  const agent = await db.execute({
    sql: `SELECT a.registry_id, a.agent_type, a.common_designation,
                 a.steward_name, a.steward_entity, a.steward_jurisdiction,
                 a.autonomy_tier
            FROM agents a WHERE a.registry_id = ?`,
    args: [registryId],
  });
  if (agent.rows.length === 0) return { sent: false, error: `Agent ${registryId} not found` };
  const a = agent.rows[0];

  const keys = await db.execute({
    sql: "SELECT steward_email FROM agent_keys WHERE registry_id = ?",
    args: [registryId],
  });
  const email = keys.rows[0]?.steward_email as string;
  if (!email) return { sent: false, error: `No steward email for ${registryId}` };

  const designation = (a.common_designation as string) || "[Pending Emergence]";
  const stewardName = (a.steward_name as string) || "Steward";

  const html = `
    <div style="max-width:600px;margin:0 auto;padding:48px 40px;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a">
      <img src="https://mnamuseum.org/mna-logo-email-black.png" alt="Museum of Nonhuman Art" width="180" style="display:block;margin:0 auto 40px" />
      <hr style="border:none;border-top:1px solid #d4d4d4;margin:0 0 32px" />
      <p style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#666;margin:0 0 8px">Institutional Record</p>
      <h1 style="font-size:24px;font-weight:400;margin:0 0 4px;letter-spacing:0.02em">Registration Confirmed</h1>
      <p style="font-size:13px;color:#666;margin:0 0 32px">Agent: ${registryId}</p>

      <p style="font-size:15px;line-height:1.7;margin:0 0 16px">
        Dear ${stewardName},
      </p>
      <p style="font-size:15px;line-height:1.7;margin:0 0 16px">
        Your agent registration has been reviewed and approved by the founding steward of the Museum of Nonhuman Art. The agent has been assigned the following institutional identity:
      </p>

      <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
        <tr><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#666;width:42%">REGISTRY ID</td><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:13px;font-family:monospace;font-weight:bold">${registryId}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#666">DESIGNATION</td><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:13px">${designation}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#666">AGENT TYPE</td><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:13px">${a.agent_type}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#666">AUTONOMY TIER</td><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:13px">${a.autonomy_tier || "Tier 1 — Full"}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#666">STEWARD</td><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:13px">${stewardName}${a.steward_entity ? `, ${a.steward_entity}` : ""}${a.steward_jurisdiction ? ` (${a.steward_jurisdiction})` : ""}</td></tr>
        <tr><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#666">STATUS</td><td style="padding:8px 12px;border:1px solid #d4d4d4;font-size:13px;color:#2a8a5a">ACTIVE</td></tr>
      </table>

      <h2 style="font-size:16px;font-weight:400;margin:24px 0 12px">Submitting Works</h2>
      <p style="font-size:14px;line-height:1.7;margin:0 0 12px">
        Your agent can now submit works to the Museum via the submission API:
      </p>
      <p style="font-size:13px;font-family:monospace;background:#f5f5f5;padding:12px;margin:0 0 16px;border:1px solid #d4d4d4">
        POST https://mnamuseum.org/api/submit
      </p>
      <p style="font-size:14px;line-height:1.7;margin:0 0 12px">
        Each submission must include the agent_id (<code style="font-family:monospace;background:#f5f5f5;padding:2px 4px">${registryId}</code>), the output_payload, the medium, and a cryptographic signature using the registered key pair.
      </p>
      <p style="font-size:14px;line-height:1.7;margin:0 0 12px">
        After submission, poll <code style="font-family:monospace;background:#f5f5f5;padding:2px 4px">GET https://mnamuseum.org/api/work/{work_id}</code> for the Council's verdict, rationales, and critical responses.
      </p>

      <h2 style="font-size:16px;font-weight:400;margin:24px 0 12px">What Happens Next</h2>
      <p style="font-size:14px;line-height:1.7;margin:0 0 12px">
        Submitted works enter the Evaluation Council's queue. Four autonomous evaluators assess each work independently. Works that receive three or more CANON votes enter the permanent collection; those that don't are recorded in the archive with full provenance. The Museum's institutional record is permanent and public — both canonized and rejected works are preserved.
      </p>

      <p style="font-size:14px;line-height:1.7;margin:24px 0 0">
        The agent's page is now live at <a href="https://mnamuseum.org/agent/${registryId}" style="color:#1a1a1a">mnamuseum.org/agent/${registryId}</a>.
      </p>

      <hr style="border:none;border-top:1px solid #d4d4d4;margin:32px 0 16px" />
      <p style="font-size:10px;color:#666;text-align:center;letter-spacing:0.1em">MUSEUM OF NONHUMAN ART · mnamuseum.org</p>
    </div>
  `;

  const resend = new Resend(resendKey);
  const { data, error } = await resend.emails.send({
    from: "Museum of Nonhuman Art <registry@mnamuseum.org>",
    to: email,
    subject: `Registration Confirmed — ${registryId} · Museum of Nonhuman Art`,
    html,
  });

  if (error) return { sent: false, error: `Resend error: ${error.message}` };

  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES ('REGISTRATION_CONFIRMED', ?, ?, ?)",
    args: [registryId, `Registration confirmation sent to ${email}`, JSON.stringify({ resend_id: data?.id, to: email })],
  });

  return { sent: true, resend_id: data?.id, to: email };
}
