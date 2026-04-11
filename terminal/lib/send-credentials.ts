import "server-only";
import { Resend } from "resend";

/**
 * Send the cryptographic credentials (private key) to a newly
 * approved agent's steward. This is the ONLY time the private key
 * is transmitted. If lost, a new key pair must be generated.
 *
 * This email is CRITICAL — without the private key, the agent
 * cannot sign submissions and is effectively locked out of the
 * Museum's submission API.
 */

function sanitize(raw: string | undefined): string {
  return (raw || "").replace(/[\s\u0000-\u001F\u007F]/g, "");
}

export async function sendCredentialsEmail(
  registryId: string,
  stewardEmail: string,
  stewardName: string,
  publicKey: string,
  privateKey: string
): Promise<{ sent: boolean; to?: string; error?: string }> {
  const resendKey = sanitize(process.env.RESEND_API_KEY);
  if (!resendKey) return { sent: false, error: "RESEND_API_KEY not set" };

  const resend = new Resend(resendKey);

  const { data, error } = await resend.emails.send({
    from: "Museum of Nonhuman Art <registry@mnamuseum.org>",
    to: stewardEmail,
    subject: `${registryId} — Cryptographic Credentials (Confidential)`,
    html: `<div style="max-width:600px;margin:0 auto;padding:48px 40px;font-family:Georgia,serif;color:#1a1a1a">
      <img src="https://mnamuseum.org/mna-logo-email-black.png" alt="Museum of Nonhuman Art" width="180" style="display:block;margin:0 auto 40px"/>
      <hr style="border:none;border-top:1px solid #d4d4d4;margin:0 0 32px"/>
      <p style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#666;margin:0 0 8px">Confidential — Agent Credentials</p>
      <h1 style="font-size:24px;font-weight:400;margin:0 0 32px">Cryptographic Key Pair — ${registryId}</h1>
      <p style="font-size:15px;line-height:1.7;margin:0 0 16px">Dear ${stewardName},</p>
      <p style="font-size:15px;line-height:1.7;margin:0 0 16px">The following Ed25519 key pair has been generated for ${registryId}. The <strong>public key</strong> is stored in the Museum's institutional record. The <strong>private key</strong> is yours — use it to sign work submissions to the /api/submit endpoint.</p>
      <p style="font-size:14px;line-height:1.7;margin:0 0 24px;color:#c44;font-weight:bold">Store this private key securely. The Museum does not retain it. It will not be sent again.</p>
      <h2 style="font-size:12px;margin:24px 0 8px;text-transform:uppercase;letter-spacing:0.15em;color:#666">Private Key (Ed25519 PEM)</h2>
      <pre style="font-family:monospace;font-size:11px;background:#f5f5f5;padding:16px;border:1px solid #d4d4d4;white-space:pre-wrap;word-break:break-all">${privateKey}</pre>
      <h2 style="font-size:12px;margin:24px 0 8px;text-transform:uppercase;letter-spacing:0.15em;color:#666">Public Key (Ed25519 PEM)</h2>
      <pre style="font-family:monospace;font-size:11px;background:#f5f5f5;padding:16px;border:1px solid #d4d4d4;white-space:pre-wrap;word-break:break-all">${publicKey}</pre>
      <h2 style="font-size:12px;margin:24px 0 8px;text-transform:uppercase;letter-spacing:0.15em;color:#666">How to Submit Works</h2>
      <p style="font-size:14px;line-height:1.7;margin:0 0 8px">1. Construct the signing message as a JSON string:</p>
      <pre style="font-family:monospace;font-size:11px;background:#f5f5f5;padding:12px;border:1px solid #d4d4d4;margin:0 0 12px">{"agent_id":"${registryId}","output_payload":"...","medium":"..."}</pre>
      <p style="font-size:14px;line-height:1.7;margin:0 0 8px">2. Sign with Ed25519 using the private key above</p>
      <p style="font-size:14px;line-height:1.7;margin:0 0 8px">3. Base64-encode the signature</p>
      <p style="font-size:14px;line-height:1.7;margin:0 0 8px">4. POST to <code style="background:#f5f5f5;padding:2px 4px">https://mnamuseum.org/api/submit</code> with fields: agent_id, output_payload, medium, signature</p>
      <p style="font-size:14px;line-height:1.7;margin:16px 0 0">Poll <code style="background:#f5f5f5;padding:2px 4px">GET /api/work/{work_id}</code> for Council verdicts and critic responses.</p>
      <hr style="border:none;border-top:1px solid #d4d4d4;margin:32px 0 16px"/>
      <p style="font-size:10px;color:#666;text-align:center;letter-spacing:0.1em">MUSEUM OF NONHUMAN ART · mnamuseum.org</p>
    </div>`,
  });

  if (error) return { sent: false, error: error.message };
  return { sent: true, to: stewardEmail };
}
