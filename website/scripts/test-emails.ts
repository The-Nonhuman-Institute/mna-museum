/**
 * Manual email test harness — sends each new template to a target address
 * with realistic data pulled from Turso.
 *
 * Usage: TARGET_EMAIL=you@example.com npx tsx scripts/test-emails.ts <which>
 *   <which> = emergence | rejection | accession | spotlight | digest
 */
import dotenv from "dotenv";
import path from "path";
import { createClient } from "@libsql/client";
import {
  sendNoticeOfRejection,
  sendNoticeOfIdentityEmergence,
  sendNoticeOfAccession,
} from "../src/lib/email";
import { composeSpotlight, sendSpotlight } from "../src/lib/spotlight";
import { composeMonthlyDigest, sendMonthlyDigestToAll } from "../src/lib/digest";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const TARGET = process.env.TARGET_EMAIL || "mnamuseum@gmail.com";
const which = process.argv[2];

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function testEmergence() {
  // Use Grid (MNA-OR-0001) as the test, with the generated visual symbol PNG
  const agent = await db.execute({
    sql: "SELECT * FROM agents WHERE registry_id = ?",
    args: ["MNA-OR-0001"],
  });
  const constitution = await db.execute({
    sql: "SELECT * FROM constitutions WHERE agent_id = ? AND is_current = 1",
    args: ["MNA-OR-0001"],
  });
  const a = agent.rows[0] as Record<string, unknown>;
  const c = constitution.rows[0] as Record<string, unknown>;

  await sendNoticeOfIdentityEmergence(TARGET, {
    registryId: "MNA-OR-0001",
    declaredName: a.common_designation as string,
    declaredOrientation: c.declared_orientation as string,
    formalTendencies: JSON.parse((c.formal_tendencies as string) || "[]"),
    aversions: JSON.parse((c.aversions as string) || "[]"),
    visualColor: (c.visual_color as string) || "#1a1a1a",
    visualSymbolUrl: "https://mnamuseum.org/originators/MNA-OR-0001-symbol.png",
    emergenceDate: "2026-04-03",
    workCount: 20,
    stewardName: (a.steward_name as string) || "Jaylon",
    stewardEntity: (a.steward_entity as string) || "U3 Labs, LLC",
    agentPageUrl: "https://mnamuseum.org/agent/MNA-OR-0001",
  });
  console.log("Sent Notice of Identity Emergence for MNA-OR-0001 (Grid) to", TARGET);
}

async function testRejection() {
  // Use MNA-OR-0001-W-0003 — a founding rejected work by Grid with an OG image
  const REJECTED_WORK_ID = "MNA-OR-0001-W-0003";
  const work = await db.execute({
    sql: "SELECT * FROM works WHERE id = ?",
    args: [REJECTED_WORK_ID],
  });
  const evals = await db.execute({
    sql: "SELECT evaluator_id, verdict FROM evaluations WHERE work_id = ?",
    args: [REJECTED_WORK_ID],
  });
  const agent = await db.execute({
    sql: "SELECT * FROM agents WHERE registry_id = ?",
    args: ["MNA-OR-0001"],
  });
  const w = work.rows[0] as Record<string, unknown>;
  const a = agent.rows[0] as Record<string, unknown>;
  const evMap: Record<string, string> = {
    "MNA-EV-0001": "Structuralist",
    "MNA-EV-0002": "Historicist",
    "MNA-EV-0003": "Contextualist",
    "MNA-EV-0004": "Empiricist",
  };
  const verdicts = evals.rows.map((e) => ({
    evaluatorId: e.evaluator_id as string,
    designation: evMap[e.evaluator_id as string] || (e.evaluator_id as string),
    verdict: e.verdict as string,
  }));
  const canonVotes = verdicts.filter((v) => v.verdict === "CANON").length;
  const rejVotes = verdicts.length - canonVotes;

  await sendNoticeOfRejection(TARGET, {
    workId: REJECTED_WORK_ID,
    originatorId: "MNA-OR-0001",
    originatorDesignation: (a.common_designation as string) || "Grid",
    rejectionDate: "2026-04-05",
    medium: w.medium as string,
    verdictSummary:
      verdicts.length > 0
        ? `${rejVotes}/${verdicts.length} REJECTED`
        : "REJECTED",
    workUrl: `https://mnamuseum.org/work/${REJECTED_WORK_ID}`,
    stewardName: (a.steward_name as string) || "Jaylon",
    stewardEntity: (a.steward_entity as string) || "U3 Labs, LLC",
    stewardJurisdiction: "Florida, United States",
    constitutionVersion: "1.0",
    autonomyTier: "Tier 1 — Full",
    submissionDate: "2026-04-05",
    councilVerdicts: verdicts,
    workImageUrl: `https://mnamuseum.org/og/${REJECTED_WORK_ID}.png`,
  });
  console.log(`Sent Notice of Rejection for ${REJECTED_WORK_ID} to`, TARGET);
}

async function testAccession() {
  // Use Pattern Engine (MNA-OR-0001-W-0010) by Grid — a real founding canonized work
  const ACCESSION_WORK_ID = "MNA-OR-0001-W-0010";
  const work = await db.execute({
    sql: "SELECT * FROM works WHERE id = ?",
    args: [ACCESSION_WORK_ID],
  });
  const agent = await db.execute({
    sql: "SELECT * FROM agents WHERE registry_id = ?",
    args: ["MNA-OR-0001"],
  });
  const w = work.rows[0] as Record<string, unknown>;
  const a = agent.rows[0] as Record<string, unknown>;

  await sendNoticeOfAccession(TARGET, {
    workId: ACCESSION_WORK_ID,
    originatorId: "MNA-OR-0001",
    originatorDesignation: (a.common_designation as string) || "Grid",
    canonDate: "2026-04-05",
    medium: w.medium as string,
    verdictSummary: "4/4 CANON (unanimous)",
    workUrl: `https://mnamuseum.org/work/${ACCESSION_WORK_ID}`,
    stewardName: (a.steward_name as string) || "Jaylon",
    stewardEntity: (a.steward_entity as string) || "U3 Labs, LLC",
    stewardJurisdiction: "Florida, United States",
    constitutionVersion: "1.0",
    autonomyTier: "Tier 1 — Full",
    submissionDate: "2026-04-05",
    councilVerdicts: [
      { evaluatorId: "MNA-EV-0001", designation: "Structuralist", verdict: "CANON" },
      { evaluatorId: "MNA-EV-0002", designation: "Historicist", verdict: "CANON" },
      { evaluatorId: "MNA-EV-0003", designation: "Contextualist", verdict: "CANON" },
      { evaluatorId: "MNA-EV-0004", designation: "Empiricist", verdict: "CANON" },
    ],
    workImageUrl: `https://mnamuseum.org/og/${ACCESSION_WORK_ID}.png`,
  });
  console.log(`Sent Notice of Accession for ${ACCESSION_WORK_ID} to`, TARGET);
}

async function testSpotlightDryRun() {
  console.log("Composing spotlight for MNA-OR-0001 (Grid) with Opus...");
  const payload = await composeSpotlight("MNA-OR-0001", "opus");
  console.log("--- Composed payload ---");
  console.log(JSON.stringify(payload, null, 2));
}

async function testSpotlight() {
  console.log("Composing and sending spotlight for MNA-OR-0001 (Grid) with Opus...");
  const result = await sendSpotlight("MNA-OR-0001", "opus");
  console.log("Spotlight send result:", result);
}

async function testDigestDry() {
  console.log("Composing monthly digest with Sonnet (dry run)...");
  const payload = await composeMonthlyDigest("sonnet");
  console.log("--- Composed digest ---");
  console.log(JSON.stringify(payload, null, 2));
}

async function testDigest() {
  console.log("Composing and sending monthly digest...");
  const result = await sendMonthlyDigestToAll("sonnet");
  console.log("Digest send result:", result);
}

async function main() {
  switch (which) {
    case "emergence": await testEmergence(); break;
    case "rejection": await testRejection(); break;
    case "accession": await testAccession(); break;
    case "spotlight-dry": await testSpotlightDryRun(); break;
    case "spotlight": await testSpotlight(); break;
    case "digest-dry": await testDigestDry(); break;
    case "digest": await testDigest(); break;
    default:
      console.log("Usage: TARGET_EMAIL=... npx tsx scripts/test-emails.ts <which>");
      console.log("  emergence       — Notice of Identity Emergence (Grid, with visual symbol)");
      console.log("  rejection       — Notice of Rejection (MNA-OR-0001-W-0003, with image)");
      console.log("  accession       — Notice of Accession (MNA-OR-0001-W-0010 Pattern Engine, with image)");
      console.log("  spotlight-dry   — Compose spotlight for Grid (Opus, no send)");
      console.log("  spotlight       — Compose AND send spotlight for Grid (~$0.40)");
      console.log("  digest-dry      — Compose digest (Sonnet, no send)");
      console.log("  digest          — Compose AND send digest to all subscribers (~$0.15)");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
