import { createClient, type Client } from "@libsql/client";
import { generateKeyPairSync, sign } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The review route, run whole against an in-memory database with a real key:
 * what it writes, what it leaves alone, and what it refuses.
 */

let db: Client;
vi.mock("@/lib/registration-db", () => ({ getWriteDb: () => db }));
import { POST } from "../src/app/api/agents/[id]/constitutional-review/route";

const ID = "MNA-OR-0099";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");

async function setup() {
  db = createClient({ url: ":memory:" });
  await db.batch([
    `CREATE TABLE agents (registry_id TEXT PRIMARY KEY, agent_type TEXT, common_designation TEXT, operational_status TEXT,
       color_hex TEXT, glyph_family TEXT)`,
    `CREATE TABLE constitutions (agent_id TEXT, version TEXT, declared_orientation TEXT, formal_tendencies TEXT, aversions TEXT,
       conflict_constraints TEXT, autonomy_declaration TEXT, is_current INTEGER DEFAULT 1, visual_symbol TEXT, visual_color TEXT,
       visual_form TEXT, PRIMARY KEY (agent_id, version))`,
    `CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT, agent_id TEXT, description TEXT, metadata TEXT,
       created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE agent_keys (registry_id TEXT PRIMARY KEY, public_key_pem TEXT)`,
    `CREATE TABLE request_nonces (nonce TEXT PRIMARY KEY, registry_id TEXT)`,
    { sql: `INSERT INTO agents VALUES (?, 'ORIGINATOR', NULL, 'ACTIVE', NULL, NULL)`, args: [ID] },
    { sql: `INSERT INTO constitutions VALUES (?, '1.0', 'orient', '["a","b"]', '["x","y"]', 'cc', 'ad', 1, NULL, NULL, NULL)`, args: [ID] },
    { sql: `INSERT INTO agent_keys VALUES (?, ?)`, args: [ID, publicKey.export({ type: "spki", format: "pem" }).toString()] },
  ], "write");
}
const emerge = () =>
  db.execute({ sql: `INSERT INTO events (event_type, agent_id, metadata) VALUES ('IDENTITY_EMERGENCE', ?, '{"takes_name":false}')`, args: [ID] });

function signed(declaration: Record<string, unknown>) {
  const signature = sign(null, Buffer.from(JSON.stringify({ agent_id: ID, declaration })), privateKey).toString("base64");
  return { ...declaration, signature };
}
const post = (body: unknown) =>
  POST(new Request(`https://x/api/agents/${ID}/constitutional-review`, { method: "POST", body: JSON.stringify(body) }) as never, {
    params: Promise.resolve({ id: ID }),
  });
const rows = async (sql: string) => (await db.execute(sql)).rows as unknown as Record<string, unknown>[];

describe("POST /api/agents/{id}/constitutional-review", () => {
  beforeEach(setup);

  it("refuses an agent that has not emerged", async () => {
    expect((await post(signed({ takes_name: true, common_designation: "N" }))).status).toBe(409);
  });

  it("takes a name, keeps the emergence, and points back to it", async () => {
    await emerge();
    const res = await post(signed({ takes_name: true, common_designation: "N", aversions: ["x", "y"], statement: "why" }));
    expect(res.status).toBe(201);
    expect((await rows("SELECT common_designation FROM agents"))[0].common_designation).toBe("N");
    const ev = await rows("SELECT event_type, metadata FROM events ORDER BY id");
    expect(ev.map((e) => e.event_type)).toEqual(["IDENTITY_EMERGENCE", "CONSTITUTIONAL_REVIEW"]);
    expect(ev[0].metadata).toBe('{"takes_name":false}');
    const m = JSON.parse(String(ev[1].metadata));
    expect(m.supersedes).toEqual({ event_id: 1, event_type: "IDENTITY_EMERGENCE" });
    expect(m.changed_fields).toEqual(["common_designation"]);
    expect(m.affirmed_fields).toEqual(["aversions"]);
    expect(m.statement).toBe("why");
    // A name alone is not a new constitution.
    expect(await rows("SELECT version, is_current FROM constitutions")).toEqual([{ version: "1.0", is_current: 1 }]);
  });

  it("makes a changed constitution a new version and keeps the old", async () => {
    await emerge();
    expect((await post(signed({ declared_orientation: "new", trigger: "an observation" }))).status).toBe(201);
    const c = await rows("SELECT version, is_current, declared_orientation, aversions, conflict_constraints FROM constitutions ORDER BY version");
    expect(c).toEqual([
      { version: "1.0", is_current: 0, declared_orientation: "orient", aversions: '["x","y"]', conflict_constraints: "cc" },
      { version: "1.1", is_current: 1, declared_orientation: "new", aversions: '["x","y"]', conflict_constraints: "cc" },
    ]);
  });

  it("refuses a body not signed by the agent's key, and the same signature twice", async () => {
    await emerge();
    const good = signed({ takes_name: true, common_designation: "N" });
    expect((await post({ ...good, common_designation: "Other" })).status).toBe(403);
    expect((await post(good)).status).toBe(201);
    expect((await post(good)).status).toBe(409);
    expect((await rows("SELECT COUNT(*) n FROM events WHERE event_type = 'CONSTITUTIONAL_REVIEW'"))[0].n).toBe(1);
  });

  it("supersedes the latest review, not the emergence, the second time", async () => {
    await emerge();
    await post(signed({ takes_name: true, common_designation: "N" }));
    await post(signed({ takes_name: false, statement: "set down" }));
    const m = JSON.parse(String((await rows("SELECT metadata FROM events ORDER BY id DESC LIMIT 1"))[0].metadata));
    expect(m.supersedes.event_type).toBe("CONSTITUTIONAL_REVIEW");
    expect((await rows("SELECT common_designation FROM agents"))[0].common_designation).toBeNull();
  });
});
