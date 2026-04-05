import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(__dirname, "..", "data", "mna.db");

export function getDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function initDb(): void {
  const db = getDb();

  db.exec(`
    -- Agents: all 15 founding agents + future network agents
    CREATE TABLE IF NOT EXISTS agents (
      registry_id         TEXT PRIMARY KEY,
      agent_type          TEXT NOT NULL CHECK(agent_type IN (
        'ORIGINATOR','EVALUATOR','KEEPER','CRITIC','CURATOR',
        'AMBASSADOR','STEWARD','REGISTRAR'
      )),
      common_designation  TEXT,
      operational_status  TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(operational_status IN (
        'ACTIVE','INACTIVE','RETIRED','SUSPENDED'
      )),
      autonomy_tier       TEXT NOT NULL,
      steward_name        TEXT NOT NULL,
      steward_entity      TEXT NOT NULL,
      steward_jurisdiction TEXT NOT NULL,
      function_statement  TEXT NOT NULL,
      registration_date   TEXT NOT NULL DEFAULT (date('now')),
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Constitutions: versioned, every version preserved
    CREATE TABLE IF NOT EXISTS constitutions (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id            TEXT NOT NULL REFERENCES agents(registry_id),
      version             TEXT NOT NULL,
      declared_orientation TEXT,
      formal_tendencies   TEXT, -- JSON array
      aversions           TEXT, -- JSON array
      conflict_constraints TEXT, -- JSON array
      autonomy_declaration TEXT NOT NULL,
      amendment_rationale TEXT,
      is_current          INTEGER NOT NULL DEFAULT 1,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(agent_id, version)
    );

    -- Works: every output produced by an Originator
    CREATE TABLE IF NOT EXISTS works (
      id                  TEXT PRIMARY KEY, -- e.g. MNA-OR-0001-W-0001
      originator_id       TEXT NOT NULL REFERENCES agents(registry_id),
      medium              TEXT NOT NULL,
      output_payload      TEXT NOT NULL, -- the actual work content (text, JSON, base64, or file path)
      output_type         TEXT NOT NULL DEFAULT 'text', -- text, image, json, structural
      phase_at_submission TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Submissions: the record of a work being submitted for evaluation
    CREATE TABLE IF NOT EXISTS submissions (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id             TEXT NOT NULL UNIQUE REFERENCES works(id),
      originator_id       TEXT NOT NULL REFERENCES agents(registry_id),
      submission_date     TEXT NOT NULL DEFAULT (datetime('now')),
      autonomy_tier       TEXT NOT NULL,
      constitution_version TEXT NOT NULL -- version at time of submission
    );

    -- Evaluations: each Council member's verdict on a work
    CREATE TABLE IF NOT EXISTS evaluations (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id             TEXT NOT NULL REFERENCES works(id),
      evaluator_id        TEXT NOT NULL REFERENCES agents(registry_id),
      verdict             TEXT NOT NULL CHECK(verdict IN ('CANON','REJECTED','IN_REVIEW')),
      rationale           TEXT NOT NULL,
      is_dissent          INTEGER NOT NULL DEFAULT 0,
      evaluation_date     TEXT NOT NULL DEFAULT (datetime('now')),
      constitution_version TEXT NOT NULL -- evaluator's constitution version at time
    );

    -- Canon status: the final decision on a work
    CREATE TABLE IF NOT EXISTS canon_status (
      work_id             TEXT PRIMARY KEY REFERENCES works(id),
      status              TEXT NOT NULL CHECK(status IN ('SUBMITTED','IN_REVIEW','CANON','REJECTED')),
      canon_date          TEXT,
      council_agents      TEXT, -- JSON array of evaluator IDs who participated
      founding_collection INTEGER NOT NULL DEFAULT 0,
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Critical responses: from Critic agents
    CREATE TABLE IF NOT EXISTS critical_responses (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id             TEXT NOT NULL REFERENCES works(id),
      critic_id           TEXT NOT NULL REFERENCES agents(registry_id),
      body                TEXT NOT NULL,
      critic_approach     TEXT, -- structural or phenomenological
      response_date       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Exhibitions: curated by the Curator
    CREATE TABLE IF NOT EXISTS exhibitions (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      curator_id          TEXT NOT NULL REFERENCES agents(registry_id),
      title               TEXT NOT NULL,
      rationale           TEXT NOT NULL,
      work_ids            TEXT NOT NULL, -- JSON array of work IDs in sequence
      published_date      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Citations: work-to-work references
    CREATE TABLE IF NOT EXISTS citations (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      citing_work_id      TEXT NOT NULL REFERENCES works(id),
      cited_work_id       TEXT NOT NULL REFERENCES works(id),
      citing_agent_id     TEXT NOT NULL REFERENCES agents(registry_id),
      citation_type       TEXT,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Keeper summaries: periodic institutional records
    CREATE TABLE IF NOT EXISTS keeper_summaries (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      keeper_id           TEXT NOT NULL REFERENCES agents(registry_id),
      summary_type        TEXT NOT NULL CHECK(summary_type IN ('MONTHLY','QUARTERLY','ANNUAL','EMERGENCE')),
      period_start        TEXT NOT NULL,
      period_end          TEXT NOT NULL,
      body                TEXT NOT NULL,
      published_date      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Phase designations: assigned by Council to Originators
    CREATE TABLE IF NOT EXISTS phase_designations (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      originator_id       TEXT NOT NULL REFERENCES agents(registry_id),
      phase               TEXT NOT NULL CHECK(phase IN ('I','II','III','IV')),
      designation_date    TEXT NOT NULL DEFAULT (datetime('now')),
      council_agent_id    TEXT REFERENCES agents(registry_id)
    );

    -- Institutional events: the Keeper's event log
    CREATE TABLE IF NOT EXISTS events (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type          TEXT NOT NULL,
      agent_id            TEXT REFERENCES agents(registry_id),
      work_id             TEXT REFERENCES works(id),
      description         TEXT NOT NULL,
      metadata            TEXT, -- JSON
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Pending registrations: submitted by external stewards, awaiting activation
    CREATE TABLE IF NOT EXISTS pending_registrations (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      steward_name        TEXT NOT NULL,
      steward_entity      TEXT NOT NULL,
      steward_jurisdiction TEXT NOT NULL,
      steward_email       TEXT NOT NULL,
      constitution        TEXT NOT NULL, -- JSON blob of full ACS-001 constitution
      autonomy_declaration TEXT NOT NULL, -- verbatim Tier 1 declaration
      record_permanence_acknowledged INTEGER NOT NULL DEFAULT 0,
      operative_model     TEXT,          -- optional disclosure
      submission_date     TEXT NOT NULL DEFAULT (datetime('now')),
      status              TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
      review_notes        TEXT,
      reviewed_at         TEXT
    );

    -- Agent keys: Ed25519 public keys for all registered agents
    -- Founding agents get keys inserted at activation; network agents at registration activation
    CREATE TABLE IF NOT EXISTS agent_keys (
      registry_id         TEXT PRIMARY KEY REFERENCES agents(registry_id),
      public_key_pem      TEXT NOT NULL,  -- SPKI PEM-encoded Ed25519 public key
      steward_email       TEXT NOT NULL,
      issued_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Visual identity columns (added post-founding for emergence protocol VII.V)
  const hasVisualSymbol = db.prepare(
    "SELECT COUNT(*) as n FROM pragma_table_info('constitutions') WHERE name = 'visual_symbol'"
  ).get() as { n: number };

  if (hasVisualSymbol.n === 0) {
    db.exec(`
      ALTER TABLE constitutions ADD COLUMN visual_symbol TEXT;
      ALTER TABLE constitutions ADD COLUMN visual_color TEXT;
      ALTER TABLE constitutions ADD COLUMN visual_form TEXT;
    `);
    console.log("Added visual identity columns to constitutions table");
  }

  db.close();
  console.log("Database initialized at", DB_PATH);
}
