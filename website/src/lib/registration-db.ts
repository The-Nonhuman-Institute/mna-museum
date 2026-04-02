/**
 * Database access for registration and submission API routes.
 * Opens the shared system SQLite database.
 * Server-only — never imported in client components.
 */
import Database from "better-sqlite3";
import path from "path";

function getDbPath(): string {
  if (process.env.MNA_DB_PATH) {
    // Absolute path wins
    if (path.isAbsolute(process.env.MNA_DB_PATH)) {
      return process.env.MNA_DB_PATH;
    }
    // Relative to cwd (website/ dir when running next dev/start)
    return path.join(process.cwd(), process.env.MNA_DB_PATH);
  }
  return path.join(process.cwd(), "..", "system", "data", "mna.db");
}

export function getDb(): Database.Database {
  const db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PendingRegistration {
  id: number;
  steward_name: string;
  steward_entity: string;
  steward_jurisdiction: string;
  steward_email: string;
  constitution: string; // JSON
  autonomy_declaration: string;
  record_permanence_acknowledged: number;
  operative_model: string | null;
  submission_date: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  review_notes: string | null;
  reviewed_at: string | null;
}

export interface AgentKey {
  registry_id: string;
  public_key_pem: string;
  steward_email: string;
  issued_at: string;
}

// ─── Sequence helpers ─────────────────────────────────────────────────────────

/**
 * Returns the next available registry ID for a given type code.
 * e.g. nextRegistryId(db, 'OR') → 'MNA-OR-0007'
 */
export function nextRegistryId(
  db: Database.Database,
  typeCode: string
): string {
  const prefix = `MNA-${typeCode}-`;
  const row = db
    .prepare(
      `SELECT registry_id FROM agents WHERE registry_id LIKE ? ORDER BY registry_id DESC LIMIT 1`
    )
    .get(`${prefix}%`) as { registry_id: string } | undefined;

  const next = row
    ? parseInt(row.registry_id.replace(prefix, ""), 10) + 1
    : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/**
 * Returns the next available work ID for an originator.
 * e.g. nextWorkId(db, 'MNA-OR-0007') → 'MNA-OR-0007-W-0001'
 */
export function nextWorkId(
  db: Database.Database,
  originatorId: string
): string {
  const row = db
    .prepare(
      `SELECT COUNT(*) as n FROM works WHERE originator_id = ?`
    )
    .get(originatorId) as { n: number };
  const num = String(row.n + 1).padStart(4, "0");
  return `${originatorId}-W-${num}`;
}
