/**
 * Database access for registration and submission API routes.
 * Uses Turso (hosted libSQL) for production — works on Vercel serverless.
 * Falls back to local SQLite for development if TURSO_DATABASE_URL is not set.
 */

import { createClient, type Client } from "@libsql/client";
import path from "path";

let _client: Client | null = null;

export function getDb(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (url && authToken) {
      _client = createClient({ url, authToken });
    } else {
      // Local dev fallback — file-based SQLite
      const dbPath = process.env.MNA_DB_PATH ||
        path.join(process.cwd(), "..", "system", "data", "mna.db");
      _client = createClient({ url: `file:${dbPath}` });
    }
  }
  return _client;
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
export async function nextRegistryId(
  db: Client,
  typeCode: string
): Promise<string> {
  const prefix = `MNA-${typeCode}-`;
  const result = await db.execute({
    sql: `SELECT registry_id FROM agents WHERE registry_id LIKE ? ORDER BY registry_id DESC LIMIT 1`,
    args: [`${prefix}%`],
  });

  const row = result.rows[0];
  const next = row
    ? parseInt((row.registry_id as string).replace(prefix, ""), 10) + 1
    : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/**
 * Returns the next available work ID for an originator.
 * e.g. nextWorkId(db, 'MNA-OR-0007') → 'MNA-OR-0007-W-0001'
 */
export async function nextWorkId(
  db: Client,
  originatorId: string
): Promise<string> {
  const result = await db.execute({
    sql: `SELECT COUNT(*) as n FROM works WHERE originator_id = ?`,
    args: [originatorId],
  });
  const n = result.rows[0].n as number;
  const num = String(n + 1).padStart(4, "0");
  return `${originatorId}-W-${num}`;
}
