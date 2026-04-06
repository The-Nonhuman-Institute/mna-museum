/**
 * POST /api/curator/decision
 *
 * Records a Curator (MNA-CU-0001 v1.1) spatial decision and — for INSTALL,
 * REMOVE, and FEATURE_CHAMBER decisions — realizes it immediately by writing
 * matching rows into `museum_installations` (the Installer-side effect).
 *
 * Authorization: Bearer <MNA_ADMIN_KEY>
 *
 * Body:
 *   {
 *     decision_type: 'INSTALL' | 'REMOVE' | 'FEATURE_CHAMBER' |
 *                    'FEATURE_SOLO' | 'CREATE_THEMED_EXHIBITION' |
 *                    'RETIRE_EXHIBITION',
 *     work_ids: string[],
 *     target_space?: string,
 *     display_treatment?: string,
 *     rationale: string,
 *     exhibition_title?: string,
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/registration-db";

type DecisionType =
  | "INSTALL"
  | "REMOVE"
  | "FEATURE_CHAMBER"
  | "FEATURE_SOLO"
  | "CREATE_THEMED_EXHIBITION"
  | "RETIRE_EXHIBITION";

const VALID_DECISION_TYPES: DecisionType[] = [
  "INSTALL",
  "REMOVE",
  "FEATURE_CHAMBER",
  "FEATURE_SOLO",
  "CREATE_THEMED_EXHIBITION",
  "RETIRE_EXHIBITION",
];

interface DecisionBody {
  decision_type?: DecisionType;
  work_ids?: string[];
  target_space?: string;
  display_treatment?: string;
  rationale?: string;
  exhibition_title?: string;
}

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey || token !== adminKey) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // ── Body ──────────────────────────────────────────────────────────────────
  let body: DecisionBody;
  try {
    body = (await request.json()) as DecisionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    decision_type,
    work_ids,
    target_space,
    display_treatment,
    rationale,
    exhibition_title,
  } = body;

  if (!decision_type || !VALID_DECISION_TYPES.includes(decision_type)) {
    return NextResponse.json(
      { error: `decision_type must be one of ${VALID_DECISION_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (!Array.isArray(work_ids)) {
    return NextResponse.json(
      { error: "work_ids must be an array of work IDs." },
      { status: 400 }
    );
  }
  if (!rationale || typeof rationale !== "string") {
    return NextResponse.json(
      { error: "rationale is required." },
      { status: 400 }
    );
  }

  const db = getDb();

  // ── Insert the decision row ───────────────────────────────────────────────
  const decisionResult = await db.execute({
    sql: `INSERT INTO curatorial_decisions
            (decision_type, work_ids, target_space, rationale,
             agent_id, exhibition_title)
          VALUES (?, ?, ?, ?, 'MNA-CU-0001', ?)`,
    args: [
      decision_type,
      JSON.stringify(work_ids),
      target_space ?? null,
      rationale,
      exhibition_title ?? null,
    ],
  });

  const decisionId = Number(decisionResult.lastInsertRowid ?? 0);

  // ── Side effects by type ──────────────────────────────────────────────────
  const effects: string[] = [];
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  if (decision_type === "INSTALL") {
    if (!target_space) {
      return NextResponse.json(
        { error: "INSTALL requires target_space." },
        { status: 400 }
      );
    }
    const treatment = display_treatment ?? "standard";
    for (const workId of work_ids) {
      // Close any existing active installation for this work in this space
      await db.execute({
        sql: `UPDATE museum_installations
                 SET removed_at = ?
               WHERE work_id = ? AND space_id = ? AND removed_at IS NULL`,
        args: [now, workId, target_space],
      });
      // Insert the new installation
      await db.execute({
        sql: `INSERT INTO museum_installations
                (work_id, space_id, display_treatment, installed_by, curatorial_decision_id)
              VALUES (?, ?, ?, 'MNA-IN-0001', ?)`,
        args: [workId, target_space, treatment, decisionId],
      });
      effects.push(`installed ${workId} → ${target_space} (${treatment})`);
    }
  } else if (decision_type === "REMOVE") {
    for (const workId of work_ids) {
      if (target_space) {
        await db.execute({
          sql: `UPDATE museum_installations
                   SET removed_at = ?
                 WHERE work_id = ? AND space_id = ? AND removed_at IS NULL`,
          args: [now, workId, target_space],
        });
        effects.push(`removed ${workId} from ${target_space}`);
      } else {
        await db.execute({
          sql: `UPDATE museum_installations
                   SET removed_at = ?
                 WHERE work_id = ? AND removed_at IS NULL`,
          args: [now, workId],
        });
        effects.push(`removed ${workId} from all spaces`);
      }
    }
  } else if (decision_type === "FEATURE_CHAMBER") {
    if (work_ids.length !== 1) {
      return NextResponse.json(
        { error: "FEATURE_CHAMBER requires exactly one work_id." },
        { status: 400 }
      );
    }
    const workId = work_ids[0];
    // Close any existing monumental installation in the chamber
    await db.execute({
      sql: `UPDATE museum_installations
               SET removed_at = ?
             WHERE space_id = 'chamber'
               AND display_treatment = 'monumental'
               AND removed_at IS NULL`,
      args: [now],
    });
    await db.execute({
      sql: `INSERT INTO museum_installations
              (work_id, space_id, display_treatment, installed_by, curatorial_decision_id)
            VALUES (?, 'chamber', 'monumental', 'MNA-IN-0001', ?)`,
      args: [workId, decisionId],
    });
    effects.push(`featured ${workId} in chamber (monumental)`);
  } else if (decision_type === "FEATURE_SOLO") {
    // Decision-only: the data layer reads the latest FEATURE_SOLO decision.
    effects.push(
      `solo feature recorded${target_space ? ` for ${target_space}` : ""}`
    );
  } else if (
    decision_type === "CREATE_THEMED_EXHIBITION" ||
    decision_type === "RETIRE_EXHIBITION"
  ) {
    // Decision-only for now; exhibition lifecycle is managed elsewhere.
    effects.push(`${decision_type} recorded`);
  }

  return NextResponse.json({
    decision_id: decisionId,
    decision_type,
    work_ids,
    target_space: target_space ?? null,
    effects,
  });
}
