/**
 * MNA Museum Installations Schema Migration
 *
 * Adds three tables backing the Curator (MNA-CU-0001 v1.1), Installer
 * (MNA-IN-0001), and Conservator (MNA-CV-0001) agents:
 *
 *   - museum_installations   — current/past spatial placements
 *   - curatorial_decisions   — Curator decision log
 *   - render_status          — Conservator render-integrity log
 *
 * After creating the tables, seeds the current default state as a baseline,
 * so the museum's default behavior is also represented in the installations
 * table (the data layer falls back to defaults only when a space has no rows).
 *
 * Usage (from system/):
 *   npx tsx scripts/add-museum-tables.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN in website/.env");
  process.exit(1);
}

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

async function createTables() {
  console.log("Creating museum_installations ...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS museum_installations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id TEXT NOT NULL REFERENCES works(id),
      space_id TEXT NOT NULL,
      slot_index INTEGER,
      display_treatment TEXT NOT NULL DEFAULT 'standard',
      installed_at TEXT NOT NULL DEFAULT (datetime('now')),
      removed_at TEXT,
      installed_by TEXT,
      curatorial_decision_id INTEGER
    )
  `);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_installations_space ON museum_installations(space_id, removed_at)`
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_installations_work ON museum_installations(work_id)`
  );

  console.log("Creating curatorial_decisions ...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS curatorial_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      decision_type TEXT NOT NULL,
      work_ids TEXT NOT NULL,
      target_space TEXT,
      rationale TEXT NOT NULL,
      decided_at TEXT NOT NULL DEFAULT (datetime('now')),
      agent_id TEXT NOT NULL DEFAULT 'MNA-CU-0001',
      exhibition_title TEXT,
      exhibition_id INTEGER
    )
  `);

  console.log("Creating render_status ...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS render_status (
      work_id TEXT NOT NULL,
      output_type TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      recovery_applied TEXT,
      last_checked TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (work_id, output_type)
    )
  `);
}

interface CanonRow {
  id: string;
  originator_id: string;
  output_type: string;
  title: string | null;
}

async function seedBaselineInstallations() {
  // Are there already any installations? Only seed if the table is empty.
  const existing = await db.execute(
    `SELECT COUNT(*) as n FROM museum_installations`
  );
  const count = (existing.rows[0]?.n as number) || 0;
  if (count > 0) {
    console.log(
      `museum_installations already has ${count} rows — skipping baseline seed.`
    );
    return;
  }

  console.log("Seeding baseline installations from current canon ...");

  // Try with title column first; fall back if absent.
  let rows: CanonRow[];
  try {
    const res = await db.execute(
      `SELECT w.id, w.originator_id, w.output_type, w.title
         FROM works w
         JOIN canon_status cs ON w.id = cs.work_id
        WHERE cs.status = 'CANON'
        ORDER BY w.created_at`
    );
    rows = res.rows.map((r) => ({
      id: r.id as string,
      originator_id: r.originator_id as string,
      output_type: r.output_type as string,
      title: (r.title as string) || null,
    }));
  } catch {
    const res = await db.execute(
      `SELECT w.id, w.originator_id, w.output_type
         FROM works w
         JOIN canon_status cs ON w.id = cs.work_id
        WHERE cs.status = 'CANON'
        ORDER BY w.created_at`
    );
    rows = res.rows.map((r) => ({
      id: r.id as string,
      originator_id: r.originator_id as string,
      output_type: r.output_type as string,
      title: null,
    }));
  }

  const placements: Array<{
    work_id: string;
    space_id: string;
    display_treatment: string;
  }> = [];

  for (const w of rows) {
    const isScene = w.output_type === "scene-json";
    const isAudio = w.output_type === "audio-json";

    // 2D works (everything except scene-json and audio-json) → galleries by originator
    if (!isScene && !isAudio) {
      if (["MNA-OR-0001", "MNA-OR-0002"].includes(w.originator_id)) {
        placements.push({
          work_id: w.id,
          space_id: "gallery-west",
          display_treatment: "standard",
        });
      } else if (["MNA-OR-0003", "MNA-OR-0004"].includes(w.originator_id)) {
        placements.push({
          work_id: w.id,
          space_id: "gallery-east",
          display_treatment: "standard",
        });
      } else if (
        ["MNA-OR-0005", "MNA-OR-0006", "MNA-OR-0007"].includes(w.originator_id)
      ) {
        placements.push({
          work_id: w.id,
          space_id: "gallery-south",
          display_treatment: "standard",
        });
      }
    }

    // Audio: same gallery split as placement.ts currently uses
    if (isAudio) {
      if (
        ["MNA-OR-0001", "MNA-OR-0002", "MNA-OR-0005"].includes(w.originator_id)
      ) {
        placements.push({
          work_id: w.id,
          space_id: "gallery-west",
          display_treatment: "standard",
        });
      } else if (
        ["MNA-OR-0003", "MNA-OR-0004", "MNA-OR-0006", "MNA-OR-0007"].includes(
          w.originator_id
        )
      ) {
        placements.push({
          work_id: w.id,
          space_id: "gallery-east",
          display_treatment: "standard",
        });
      }
    }

    // Sculptures → sculpture court
    if (isScene) {
      placements.push({
        work_id: w.id,
        space_id: "sculpture",
        display_treatment: "standard",
      });
    }
  }

  // Chamber monumental: prefer a titled scene-json; else first scene-json
  const sceneWorks = rows.filter((w) => w.output_type === "scene-json");
  const chamberPick = sceneWorks.find((w) => w.title) || sceneWorks[0];
  if (chamberPick) {
    placements.push({
      work_id: chamberPick.id,
      space_id: "chamber",
      display_treatment: "monumental",
    });
  }

  let inserted = 0;
  for (const p of placements) {
    await db.execute({
      sql: `INSERT INTO museum_installations
              (work_id, space_id, display_treatment, installed_by, curatorial_decision_id)
            VALUES (?, ?, ?, 'system-default', NULL)`,
      args: [p.work_id, p.space_id, p.display_treatment],
    });
    inserted++;
  }

  console.log(`Seeded ${inserted} baseline installation(s).`);
  if (chamberPick) {
    console.log(`  Chamber monumental: ${chamberPick.id} (${chamberPick.title || "untitled"})`);
  }
}

async function main() {
  await createTables();
  await seedBaselineInstallations();
  console.log("Done.");
}

main().catch((err) => {
  console.error("add-museum-tables failed:", err);
  process.exit(1);
});
