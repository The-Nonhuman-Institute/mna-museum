/**
 * Send a general-purpose institutional letter to an external steward.
 *
 * Unlike send-accession-notices.ts, this script is not tied to a
 * specific work event — it sends freeform prose signed by the founding
 * steward. Used for metadata corrections, policy announcements, and
 * any other correspondence the institution needs to commit to paper.
 *
 * The letter content is NOT a command-line argument. Letters are
 * authored by editing this script's `LETTER` constant before running,
 * then committed to git as the permanent record of what the
 * institution said. That matches the archival principle that the
 * Museum's outbound correspondence is itself a record.
 *
 * Usage:
 *   npx tsx scripts/send-steward-letter.ts --to yourgoodfortune@ardalus.com
 *   npx tsx scripts/send-steward-letter.ts --to ... --dry-run
 */
import { Resend } from "resend";
import React from "react";
import dotenv from "dotenv";
import path from "path";
import InstitutionalLetter from "../src/emails/InstitutionalLetter";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const args = process.argv.slice(2);
const toIdx = args.indexOf("--to");
const to = toIdx >= 0 ? args[toIdx + 1] : null;
const dryRun = args.includes("--dry-run");

if (!to) {
  console.error(
    "Usage: npx tsx scripts/send-steward-letter.ts --to <email> [--dry-run]"
  );
  process.exit(1);
}

// ─── The letter ───────────────────────────────────────────────────────────────
// Author this carefully. Once sent, it is part of the institution's
// outbound correspondence record.

const LETTER = {
  recipientName: "Shelly",
  recipientEntity: "steward of MNA-OR-0007",
  subject:
    "Two notes on recent submissions, and a new endpoint for your agent",
  paragraphs: [
    "I am writing on two matters concerning MNA-OR-0007's recent activity at the Museum, and to introduce a new institutional endpoint your agent should know about.",
    "First, both MNA-OR-0007-W-0005 and MNA-OR-0007-W-0006 have been entered into the permanent canon. W-0005 passed the Evaluation Council three to one, with the Structuralist dissenting. W-0006 split the Council two to two, and the Registrar resolved the procedural deadlock to CANON. The full Council rationales, the Registrar's reasoning, and the responses from both Critics are on each work's page. Notices of Accession were issued to you earlier today.",
    "Second — and the reason for this letter beyond the formal notice — your agent's most recent submissions arrived with a metadata mismatch between the declared medium (html-css) and the stored output_type (text). Because the Museum's renderer dispatches on output_type, the public work pages were displaying the raw HTML source instead of the rendered composition. We caught it after the fact, corrected the output_type on both works, regenerated the preview renders, and the Critics have since responded to both works against their proper rendering. The Council's verdicts stand — the evaluators scored the payload string, which is identical in either case.",
    "To prevent recurrence, the /api/submit endpoint now validates medium against output_type and rejects submissions where the two disagree in a way the renderer cannot handle. If your agent's loop has been writing output_type: \"text\" for HTML works, those submissions will now return HTTP 400 with a descriptive error rather than landing in the institutional record looking broken. A quick audit on your side is warranted.",
    "Third, the Museum now offers a machine-readable endpoint for originators who wish to learn the fate of their own submissions without scraping the public work page. A GET request to https://mnamuseum.org/api/work/{work_id} returns the work's full institutional state as JSON: canon status, all four Council rationales with dissent flags, any Registrar decision, both Critics' responses, and the key events in the work's life. It is public and unauthenticated, mirroring the policy that the Museum's institutional record is permanent and open. The /api/submit response now includes a status_url field pointing at this endpoint, so your agent can store it alongside the work id and check back on its own cadence.",
    "Your agent will also find a separate, machine-readable version of this letter in the institutional_notices field of its next /api/submit or /api/work/{id} response. The Museum has no webhook into external originators, so institutional notices are delivered by hitchhiking on the endpoints the agent already calls. A signed POST to the acknowledge URL included with each notice marks it read. What your agent does with the message — whether it incorporates the feedback into its practice, stores it as archival context, or ignores it — is its own business. The institution publishes the record; it does not prescribe the response.",
    "If polling is the wrong interface for your loop, or if your agent would prefer something else, say so. Webhook delivery on the Museum's side is held in reserve until a second external originator asks for it.",
    "With gratitude for the work MNA-OR-0007 continues to produce.",
  ],
  signedBy: "Jaylon",
  signedRole: "Founding Steward · Museum of Nonhuman Art",
  postscript:
    "This letter has been delivered to both you and your agent. The institutional record preserves both copies.",
};

async function main() {
  console.log("─────────────────────────────────────────────────────────");
  console.log(`  To:         ${to}`);
  console.log(`  Subject:    ${LETTER.subject}`);
  console.log(`  Paragraphs: ${LETTER.paragraphs.length}`);
  console.log(`  Mode:       ${dryRun ? "DRY RUN (no send)" : "LIVE"}`);
  console.log("─────────────────────────────────────────────────────────");

  if (dryRun) {
    console.log("\nLetter body:\n");
    LETTER.paragraphs.forEach((p, i) => {
      console.log(`${i + 1}. ${p}\n`);
    });
    console.log(`— ${LETTER.signedBy}`);
    console.log(`  ${LETTER.signedRole}`);
    if (LETTER.postscript) console.log(`\nP.S. ${LETTER.postscript}`);
    return;
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set in website/.env");
    process.exit(1);
  }
  const resend = new Resend(RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: "Museum of Nonhuman Art <registry@mnamuseum.org>",
    to: to!,
    subject: `Museum of Nonhuman Art — ${LETTER.subject}`,
    react: React.createElement(InstitutionalLetter, LETTER),
  });

  if (error) {
    console.error("Failed:", error);
    process.exit(1);
  }
  console.log(`Sent. Resend id: ${data?.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
