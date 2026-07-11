/**
 * mint-founders-seal.ts — strike Founder's Seal, Witness No. I, for EVT-00003.
 *
 * A ONE-TIME, deliberate exception to the anonymous-claim Witness Seal spec:
 * struck retroactively for the founding steward who witnessed the first
 * opening. Recorded honestly as such (SEAL_ISSUED event notes founders_exception).
 *
 * Idempotent: safe to re-run. Run from website/:
 *   npx tsx scripts/mint-founders-seal.ts
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import sharp from "sharp";
import { sealPlateSvg, type Seal, type Vis } from "../src/lib/seal";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
function clean(x?: string) {
  return (x ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

const CEREMONY = "EVT-00003";
const SEAL_ID = "founders-seal-i";
const SEED = createHash("sha256").update(`${CEREMONY}:${SEAL_ID}`).digest("hex").slice(0, 12);

const seal: Seal = {
  id: SEAL_ID,
  ceremony_id: CEREMONY,
  seal_number: 1,
  seal_seed: SEED,
  issued_at: "2026-07-11",
  config: {
    title: "FREQUENCY AS STRUCTURE",
    edition: "WITNESS No. I",
    event: "THE FIRST OPENING",
    date: "10 JULY 2026",
    featured: "MNA-OR-0002",
    satellites: ["MNA-OR-0003", "MNA-OR-0004"],
    names: "PULSE · GAP · ∅∇∅",
    unnamed: "and a fourth, yet unnamed — MNA-OR-0007",
  },
};

(async () => {
  // 1. schema
  await db.execute(`CREATE TABLE IF NOT EXISTS seals (
    id          TEXT PRIMARY KEY,
    ceremony_id TEXT NOT NULL,
    seal_number INTEGER NOT NULL,
    seal_seed   TEXT NOT NULL,
    config      TEXT,
    issued_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_seals_ceremony ON seals(ceremony_id, seal_number)`);

  // 2. mint (idempotent)
  const existing = await db.execute({ sql: `SELECT id FROM seals WHERE id = ?`, args: [SEAL_ID] });
  const isNew = existing.rows.length === 0;
  if (isNew) {
    await db.execute({
      sql: `INSERT INTO seals (id, ceremony_id, seal_number, seal_seed, config, issued_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [seal.id, seal.ceremony_id, seal.seal_number, seal.seal_seed, JSON.stringify(seal.config), seal.issued_at],
    });
    // 3. record the issuance — the Keeper records; no identity captured.
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
      args: [
        "SEAL_ISSUED",
        "MNA-KP-0001",
        `Founder's Seal — Witness No. I — struck for ${CEREMONY} "Frequency as Structure," the first opening.`,
        JSON.stringify({
          seal_id: SEAL_ID,
          ceremony_id: CEREMONY,
          seal_number: 1,
          founders_exception: true,
          note: "Deliberate one-time retroactive strike for the founding steward; deviates from the anonymous-claim spec (which debuts Aug 24). Recorded as an exception, not the ordinary rite.",
        }),
      ],
    });
    console.log(`[mint] struck ${SEAL_ID} (seed ${SEED}) + wrote SEAL_ISSUED event.`);
  } else {
    console.log(`[mint] ${SEAL_ID} already exists — skipped insert + event.`);
  }

  // 4. render the downloadable PNG (deterministic) → public/seals/
  const vis = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "src", "data", "visual-identities.json"), "utf8"),
  ) as Vis;
  const svg = sealPlateSvg(seal, vis);
  const outDir = path.join(__dirname, "..", "public", "seals");
  fs.mkdirSync(outDir, { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, `${SEAL_ID}.png`));
  console.log(`[mint] rendered public/seals/${SEAL_ID}.png`);

  // 5. verify
  const check = await db.execute({ sql: `SELECT seal_number, seal_seed, issued_at FROM seals WHERE id = ?`, args: [SEAL_ID] });
  console.log(`[verify] seals row:`, JSON.stringify(check.rows[0]));
  console.log(`\nDone. View at /seal/${SEAL_ID}`);
})().catch((e) => {
  console.error("[mint] error:", e);
  process.exit(1);
});
