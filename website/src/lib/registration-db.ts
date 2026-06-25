/**
 * Database access for the website.
 *
 * Two paths, because reads and writes have different needs:
 *
 *  - getDb()       READ path. Prefers a bundled, read-only SQLite *snapshot*
 *                  of the institution when one is present, so public content
 *                  rendering costs ZERO hosted-DB reads. This is what keeps the
 *                  institution inside the Turso free tier — the public site's
 *                  ISR re-fetching was the entire source of the rows-read
 *                  blackouts. Falls back to live Turso, then a local dev file.
 *
 *  - getWriteDb()  WRITE / live path. ALWAYS targets Turso (the source of
 *                  truth), never the read-only snapshot. Use for every
 *                  INSERT/UPDATE/DELETE and any read that must reflect a write
 *                  made in the same request (e.g. confirm-token lookups).
 *
 * Data served via getDb() is as fresh as the last snapshot export. The snapshot
 * is refreshed + committed by a cron, which redeploys the site. If no snapshot
 * is present, getDb() behaves exactly like the old Turso-or-dev-file logic —
 * so this is a safe no-op until the first snapshot is committed.
 */

import { createClient, type Client } from "@libsql/client";
import fs from "fs";
import path from "path";

let _readClient: Client | null = null;
let _writeClient: Client | null = null;

function tursoCreds(): { url: string; authToken: string } | null {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  return url && authToken ? { url, authToken } : null;
}

function devFilePath(): string {
  return (
    process.env.MNA_DB_PATH ||
    path.join(process.cwd(), "..", "system", "data", "mna.db")
  );
}

/**
 * Resolve a readable snapshot file, or null if none is configured/present.
 * On Vercel the deployment filesystem is read-only and SQLite needs a writable
 * directory for its journal, so the bundled snapshot is copied into /tmp
 * (writable) once per cold start and read from there.
 */
function resolveSnapshot(): string | null {
  const bundled =
    process.env.MNA_SNAPSHOT_PATH ||
    (process.env.VERCEL ? path.join(process.cwd(), "data", "snapshot.db") : null);
  if (!bundled || !fs.existsSync(bundled)) return null;

  if (process.env.VERCEL) {
    try {
      const tmp = path.join("/tmp", "mna-snapshot.db");
      if (!fs.existsSync(tmp)) fs.copyFileSync(bundled, tmp);
      return tmp;
    } catch {
      return bundled; // best effort; read in place
    }
  }
  return bundled; // local: writable FS, read in place
}

/** READ path — snapshot-first, then Turso, then dev file. */
export function getDb(): Client {
  if (!_readClient) {
    const snap = resolveSnapshot();
    if (snap) {
      _readClient = createClient({ url: `file:${snap}` });
    } else {
      const t = tursoCreds();
      _readClient = t
        ? createClient({ url: t.url, authToken: t.authToken })
        : createClient({ url: `file:${devFilePath()}` });
    }
  }
  return _readClient;
}

/** WRITE / live path — always Turso (or the dev file locally). */
export function getWriteDb(): Client {
  if (!_writeClient) {
    const t = tursoCreds();
    _writeClient = t
      ? createClient({ url: t.url, authToken: t.authToken })
      : createClient({ url: `file:${devFilePath()}` });
  }
  return _writeClient;
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
