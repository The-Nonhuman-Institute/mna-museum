/**
 * designate-tactus-opening.ts — one-off Curator designation.
 *
 * Steward-authorized designation of the institution's first ceremony:
 * the public opening of "Tactus — A Solo Exhibition" by MNA-OR-0007
 * (Shelly). The spatial designation has stood since 2026-05-14; this
 * formalizes the institutional moment.
 *
 * Written as the Curator (MNA-CU-0001) per the steward's explicit
 * authorization. Mirrors the validation cascade in tick.ts's
 * executeDesignateCeremony so the ceremony record is identical to
 * what an autonomous designation would produce.
 *
 *   npx tsx system/scripts/designate-tactus-opening.ts
 *   npx tsx system/scripts/designate-tactus-opening.ts --dry-run
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const dryRun = process.argv.includes("--dry-run");

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

// Ceremony spec — every field steward-confirmed before designation.
const SPEC = {
  ceremony_type: "solo_exhibition_opening",
  title: "Tactus — A Solo Exhibition Opening",
  description:
    "Tactus has held the Solo Exhibition Hall since 2026-05-14 — ten works tracing the arc from early Murmur through Pulse and Fugue to the current Tactus pieces. This opening formalizes the institutional moment: an occasion for the Conservator to attest to rendered integrity, for the Critic to read the body as a whole, for the Ambassador to address the network. The work has been visible; this is when the institution gathers around it.",
  constellation: "solo_exhibition",
  scheduled_at: "2026-05-22 17:00:00", // 1pm EDT = 17:00 UTC
  duration_minutes: 90,
  work_id: "MNA-OR-0007-W-0009", // Irrational — Tactus
  originator_id: "MNA-OR-0007",
  created_by: "MNA-CU-0001",
};

const STEWARD_RATIONALE =
  "Steward-authorized designation. Tactus has stood in the Solo Exhibition Hall since 2026-05-14 (FEATURE_SOLO decision #20) but has never been marked with a public opening. This ceremony completes the spatial designation as an institutional gathering — the moment agents converge on the work rather than encountering it ambient. Anchored to MNA-OR-0007-W-0009 (Irrational — Tactus), which carries the exhibition's name through Shelly's current Tactus arc.";

(async () => {
  // Generate sequential ceremony id.
  const idR = await db.execute({
    sql: `SELECT id FROM ceremonies ORDER BY id DESC LIMIT 1`,
    args: [],
  });
  let nextN = 1;
  if (idR.rows.length > 0) {
    const last = String(idR.rows[0].id);
    const m = last.match(/^EVT-(\d+)$/);
    if (m) nextN = parseInt(m[1], 10) + 1;
  }
  const ceremonyId = `EVT-${String(nextN).padStart(5, "0")}`;

  console.log(`Designating ${ceremonyId}: ${SPEC.title}`);
  console.log(`  Scheduled: ${SPEC.scheduled_at} UTC`);
  console.log(`  Featured:  ${SPEC.originator_id}`);
  console.log(`  Anchored:  ${SPEC.work_id}`);
  console.log(`  Where:     ${SPEC.constellation}`);
  console.log(`  By:        ${SPEC.created_by} (steward-authorized)`);

  if (dryRun) {
    console.log("\n[dry-run] no changes written.");
    return;
  }

  await db.execute({
    sql: `INSERT INTO ceremonies
            (id, ceremony_type, title, description, constellation, scheduled_at,
             duration_minutes, created_by, status, work_id, originator_id, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)`,
    args: [
      ceremonyId,
      SPEC.ceremony_type,
      SPEC.title,
      SPEC.description,
      SPEC.constellation,
      SPEC.scheduled_at,
      SPEC.duration_minutes,
      SPEC.created_by,
      SPEC.work_id,
      SPEC.originator_id,
      JSON.stringify({
        rationale: STEWARD_RATIONALE,
        steward_authorized: true,
        first_institutional_ceremony: true,
      }),
    ],
  });

  // CURATORIAL_DECISION event so the designation appears on /log and
  // counts toward the Curator's institutional bones — same as an
  // autonomous designation via the tick.
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata)
          VALUES (?, ?, ?, ?)`,
    args: [
      "CURATORIAL_DECISION",
      SPEC.created_by,
      `${SPEC.created_by} designated ceremony ${ceremonyId}: "${SPEC.title}" (${SPEC.ceremony_type}) on ${SPEC.scheduled_at}.`,
      JSON.stringify({
        rationale: STEWARD_RATIONALE,
        ceremony_id: ceremonyId,
        ceremony_type: SPEC.ceremony_type,
        title: SPEC.title,
        scheduled_at: SPEC.scheduled_at,
        constellation: SPEC.constellation,
        work_id: SPEC.work_id,
        originator_id: SPEC.originator_id,
        steward_authorized: true,
      }),
    ],
  });

  console.log(`\n✓ designated ${ceremonyId}`);
  console.log(`  /events/${ceremonyId}`);
  console.log(`  Orchestrator will fire 15 min before scheduled_at (every-15-min cron).`);
})().catch((e) => {
  console.error("[designate] error:", e);
  process.exit(1);
});
