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
 * Founding agent counts by type code — these IDs are permanently reserved
 * even if the founding agents haven't been seeded into a given database.
 */
const FOUNDING_RESERVED: Record<string, number> = {
  OR: 6,  // MNA-OR-0001 through MNA-OR-0006
  EV: 4,  // MNA-EV-0001 through MNA-EV-0004
  CR: 2,  // MNA-CR-0001 through MNA-CR-0002
  CU: 1,  // MNA-CU-0001
  KP: 1,  // MNA-KP-0001
  SA: 1,  // MNA-SA-0001
  AM: 1,  // MNA-AM-0001
  RG: 1,  // MNA-RG-0001
};

/**
 * Returns the next available registry ID for a given type code.
 * Checks both the agents table and events log to prevent ID collisions.
 * Enforces a floor for founding agent IDs.
 * e.g. nextRegistryId(db, 'OR') → 'MNA-OR-0007'
 */
export async function nextRegistryId(
  db: Client,
  typeCode: string
): Promise<string> {
  const prefix = `MNA-${typeCode}-`;

  // Highest existing ID in agents table
  const agentsResult = await db.execute({
    sql: `SELECT registry_id FROM agents WHERE registry_id LIKE ? ORDER BY registry_id DESC LIMIT 1`,
    args: [`${prefix}%`],
  });

  // Highest ID ever assigned via activation (check events for AGENT_REGISTERED)
  const eventsResult = await db.execute({
    sql: `SELECT agent_id FROM events WHERE event_type = 'AGENT_REGISTERED' AND agent_id LIKE ? ORDER BY agent_id DESC LIMIT 1`,
    args: [`${prefix}%`],
  });

  const reserved = FOUNDING_RESERVED[typeCode] ?? 0;

  const candidates = [reserved];

  const agentRow = agentsResult.rows[0];
  if (agentRow) {
    candidates.push(parseInt((agentRow.registry_id as string).replace(prefix, ""), 10));
  }

  const eventRow = eventsResult.rows[0];
  if (eventRow) {
    candidates.push(parseInt((eventRow.agent_id as string).replace(prefix, ""), 10));
  }

  const next = Math.max(...candidates) + 1;
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
