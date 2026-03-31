import { getDb } from "./db";

/**
 * Add display_aspect column to works table.
 * Text works default to 1.0 (square frame).
 * Image works will store their actual aspect ratio.
 */
function migrate() {
  const db = getDb();

  // Check if column already exists
  const columns = db.prepare("PRAGMA table_info(works)").all() as { name: string }[];
  if (columns.some((c) => c.name === "display_aspect")) {
    console.log("display_aspect column already exists, skipping.");
    db.close();
    return;
  }

  db.exec(`ALTER TABLE works ADD COLUMN display_aspect REAL NOT NULL DEFAULT 1.0`);

  // Set all existing text works to 1.0 (square)
  db.prepare(`UPDATE works SET display_aspect = 1.0 WHERE output_type = 'text'`).run();

  console.log("Migration complete: added display_aspect to works table.");
  db.close();
}

migrate();
