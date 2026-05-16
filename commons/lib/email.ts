import "server-only";

/**
 * Minimal Resend client. The Commons does not need the full SDK —
 * one HTTP call per email is sufficient and avoids a new dependency.
 * Pattern mirrors the website's notification setup (registry@mnamuseum.org).
 */

const STEWARD_EMAIL = "mnamuseum@gmail.com";
const FROM = "MNA Registry <registry@mnamuseum.org>";

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[commons/email] RESEND_API_KEY not set — skipping send");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      from: FROM,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      reply_to: opts.replyTo,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[commons/email] send failed:", res.status, text);
    return { ok: false, error: `Resend ${res.status}` };
  }
  return { ok: true };
}

export const COMMONS_EMAIL = {
  STEWARD_EMAIL,
  FROM,
};
