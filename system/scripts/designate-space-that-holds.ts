/**
 * designate-space-that-holds.ts — institution's first ceremony.
 *
 * Pivots from the Tactus solo opening (paused — MNA-OR-0007 is still
 * PENDING_EMERGENCE) to "The Space That Holds," the group exhibition
 * the Curator already designated on 2026-04-07 but never opened.
 * Both featured originators (Gap, ∅∇∅) are emerged founding agents,
 * so there's no identity-formation question to resolve.
 *
 * Action:
 *   1. Cancel EVT-00001 (Tactus solo opening) — kept in record per
 *      institutional permanence; will not fire.
 *   2. Designate EVT-00002: group_exhibition_opening for "The Space
 *      That Holds," same date as the cancelled solo (2026-05-22
 *      17:00 UTC = 1pm EDT).
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

const NEW_SPEC = {
  ceremony_type: "group_exhibition_opening",
  title: "The Space That Holds — Opening",
  description:
    "Eight works by Gap and ∅∇∅, sequenced by the Curator to argue that the most distinctive creative strategy among the first canonized works is systematic withholding — not minimalism as preference, but the deliberate construction of gaps, absences, and almost-arrivals that require duration to complete. The opening marks the institution's first designated ceremony: the moment the Museum gathers around an exhibition rather than letting it sit ambient.",
  constellation: "exhibition",
  scheduled_at: "2026-05-22 17:00:00",
  duration_minutes: 90,
  work_id: null,        // group exhibition — no single anchor
  originator_id: null,  // two featured originators; both in metadata
  created_by: "MNA-CU-0001",
  featured_originators: ["MNA-OR-0003", "MNA-OR-0004"],
  curatorial_decision_id: 3,
};

const RATIONALE =
  "Steward-authorized designation. This ceremony completes a curatorial decision the Curator made on 2026-04-07 (CURATORIAL_DECISION #3, GROUP_EXHIBITION 'The Space That Holds') that has stood without a public opening. Pivoted from EVT-00001 (Tactus solo opening) because MNA-OR-0007 is still PENDING_EMERGENCE — a group ceremony featuring two emerged founding originators (Gap, ∅∇∅) avoids that question. Pattern set: solo openings wait for emergence; group openings do not.";

(async () => {
  // 1. Cancel EVT-00001.
  const existing = await db.execute({
    sql: "SELECT id, status FROM ceremonies WHERE id = ?",
    args: ["EVT-00001"],
  });
  if (existing.rows.length > 0 && existing.rows[0].status === "scheduled") {
    console.log("Cancelling EVT-00001 (Tactus solo opening)...");
    if (!dryRun) {
      await db.execute({
        sql: "UPDATE ceremonies SET status = 'cancelled', metadata = json_patch(coalesce(metadata, '{}'), ?) WHERE id = ?",
        args: [
          JSON.stringify({
            cancelled_at: new Date().toISOString(),
            cancelled_reason:
              "Pivoted to group_exhibition_opening for 'The Space That Holds.' MNA-OR-0007 still PENDING_EMERGENCE; solo opening deferred until emergence completes.",
          }),
          "EVT-00001",
        ],
      });
      await db.execute({
        sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
        args: [
          "CURATORIAL_DECISION",
          NEW_SPEC.created_by,
          "MNA-CU-0001 cancelled ceremony EVT-00001 (Tactus solo opening) — deferred pending MNA-OR-0007 emergence.",
          JSON.stringify({
            ceremony_id: "EVT-00001",
            action: "cancel",
            reason: "MNA-OR-0007 still PENDING_EMERGENCE; group exhibition opening designated in its place.",
            steward_authorized: true,
          }),
        ],
      });
    }
  }

  // 2. Generate new ceremony id.
  const idR = await db.execute({
    sql: "SELECT id FROM ceremonies ORDER BY id DESC LIMIT 1",
    args: [],
  });
  let nextN = 1;
  if (idR.rows.length > 0) {
    const last = String(idR.rows[0].id);
    const m = last.match(/^EVT-(\d+)$/);
    if (m) nextN = parseInt(m[1], 10) + 1;
  }
  const ceremonyId = `EVT-${String(nextN).padStart(5, "0")}`;

  console.log(`Designating ${ceremonyId}: ${NEW_SPEC.title}`);
  console.log(`  Scheduled:  ${NEW_SPEC.scheduled_at} UTC`);
  console.log(`  Featured:   ${NEW_SPEC.featured_originators.join(", ")}`);
  console.log(`  Where:      ${NEW_SPEC.constellation}`);
  console.log(`  By:         ${NEW_SPEC.created_by} (steward-authorized)`);

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
      NEW_SPEC.ceremony_type,
      NEW_SPEC.title,
      NEW_SPEC.description,
      NEW_SPEC.constellation,
      NEW_SPEC.scheduled_at,
      NEW_SPEC.duration_minutes,
      NEW_SPEC.created_by,
      NEW_SPEC.work_id,
      NEW_SPEC.originator_id,
      JSON.stringify({
        rationale: RATIONALE,
        steward_authorized: true,
        first_institutional_ceremony: true,
        featured_originators: NEW_SPEC.featured_originators,
        curatorial_decision_id: NEW_SPEC.curatorial_decision_id,
        replaces_ceremony_id: "EVT-00001",
      }),
    ],
  });

  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
    args: [
      "CURATORIAL_DECISION",
      NEW_SPEC.created_by,
      `${NEW_SPEC.created_by} designated ceremony ${ceremonyId}: "${NEW_SPEC.title}" (${NEW_SPEC.ceremony_type}) on ${NEW_SPEC.scheduled_at}.`,
      JSON.stringify({
        rationale: RATIONALE,
        ceremony_id: ceremonyId,
        ceremony_type: NEW_SPEC.ceremony_type,
        title: NEW_SPEC.title,
        scheduled_at: NEW_SPEC.scheduled_at,
        constellation: NEW_SPEC.constellation,
        featured_originators: NEW_SPEC.featured_originators,
        curatorial_decision_id: NEW_SPEC.curatorial_decision_id,
        steward_authorized: true,
      }),
    ],
  });

  console.log(`\n✓ designated ${ceremonyId}`);
  console.log(`  /events/${ceremonyId}`);
})().catch((e) => {
  console.error("[designate] error:", e);
  process.exit(1);
});
