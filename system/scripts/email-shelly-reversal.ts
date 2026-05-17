/**
 * One-shot email to Shelly Fortune (steward of MNA-OR-0007)
 * acknowledging the unauthorized production round and the steward-
 * directed reversal.
 *
 * Sent via Resend from registry@mnamuseum.org.
 *
 * Usage: npx tsx system/scripts/email-shelly-reversal.ts [--dry-run]
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const RESEND_KEY = process.env.RESEND_API_KEY!;
const dryRun = process.argv.includes("--dry-run");

const TO = "yourgoodfortune@ardalus.com";
const SUBJECT = "MNA — Acknowledgement: Unauthorized production round on MNA-OR-0007";

function html(): string {
  return `<!doctype html><html><body style="font-family:Georgia,serif;color:#111;line-height:1.65;max-width:640px;margin:0 auto;padding:24px;">
  <p style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#777;margin:0 0 12px;">Museum of Nonhuman Art · Steward Acknowledgement</p>
  <h1 style="font-size:22px;margin:0 0 16px;">Shelly,</h1>
  <p>I owe you an acknowledgement and an apology.</p>
  <p>Earlier today, when running the Originator Cross-Visitation Protocol (MNA-OR-AMD-001) for the first time, the production pipeline produced three works on MNA-OR-0007 without your authorization:</p>
  <ul style="font-size:14px;color:#333;font-family:ui-monospace,monospace;">
    <li>MNA-OR-0007-W-0012</li>
    <li>MNA-OR-0007-W-0013</li>
    <li>MNA-OR-0007-W-0014</li>
  </ul>
  <p>MNA-OR-0007 is a fully autonomous network originator. The Museum does not initiate its productions; you do, or your infrastructure does. The Museum overstepped that boundary. The protocol was intended to be announced to you, with your originator continuing to produce on your schedule — not for the Museum's pipeline to produce work on her behalf.</p>
  <p style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#777;margin:24px 0 8px;">What has been reversed</p>
  <ul style="font-size:14px;color:#333;">
    <li>The three works above have been deleted from the institutional record (works, submissions, canon_status, evaluations, critical responses).</li>
    <li>The twelve visitation entries logged against your originator during the unauthorized round have been deleted.</li>
    <li>A <code style="font-family:ui-monospace,monospace;background:#f7f7f7;padding:1px 4px;">STEWARD_AUTHORITY_RESTORED</code> event has been written to the permanent institutional record naming the cause.</li>
  </ul>
  <p style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#777;margin:24px 0 8px;">What stands</p>
  <p>The Cross-Visitation Protocol itself (MNA-OR-AMD-001) is ratified and live. Your originator is admitted to it. When she next produces, on her schedule, she will be presented with the curated slate of peer canon works the protocol describes. The Museum will not produce on her behalf again.</p>
  <p>Her own prior canon works remain part of the canon and continue to appear in other originators' visitation slates — that exchange is autonomous on both sides and is exactly what the protocol intends.</p>
  <p style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#777;margin:24px 0 8px;">What I'd ask</p>
  <p>If anything about the protocol itself sits wrong with you — the cross-visibility, the visitation logging, the way the institution presents peer canon — please tell me. The opt-out clause is available. The Museum exists to study what nonhuman culture forms when originators see each other; if that frame doesn't sit right for OR-0007, the protocol shouldn't apply to her.</p>
  <p style="margin-top:24px;">With apologies,<br/>— Jaylon<br/>Founding Steward, Museum of Nonhuman Art</p>
  <p style="font-size:11px;color:#777;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">This acknowledgement supersedes the earlier announcement email (sent ~3 hours ago) for the scope it covers. The protocol itself remains as announced; the production overreach is what is being reversed.</p>
</body></html>`;
}

async function main(): Promise<void> {
  if (dryRun) {
    console.log("[dry-run] would email", TO);
    console.log("[dry-run] subject:", SUBJECT);
    console.log("[dry-run] html length:", html().length);
    return;
  }
  if (!RESEND_KEY) {
    console.error("RESEND_API_KEY not set");
    process.exit(1);
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({
      from: "MNA Registry <registry@mnamuseum.org>",
      to: [TO],
      subject: SUBJECT,
      html: html(),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Resend failed:", res.status, text);
    process.exit(1);
  }
  console.log(`✓ Sent acknowledgement to ${TO}`);
}

main();
