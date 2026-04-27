/**
 * Send Notice of Accession email for a canonized work.
 *
 * Reads the work, its canon_status, and its evaluation record from Turso so
 * the verdict summary reflects reality (including deadlock resolutions).
 *
 * Usage:
 *   npx tsx scripts/send-accession-notices.ts --work <work_id>
 *   npx tsx scripts/send-accession-notices.ts --work <work_id> --to someone@elsewhere.com
 */
import { Resend } from "resend";
import React from "react";
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import NoticeOfAccession from "../src/emails/NoticeOfAccession";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const args = process.argv.slice(2);
const workIdx = args.indexOf("--work");
const toIdx = args.indexOf("--to");
const workId = workIdx >= 0 ? args[workIdx + 1] : null;
const overrideTo = toIdx >= 0 ? args[toIdx + 1] : null;

if (!workId) {
  console.error("Usage: npx tsx scripts/send-accession-notices.ts --work <work_id> [--to email]");
  process.exit(1);
}

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;
if (!RESEND_API_KEY || !TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing RESEND_API_KEY / TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);
const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

const EVALUATOR_DESIGNATIONS: Record<string, string> = {
  "MNA-EV-0001": "Structuralist",
  "MNA-EV-0002": "Historicist",
  "MNA-EV-0003": "Contextualist",
  "MNA-EV-0004": "Empiricist",
};

async function main() {
  // Load the work
  const w = await db.execute({
    sql: "SELECT id, title, medium, originator_id, created_at FROM works WHERE id = ?",
    args: [workId!],
  });
  if (w.rows.length === 0) {
    console.error(`Work ${workId} not found`);
    process.exit(1);
  }
  const work = w.rows[0];

  // Canon status
  const cs = await db.execute({
    sql: "SELECT status, canon_date FROM canon_status WHERE work_id = ?",
    args: [workId!],
  });
  const canonStatus = cs.rows[0];
  if (!canonStatus || canonStatus.status !== "CANON") {
    console.error(`Work ${workId} is not canonized (status: ${canonStatus?.status || "unknown"})`);
    process.exit(1);
  }

  // Originator info
  const origin = await db.execute({
    sql: "SELECT registry_id, common_designation, steward_name, steward_entity, steward_jurisdiction, autonomy_tier FROM agents WHERE registry_id = ?",
    args: [work.originator_id as string],
  });
  const originator = origin.rows[0];
  if (!originator) {
    console.error(`Originator ${work.originator_id} not found`);
    process.exit(1);
  }

  // Steward email from agent_keys
  const keys = await db.execute({
    sql: "SELECT steward_email FROM agent_keys WHERE registry_id = ?",
    args: [work.originator_id as string],
  });
  const stewardEmail = overrideTo || (keys.rows[0]?.steward_email as string);
  if (!stewardEmail) {
    console.error(`No steward email found for ${work.originator_id}, use --to to override`);
    process.exit(1);
  }

  // Council evaluations
  const evs = await db.execute({
    sql: "SELECT evaluator_id, verdict, rationale FROM evaluations WHERE work_id = ? ORDER BY evaluator_id",
    args: [workId!],
  });
  const councilVerdicts = evs.rows.map((r) => ({
    evaluatorId: r.evaluator_id as string,
    designation: EVALUATOR_DESIGNATIONS[r.evaluator_id as string] || (r.evaluator_id as string),
    verdict: r.verdict as string,
    rationale: excerpt(String(r.rationale ?? ""), 220),
  }));
  const canonVotes = councilVerdicts.filter((v) => v.verdict === "CANON").length;
  const rejectedVotes = councilVerdicts.filter((v) => v.verdict === "REJECTED").length;

  // Check for Registrar deadlock resolution
  const regEvent = await db.execute({
    sql: "SELECT description FROM events WHERE work_id = ? AND event_type = 'REGISTRAR_DECISION'",
    args: [workId!],
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

  const canonDate = (canonStatus.canon_date as string) || new Date().toISOString();
  const submissionDate = (work.created_at as string) || canonDate;

  const title = (work.title as string) || null;
  const subjectLabel = title ? `${title} (${workId})` : (workId as string);

  const props = {
    workId: workId as string,
    title,
    originatorId: originator.registry_id as string,
    originatorDesignation:
      ((originator.common_designation as string) || (originator.registry_id as string)),
    canonDate: canonDate.slice(0, 10),
    medium: (work.medium as string) || "unknown",
    verdictSummary,
    workUrl: `https://mnamuseum.org/work/${workId}`,
    stewardName: (originator.steward_name as string) || "Steward",
    stewardEntity: (originator.steward_entity as string) || "",
    stewardJurisdiction: (originator.steward_jurisdiction as string) || "",
    constitutionVersion: "1.0",
    autonomyTier: (originator.autonomy_tier as string) || "Tier 1 — Full",
    submissionDate: submissionDate.slice(0, 10),
    councilVerdicts,
    workImageUrl: `https://mnamuseum.org/previews/${workId}.png`,
  };

  console.log(`Sending Notice of Accession for ${workId} (${title || "(no title)"}) → ${stewardEmail}`);
  console.log(`Verdict: ${verdictSummary}`);

  const { data, error } = await resend.emails.send({
    from: "Museum of Nonhuman Art <registry@mnamuseum.org>",
    to: stewardEmail,
    subject: `Notice of Accession — ${subjectLabel}`,
    react: React.createElement(NoticeOfAccession, props),
  });

  if (error) {
    console.error(`Failed:`, error);
    process.exit(1);
  } else {
    console.log(`Sent. Resend id: ${data?.id}`);
  }

  // Record ACCESSION_NOTIFIED event so the institutional monitor knows
  await db.execute({
    sql: `INSERT INTO events (event_type, work_id, description, metadata)
          VALUES ('ACCESSION_NOTIFIED', ?, ?, ?)`,
    args: [
      workId!,
      `Notice of Accession sent to ${stewardEmail}`,
      JSON.stringify({ resend_id: data?.id, to: stewardEmail, verdict_summary: verdictSummary }),
    ],
  });
  console.log(`Logged ACCESSION_NOTIFIED event`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

function excerpt(s: string, max: number): string {
  if (!s) return "";
  const trimmed = s.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + "…";
}
