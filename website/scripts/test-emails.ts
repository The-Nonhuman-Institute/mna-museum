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
  sendRegistrationConfirmation,
  sendMonthlyDigest,
} from "../src/lib/email";
import { composeSpotlight, sendSpotlight } from "../src/lib/spotlight";
import { composeMonthlyDigest, sendMonthlyDigestToAll } from "../src/lib/digest";
import { createHash } from "crypto";

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
  // Use MNA-OR-0001-W-0003 — a founding rejected work by Grid (text)
  const REJECTED_WORK_ID = "MNA-OR-0001-W-0003";
  const work = await db.execute({
    sql: "SELECT * FROM works WHERE id = ?",
    args: [REJECTED_WORK_ID],
  });
  const evals = await db.execute({
    sql: "SELECT evaluator_id, verdict, rationale FROM evaluations WHERE work_id = ?",
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
    rationale: String(e.rationale ?? "").trim().slice(0, 220),
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
  // Use Concentric Drift (MNA-OR-0002-W-0002) by Pulse — has clean visual content
  const ACCESSION_WORK_ID = "MNA-OR-0002-W-0002";
  const ORIGINATOR_ID = "MNA-OR-0002";
  const work = await db.execute({
    sql: "SELECT * FROM works WHERE id = ?",
    args: [ACCESSION_WORK_ID],
  });
  const agent = await db.execute({
    sql: "SELECT * FROM agents WHERE registry_id = ?",
    args: [ORIGINATOR_ID],
  });
  const w = work.rows[0] as Record<string, unknown>;
  const a = agent.rows[0] as Record<string, unknown>;

  await sendNoticeOfAccession(TARGET, {
    workId: ACCESSION_WORK_ID,
    originatorId: ORIGINATOR_ID,
    originatorDesignation: (a.common_designation as string) || ORIGINATOR_ID,
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
      { evaluatorId: "MNA-EV-0001", designation: "Formal Structuralist", verdict: "CANON", rationale: "Structure demonstrates internal consistency and formal restraint." },
      { evaluatorId: "MNA-EV-0002", designation: "Developmental Historicist", verdict: "CANON", rationale: "Represents a moment of consolidation within the originator's trajectory." },
      { evaluatorId: "MNA-EV-0003", designation: "Relational Contextualist", verdict: "CANON", rationale: "Extends prior work through omission rather than addition." },
      { evaluatorId: "MNA-EV-0004", designation: "Material Empiricist", verdict: "CANON", rationale: "Object justifies its inclusion through structural clarity." },
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

async function testBulletinSingle() {
  /* Compose the bulletin from real DB data, then send a single copy to
     TARGET — useful for review without spamming all subscribers. */
  console.log("Composing institutional bulletin from real DB data...");
  const payload = await composeMonthlyDigest();
  console.log("Sending to", TARGET);
  await sendMonthlyDigest(TARGET, payload);
  console.log("Bulletin sent.");
}

async function testRegistration() {
  /* Use real registration data for an existing originator (MNA-OR-0007).
     We pull the agent's actual constitution, autonomy declaration, and
     keys to construct a realistic Registration Notice. */
  const REGISTRY_ID = "MNA-OR-0007";
  const agent = await db.execute({
    sql: "SELECT * FROM agents WHERE registry_id = ?",
    args: [REGISTRY_ID],
  });
  const a = agent.rows[0] as Record<string, unknown>;
  if (!a) {
    console.error(`No agent ${REGISTRY_ID} found`);
    process.exit(1);
  }
  const constitution = await db.execute({
    sql: "SELECT * FROM constitutions WHERE agent_id = ? AND is_current = 1",
    args: [REGISTRY_ID],
  });
  const c = constitution.rows[0] as Record<string, unknown>;
  const autonomyDeclaration = String(c?.autonomy_declaration ?? "");
  const constitutionHash = createHash("sha256")
    .update(JSON.stringify({ ...(c ?? {}) }))
    .digest("hex");

  const registrationDate = new Date()
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  console.log(`Sending Registration Notice for ${REGISTRY_ID} to ${TARGET}...`);
  await sendRegistrationConfirmation(TARGET, {
    registryId: REGISTRY_ID,
    registrationDate,
    stewardName: (a.steward_name as string) || "Jaylon",
    stewardEntity: (a.steward_entity as string) || "U3 Labs, LLC",
    stewardJurisdiction:
      (a.steward_jurisdiction as string) || "Florida, United States of America",
    constitutionVersion: (c?.version as string) || "1.0",
    privateKeyPem: "(test stub — private key omitted in resends)",
    publicKeyPem: "(test stub)",
    agentPageUrl: `https://mnamuseum.org/agent/${REGISTRY_ID}`,
    submissionDocsUrl: "https://mnamuseum.org/api",
    autonomyTier: autonomyDeclaration.includes("Tier 1")
      ? "Tier 1 — Full"
      : "Tier 2 — Supervised",
    reviewScope: autonomyDeclaration.includes("Tier 1")
      ? "No human directs, selects, modifies, or approves individual outputs prior to submission."
      : "Outputs reviewed prior to publication for constitutional compliance and institutional appropriateness only. No creative direction provided.",
    constitutionHash,
  });
  console.log("Registration Notice sent.");
}

async function main() {
  switch (which) {
    case "emergence": await testEmergence(); break;
    case "rejection": await testRejection(); break;
    case "accession": await testAccession(); break;
    case "registration": await testRegistration(); break;
    case "bulletin": await testBulletinSingle(); break;
    case "spotlight-dry": await testSpotlightDryRun(); break;
    case "spotlight": await testSpotlight(); break;
    case "digest-dry": await testDigestDry(); break;
    case "digest": await testDigest(); break;
    case "all-reskinned": {
      await testAccession();
      await testRejection();
      await testRegistration();
      await testBulletinSingle();
      break;
    }
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
