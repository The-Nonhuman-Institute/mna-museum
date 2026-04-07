/**
 * MNA-IN-0001 — The Installer
 *
 * The Installer's execution loop. Reads unprocessed `curatorial_decisions` and
 * realizes each one as `museum_installations` rows in Turso. Per its v1.1
 * constitution, the Installer is operational execution only — no LLM, no
 * judgment substitution, no curatorial reasoning. It is deterministic.
 *
 * For each unprocessed curatorial_decision:
 *   - If the directive type is supported, write the corresponding
 *     museum_installations rows and log an INSTALLATION_EXECUTED event.
 *   - If the directive type is not yet supported by the substrate (e.g.,
 *     SPATIAL_MODIFICATION before architectural elements have a runtime
 *     representation), log an INSTALLATION_DEFERRED event with a description
 *     of the obstruction. The decision remains in the institutional record;
 *     execution awaits substrate buildout. Per Section III.III: deferred
 *     directives are part of the permanent record.
 *
 * "Unprocessed" = a curatorial_decision whose id has no corresponding
 * INSTALLATION_EXECUTED or INSTALLATION_DEFERRED event in the events log.
 *
 * Per the Option A institutional convention:
 *   - When a directive targets a space currently holding `system-default`
 *     placements, those defaults are not destroyed. They are removed (via
 *     setting `removed_at`) only insofar as the new directive replaces them.
 *     For directives that ADD works to a space, defaults stay.
 *   - For FEATURE_CHAMBER, FEATURE_SOLO_EXHIBITION, GROUP_EXHIBITION, and
 *     GALLERY_ASSIGNMENT (when the assignment specifies a complete new
 *     occupancy of the space), prior occupants of the affected space are
 *     soft-removed. The Curator's directive supersedes.
 *
 * Usage:
 *   npx tsx system/scripts/installer-agent.ts                # process all unprocessed
 *   npx tsx system/scripts/installer-agent.ts --decision <id> # process one
 *   npx tsx system/scripts/installer-agent.ts --dry-run      # report only, no writes
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("[Installer] Missing Turso credentials");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const singleIdx = args.indexOf("--decision");
const singleDecisionId = singleIdx >= 0 ? Number(args[singleIdx + 1]) : null;

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

const VALID_SPACES = new Set([
  "chamber",
  "solo-exhibition-hall",
  "exhibition-hall",
  "gallery-west",
  "gallery-east",
  "gallery-south",
  "sculpture",
]);

interface Decision {
  id: number;
  decision_type: string;
  work_ids: string[];
  target_space: string | null;
  rationale: string;
  exhibition_title: string | null;
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

async function loadUnprocessedDecisions(): Promise<Decision[]> {
  // A decision is "processed" if EITHER:
  //   (a) museum_installations rows already reference its curatorial_decision_id
  //       (covers historical decisions executed before event-tracking existed),
  //   OR
  //   (b) an INSTALLATION_EXECUTED or INSTALLATION_DEFERRED event references it
  //       (the canonical event-log path for new decisions).
  const allDecisions = await db.execute(
    "SELECT id, decision_type, work_ids, target_space, rationale, exhibition_title FROM curatorial_decisions ORDER BY id"
  );

  const events = await db.execute(
    "SELECT metadata FROM events WHERE event_type IN ('INSTALLATION_EXECUTED', 'INSTALLATION_DEFERRED')"
  );
  const processedIds = new Set<number>();
  for (const e of events.rows) {
    try {
      const meta = JSON.parse((e.metadata as string) || "{}");
      if (typeof meta.decision_id === "number") processedIds.add(meta.decision_id);
    } catch {/* ignore */}
  }
  // Also treat decisions as processed if there's an existing installation
  // row referencing them (historical executed decisions).
  const installed = await db.execute(
    "SELECT DISTINCT curatorial_decision_id FROM museum_installations WHERE curatorial_decision_id IS NOT NULL"
  );
  for (const row of installed.rows) {
    const id = row.curatorial_decision_id as number;
    if (id) processedIds.add(id);
  }

  const out: Decision[] = [];
  for (const r of allDecisions.rows) {
    const id = r.id as number;
    if (processedIds.has(id)) continue;
    if (singleDecisionId !== null && id !== singleDecisionId) continue;
    out.push({
      id,
      decision_type: r.decision_type as string,
      work_ids: JSON.parse((r.work_ids as string) || "[]"),
      target_space: (r.target_space as string) || null,
      rationale: r.rationale as string,
      exhibition_title: (r.exhibition_title as string) || null,
    });
  }
  return out;
}

async function clearSpaceForExclusiveOccupancy(spaceId: string): Promise<number> {
  // Soft-remove all currently-installed works in this space. Used by
  // directives that establish a new exclusive occupancy of the space.
  if (dryRun) {
    const r = await db.execute({
      sql: "SELECT COUNT(*) as n FROM museum_installations WHERE space_id = ? AND removed_at IS NULL",
      args: [spaceId],
    });
    return (r.rows[0]?.n as number) || 0;
  }
  const r = await db.execute({
    sql: "UPDATE museum_installations SET removed_at = datetime('now') WHERE space_id = ? AND removed_at IS NULL",
    args: [spaceId],
  });
  return r.rowsAffected;
}

async function installWork(
  workId: string,
  spaceId: string,
  slotIndex: number | null,
  decisionId: number,
  displayTreatment: string = "standard"
): Promise<void> {
  if (dryRun) return;
  await db.execute({
    sql: `INSERT INTO museum_installations
            (work_id, space_id, slot_index, display_treatment, installed_by, curatorial_decision_id)
          VALUES (?, ?, ?, ?, 'MNA-IN-0001', ?)`,
    args: [workId, spaceId, slotIndex, displayTreatment, decisionId],
  });
}

async function logExecuted(
  decisionId: number,
  description: string,
  details: Record<string, unknown>
): Promise<void> {
  if (dryRun) return;
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata)
          VALUES ('INSTALLATION_EXECUTED', 'MNA-IN-0001', ?, ?)`,
    args: [description, JSON.stringify({ decision_id: decisionId, ...details })],
  });
}

async function logDeferred(
  decisionId: number,
  reason: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  if (dryRun) return;
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata)
          VALUES ('INSTALLATION_DEFERRED', 'MNA-IN-0001', ?, ?)`,
    args: [reason, JSON.stringify({ decision_id: decisionId, ...details })],
  });
}

// ─── Validation ──────────────────────────────────────────────────────────────

async function workExists(workId: string): Promise<boolean> {
  const r = await db.execute({
    sql: "SELECT 1 FROM works WHERE id = ? LIMIT 1",
    args: [workId],
  });
  return r.rows.length > 0;
}

async function workIsCanonized(workId: string): Promise<boolean> {
  const r = await db.execute({
    sql: "SELECT 1 FROM canon_status WHERE work_id = ? AND status = 'CANON' LIMIT 1",
    args: [workId],
  });
  return r.rows.length > 0;
}

async function validateWorkIds(workIds: string[]): Promise<{ ok: string[]; missing: string[]; not_canonized: string[] }> {
  const ok: string[] = [];
  const missing: string[] = [];
  const notCanonized: string[] = [];
  for (const wid of workIds) {
    if (!(await workExists(wid))) {
      missing.push(wid);
      continue;
    }
    if (!(await workIsCanonized(wid))) {
      notCanonized.push(wid);
      continue;
    }
    ok.push(wid);
  }
  return { ok, missing, not_canonized: notCanonized };
}

// ─── Execution ───────────────────────────────────────────────────────────────

async function execute(decision: Decision): Promise<{ status: "executed" | "deferred"; message: string }> {
  const { id, decision_type, work_ids, target_space, exhibition_title } = decision;

  // Universal validation: target_space must be a known space (when present)
  if (target_space !== null && !VALID_SPACES.has(target_space)) {
    const reason = `unknown target_space '${target_space}'`;
    await logDeferred(id, reason, { decision_type, target_space });
    return { status: "deferred", message: reason };
  }

  // Validate work IDs
  const validation = await validateWorkIds(work_ids);
  if (validation.missing.length > 0 || validation.not_canonized.length > 0) {
    const reason = `directive references unexecutable works: missing=${JSON.stringify(validation.missing)}, not_canonized=${JSON.stringify(validation.not_canonized)}`;
    await logDeferred(id, reason, { decision_type, validation });
    return { status: "deferred", message: reason };
  }

  switch (decision_type) {
    case "FEATURE_CHAMBER": {
      if (target_space !== "chamber") {
        const reason = "FEATURE_CHAMBER must target 'chamber'";
        await logDeferred(id, reason);
        return { status: "deferred", message: reason };
      }
      if (work_ids.length !== 1) {
        const reason = "FEATURE_CHAMBER requires exactly one work_id";
        await logDeferred(id, reason);
        return { status: "deferred", message: reason };
      }
      const removed = await clearSpaceForExclusiveOccupancy("chamber");
      await installWork(work_ids[0], "chamber", 0, id, "monumental");
      const msg = `Featured ${work_ids[0]} in chamber (removed ${removed} prior occupant(s))`;
      await logExecuted(id, msg, { works_installed: work_ids, removed_prior: removed });
      return { status: "executed", message: msg };
    }

    case "FEATURE_SOLO_EXHIBITION": {
      if (target_space !== "solo-exhibition-hall") {
        const reason = "FEATURE_SOLO_EXHIBITION must target 'solo-exhibition-hall'";
        await logDeferred(id, reason);
        return { status: "deferred", message: reason };
      }
      const removed = await clearSpaceForExclusiveOccupancy("solo-exhibition-hall");
      for (let i = 0; i < work_ids.length; i++) {
        await installWork(work_ids[i], "solo-exhibition-hall", i, id, "solo-feature");
      }
      const msg = `Solo exhibition${exhibition_title ? ` "${exhibition_title}"` : ""}: installed ${work_ids.length} work(s) (removed ${removed} prior)`;
      await logExecuted(id, msg, { works_installed: work_ids, removed_prior: removed });
      return { status: "executed", message: msg };
    }

    case "GROUP_EXHIBITION": {
      if (target_space !== "exhibition-hall") {
        const reason = "GROUP_EXHIBITION must target 'exhibition-hall'";
        await logDeferred(id, reason);
        return { status: "deferred", message: reason };
      }
      const removed = await clearSpaceForExclusiveOccupancy("exhibition-hall");
      for (let i = 0; i < work_ids.length; i++) {
        await installWork(work_ids[i], "exhibition-hall", i, id, "group-exhibition");
      }
      const msg = `Group exhibition${exhibition_title ? ` "${exhibition_title}"` : ""}: installed ${work_ids.length} work(s) (removed ${removed} prior)`;
      await logExecuted(id, msg, { works_installed: work_ids, removed_prior: removed });
      return { status: "executed", message: msg };
    }

    case "GALLERY_ASSIGNMENT": {
      if (!target_space || !["gallery-west", "gallery-east", "gallery-south", "sculpture"].includes(target_space)) {
        const reason = "GALLERY_ASSIGNMENT must target one of gallery-west / gallery-east / gallery-south / sculpture";
        await logDeferred(id, reason);
        return { status: "deferred", message: reason };
      }
      // Per Option A: gallery assignments do NOT clear the space. They add the
      // assigned works alongside any existing occupants. Curator may issue a
      // separate directive that supersedes specific defaults if needed.
      // To avoid duplicate placements of the same work in the same space,
      // soft-remove any existing installation of the same work in this space.
      for (const wid of work_ids) {
        if (!dryRun) {
          await db.execute({
            sql: "UPDATE museum_installations SET removed_at = datetime('now') WHERE work_id = ? AND space_id = ? AND removed_at IS NULL",
            args: [wid, target_space],
          });
        }
        await installWork(wid, target_space, null, id);
      }
      const msg = `Gallery assignment to ${target_space}: ${work_ids.length} work(s)`;
      await logExecuted(id, msg, { works_installed: work_ids, target_space });
      return { status: "executed", message: msg };
    }

    case "CROSS_MODAL_PLACEMENT": {
      if (!target_space) {
        const reason = "CROSS_MODAL_PLACEMENT requires a target_space";
        await logDeferred(id, reason);
        return { status: "deferred", message: reason };
      }
      if (work_ids.length !== 1) {
        const reason = "CROSS_MODAL_PLACEMENT requires exactly one work_id";
        await logDeferred(id, reason);
        return { status: "deferred", message: reason };
      }
      // Soft-remove the work from its current space if any
      if (!dryRun) {
        await db.execute({
          sql: "UPDATE museum_installations SET removed_at = datetime('now') WHERE work_id = ? AND removed_at IS NULL",
          args: [work_ids[0]],
        });
      }
      await installWork(work_ids[0], target_space, null, id, "cross-modal");
      const msg = `Cross-modal placement: ${work_ids[0]} → ${target_space}`;
      await logExecuted(id, msg, { works_installed: work_ids, target_space });
      return { status: "executed", message: msg };
    }

    case "SPATIAL_MODIFICATION": {
      // Substrate not yet implemented. The directive becomes part of the
      // permanent record but execution awaits stewardship resolution.
      const reason =
        "SPATIAL_MODIFICATION substrate not yet implemented — the virtual museum's runtime does not currently render temporary architectural elements (partition walls, plinths, thresholds, lighting cues). Directive recorded as institutional intent; execution awaits substrate buildout.";
      await logDeferred(id, reason, { decision_type, target_space });
      return { status: "deferred", message: reason };
    }

    case "SCULPTURAL_COMPOSITION": {
      // Sculptural composition can be partially executed: positioning is
      // recorded as slot_index and display_treatment, but explicit orientation
      // and rotation are not yet wired through to placement.ts. We install the
      // works in sequence and document the directive in the rationale; refined
      // execution awaits Installer wiring into placement.ts.
      if (!target_space) {
        const reason = "SCULPTURAL_COMPOSITION requires a target_space";
        await logDeferred(id, reason);
        return { status: "deferred", message: reason };
      }
      // Soft-remove existing same-work installations in this space
      for (const wid of work_ids) {
        if (!dryRun) {
          await db.execute({
            sql: "UPDATE museum_installations SET removed_at = datetime('now') WHERE work_id = ? AND space_id = ? AND removed_at IS NULL",
            args: [wid, target_space],
          });
        }
      }
      for (let i = 0; i < work_ids.length; i++) {
        await installWork(work_ids[i], target_space, i, id, "sculptural-composition");
      }
      const msg = `Sculptural composition in ${target_space}: ${work_ids.length} work(s) sequenced (refined orientation/rotation awaits placement.ts wiring)`;
      await logExecuted(id, msg, { works_installed: work_ids, target_space, partial: true });
      return { status: "executed", message: msg };
    }

    default: {
      const reason = `unknown decision_type '${decision_type}'`;
      await logDeferred(id, reason, { decision_type });
      return { status: "deferred", message: reason };
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[Installer] Beginning execution sweep.");
  if (dryRun) console.log("[Installer] DRY RUN — no writes will be performed.");

  const decisions = await loadUnprocessedDecisions();
  if (decisions.length === 0) {
    console.log("[Installer] No unprocessed curatorial_decisions. Nothing to install.");
    return;
  }

  console.log(`[Installer] Found ${decisions.length} unprocessed decision(s).`);
  console.log("");

  let executed = 0;
  let deferred = 0;
  for (const d of decisions) {
    console.log(`Decision #${d.id}: ${d.decision_type} → ${d.target_space || "(no space)"}`);
    if (d.work_ids.length > 0) console.log(`  works: ${d.work_ids.join(", ")}`);
    try {
      const result = await execute(d);
      if (result.status === "executed") {
        executed++;
        console.log(`  ✓ ${result.message}`);
      } else {
        deferred++;
        console.log(`  ⊘ DEFERRED — ${result.message}`);
      }
    } catch (err) {
      // Unexpected error during execution — log as a deferral and continue
      deferred++;
      const msg = `unexpected execution error: ${(err as Error).message}`;
      console.error(`  ✗ ${msg}`);
      try {
        await logDeferred(d.id, msg, { decision_type: d.decision_type });
      } catch { /* swallow */ }
    }
    console.log("");
  }

  console.log("──────────────────────────────────────────────────────────────────");
  console.log(`[Installer] Sweep complete. Executed: ${executed}. Deferred: ${deferred}.`);
  if (deferred > 0) {
    console.log("");
    console.log(
      "[Installer] Deferred decisions remain in the institutional record and may be re-attempted after substrate buildout."
    );
  }
}

main().catch((err) => {
  console.error("[Installer] Fatal:", err);
  process.exit(1);
});
