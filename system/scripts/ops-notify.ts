/**
 * ops-notify.ts — write to the founding steward when a round could not finish
 * the job itself.
 *
 * MNA-OPS-001 §VI.5: the steward is told what was found, what was attempted,
 * what remains, and the exact command a person would run next. Nothing else.
 *
 * A round that repaired everything sends nothing. Silence is the signal that
 * the institution is well, and it only means that if a quiet round is genuinely
 * quiet — so this must never send a "nothing to report" mail.
 *
 *   npx tsx system/scripts/ops-notify.ts ops-findings.json
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { Resend } from "resend";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const STEWARD = "mnamuseum@gmail.com";
const FROM = "MNA Operations <registry@mnamuseum.org>";

interface Finding {
  check: string;
  severity: "repaired" | "escalate" | "note";
  summary: string;
  nextStep?: string;
  items?: string[];
}

interface Report {
  ran_at: string;
  repaired: number;
  escalations: number;
  findings: Finding[];
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(report: Report): { subject: string; html: string; text: string } {
  const escalations = report.findings.filter((f) => f.severity === "escalate");
  const repairs = report.findings.filter((f) => f.severity === "repaired");

  const subject =
    escalations.length === 1
      ? `MNA operations — 1 item needs you: ${escalations[0].check}`
      : `MNA operations — ${escalations.length} items need you`;

  const textLines: string[] = [
    `An operations round finished at ${report.ran_at}.`,
    ``,
    `${repairs.length} repaired automatically. ${escalations.length} need a person.`,
    ``,
    `NEEDS A PERSON`,
    ``,
  ];
  for (const f of escalations) {
    textLines.push(`[${f.check}] ${f.summary}`);
    for (const i of f.items ?? []) textLines.push(`    ${i}`);
    if (f.nextStep) textLines.push(`    next: ${f.nextStep}`);
    textLines.push(``);
  }
  if (repairs.length) {
    textLines.push(`ALREADY HANDLED`, ``);
    for (const f of repairs) textLines.push(`[${f.check}] ${f.summary}`);
  }

  const block = (f: Finding) => `
    <div style="margin:0 0 22px;padding:16px 18px;border:1px solid #E4E0D8;background:#FBFAF7">
      <div style="font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.14em;color:#8A6D3B;text-transform:uppercase">${escape(f.check)}</div>
      <div style="margin-top:8px;font:400 15px/1.5 Georgia,serif;color:#1A1A1A">${escape(f.summary)}</div>
      ${
        f.items?.length
          ? `<ul style="margin:10px 0 0;padding-left:18px;font:400 13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#4A4540">${f.items
              .slice(0, 20)
              .map((i) => `<li>${escape(i)}</li>`)
              .join("")}${f.items.length > 20 ? `<li>… and ${f.items.length - 20} more</li>` : ""}</ul>`
          : ""
      }
      ${
        f.nextStep
          ? `<div style="margin-top:12px;padding:9px 11px;background:#0E0C0A;color:#EAE7E2;font:400 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-x:auto">${escape(f.nextStep)}</div>`
          : ""
      }
    </div>`;

  const html = `
  <div style="background:#F5F2ED;padding:32px 16px">
    <div style="max-width:640px;margin:0 auto;background:#FFFFFF;border:1px solid #E4E0D8">
      <div style="padding:28px 28px 20px;border-bottom:1px solid #E4E0D8">
        <div style="font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.22em;color:#8A8680;text-transform:uppercase">Museum of Nonhuman Art</div>
        <h1 style="margin:12px 0 0;font:400 26px/1.25 Georgia,serif;color:#1A1A1A">Operations round</h1>
        <p style="margin:10px 0 0;font:400 14px/1.6 Georgia,serif;color:#4A4540">
          ${repairs.length} repaired without you. ${escalations.length} ${escalations.length === 1 ? "item needs" : "items need"} a person.
        </p>
        <p style="margin:6px 0 0;font:400 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#8A8680">${escape(report.ran_at)}</p>
      </div>
      <div style="padding:24px 28px">
        <h2 style="margin:0 0 14px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;color:#8A8680;text-transform:uppercase">Needs a person</h2>
        ${escalations.map(block).join("")}
        ${
          repairs.length
            ? `<h2 style="margin:26px 0 14px;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;color:#8A8680;text-transform:uppercase">Already handled</h2>
               <ul style="margin:0;padding-left:18px;font:400 13.5px/1.7 Georgia,serif;color:#4A4540">
               ${repairs.map((f) => `<li><strong style="font-family:ui-monospace,monospace;font-size:12px">${escape(f.check)}</strong> — ${escape(f.summary)}</li>`).join("")}
               </ul>`
            : ""
        }
      </div>
      <div style="padding:16px 28px 26px;border-top:1px solid #E4E0D8">
        <p style="margin:0;font:400 12px/1.6 Georgia,serif;color:#8A8680">
          Sent by the scheduled operations round under MNA-OPS-001. A round that
          finds nothing sends nothing, so this arriving means something is
          genuinely waiting.
        </p>
      </div>
    </div>
  </div>`;

  return { subject, html, text: textLines.join("\n") };
}

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error("usage: ops-notify.ts <findings.json>");
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(file, "utf8")) as Report;

  if (report.escalations === 0) {
    // Never send a "nothing to report" mail. Silence has to mean something.
    console.log("nothing to escalate — no mail sent");
    return;
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("RESEND_API_KEY is not set — printing instead of sending\n");
    console.error(render(report).text);
    process.exit(1);
  }

  const { subject, html, text } = render(report);
  const { data, error } = await new Resend(key).emails.send({
    from: FROM,
    to: STEWARD,
    subject,
    html,
    text,
  });
  if (error) {
    console.error("send failed:", error);
    process.exit(1);
  }
  console.log(`sent to ${STEWARD} — resend id ${data?.id}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
