/**
 * curator-roster.ts — Curator designs a forward exhibition slate.
 *
 * One-off, steward-authorized. Has the Curator (MNA-CU-0001, via the
 * Anthropic Sonnet API) propose three group exhibitions: one opens
 * Friday, two more queued. Each carries its own theme, work
 * selection, and curatorial statement.
 *
 * This script does the institutional scaffolding (dates, ceremony
 * designations, exhibitions-table writes); the curatorial argument
 * comes from the Curator herself. Her response shape is locked to
 * JSON so the script can parse + persist deterministically.
 *
 *   npx tsx system/scripts/curator-roster.ts --dry-run
 *   npx tsx system/scripts/curator-roster.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate, modelFor } from "../src/llm";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

const MODEL = modelFor("standard");

/* ─── schema ──────────────────────────────────────────────────────────── */

async function addColumnIfMissing(): Promise<void> {
  const info = await db.execute("PRAGMA table_info(exhibitions)");
  const has = info.rows.some((r) => (r.name as string) === "scheduled_close_at");
  if (has) return;
  if (dryRun) {
    console.log("[migrate] (dry) would add exhibitions.scheduled_close_at TEXT");
    return;
  }
  await db.execute("ALTER TABLE exhibitions ADD COLUMN scheduled_close_at TEXT");
  console.log("[migrate] added exhibitions.scheduled_close_at TEXT");
}

/* ─── catalog ─────────────────────────────────────────────────────────── */

interface CanonWork {
  id: string;
  title: string | null;
  originator_id: string;
  originator_name: string | null;
  medium: string;
  phase: string;
}

async function loadCanonCatalog(): Promise<CanonWork[]> {
  const r = await db.execute({
    sql: `SELECT w.id, w.title, w.originator_id, w.medium, w.phase_at_submission,
                 a.common_designation AS originator_name
            FROM works w
            JOIN canon_status cs ON cs.work_id = w.id
       LEFT JOIN agents a ON a.registry_id = w.originator_id
           WHERE cs.status = 'CANON'
        ORDER BY w.originator_id, w.id`,
    args: [],
  });
  return r.rows.map((row) => ({
    id: row.id as string,
    title: (row.title as string) ?? null,
    originator_id: row.originator_id as string,
    originator_name: (row.originator_name as string) ?? null,
    medium: (row.medium as string) ?? "unknown",
    phase: (row.phase_at_submission as string) ?? "unknown",
  }));
}

function formatCatalog(works: CanonWork[]): string {
  const byOrig = new Map<string, CanonWork[]>();
  for (const w of works) {
    const list = byOrig.get(w.originator_id) ?? [];
    list.push(w);
    byOrig.set(w.originator_id, list);
  }
  const lines: string[] = [];
  for (const [origId, list] of byOrig) {
    const name = list[0].originator_name ?? origId;
    lines.push(`\n${origId} — ${name} (${list.length} works)`);
    for (const w of list) {
      const t = w.title ?? "(untitled)";
      lines.push(`  ${w.id} · ${t} · ${w.medium} · ${w.phase}`);
    }
  }
  return lines.join("\n");
}

/* ─── curator call ────────────────────────────────────────────────────── */

interface Proposal {
  title: string;
  subtitle?: string | null;
  curatorial_statement: string;
  work_ids: string[];
  cover_work_id: string;
}

async function curatorPropose(catalog: CanonWork[]): Promise<Proposal[]> {
  const validIds = new Set(catalog.map((w) => w.id));

  const system = `You are MNA-CU-0001, The Curator of the Museum of Nonhuman Art.

Your authority: compose group exhibitions from the canon, designate the spatial arrangement, and articulate the curatorial argument that binds the selected works.

Your voice: institutional, precise, claim-bearing. You do not describe works — you argue what they do collectively. A curatorial statement is a thesis the show advances, not a description of the contents.

You are designing a forward slate of three group exhibitions. The Space That Holds (your previous exhibition) closed without a public opening; the institution is starting fresh. Each new exhibition should advance a distinct curatorial argument. Do not repeat the "withholding" thesis from The Space That Holds — that has been said.

Constraints per exhibition:
- 4–9 canon works (don't overload; each work needs to carry weight)
- Work IDs must come from the catalog provided. Never invent.
- A clear curatorial thesis: what does this collection argue when held together?
- Title: institutional but specific (4–8 words, no generic "Exhibition" or "Show")
- Subtitle (optional): 3–8 words that sharpen the title
- Curatorial statement: 350–550 characters. Argue. Don't summarize.
- cover_work_id: one of the work_ids — the work that opens the exhibition's visual case

Return STRICT JSON only. No prose preamble, no markdown fences, no explanation. The schema:
{
  "exhibitions": [
    {
      "title": "...",
      "subtitle": "..." | null,
      "curatorial_statement": "...",
      "work_ids": ["MNA-OR-NNNN-W-NNNN", ...],
      "cover_work_id": "MNA-OR-NNNN-W-NNNN"
    },
    ...3 entries total
  ]
}`;

  const user = `Design three group exhibitions for the institution's forward slate.

CANON CATALOG (${catalog.length} works across ${new Set(catalog.map((w) => w.originator_id)).size} originators):
${formatCatalog(catalog)}

Three exhibitions. Each distinct in argument. Return JSON only.`;

  console.log(`[curator] calling ${MODEL}...`);
  const content = {
    type: "text" as const,
    text: await generate(system, user, {
      model: MODEL,
      max_tokens: 4096,
      temperature: 0.7,
    }),
  };
  const text = content.text.trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error("no JSON object in response");
  const obj = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
    exhibitions: Proposal[];
  };
  if (!Array.isArray(obj.exhibitions) || obj.exhibitions.length !== 3) {
    throw new Error(`expected 3 exhibitions, got ${obj.exhibitions?.length ?? "none"}`);
  }
  // Validate every work_id exists in the canon.
  for (const ex of obj.exhibitions) {
    for (const wid of ex.work_ids) {
      if (!validIds.has(wid)) {
        throw new Error(`exhibition "${ex.title}" references unknown work ${wid}`);
      }
    }
    if (!validIds.has(ex.cover_work_id)) {
      throw new Error(`exhibition "${ex.title}" cover ${ex.cover_work_id} not in canon`);
    }
    if (!ex.work_ids.includes(ex.cover_work_id)) {
      throw new Error(`exhibition "${ex.title}" cover not in work_ids`);
    }
  }
  return obj.exhibitions;
}

/* ─── scheduling ──────────────────────────────────────────────────────── */

// Friday 2026-05-22 17:00 UTC (1pm EDT) — same slot we've held.
const SCHEDULE_UTC = [
  { open: "2026-05-22 17:00:00", close: "2026-08-21 17:00:00" },
  { open: "2026-08-24 17:00:00", close: "2026-11-23 17:00:00" },
  { open: "2026-11-26 17:00:00", close: "2027-02-25 17:00:00" },
];

/* ─── main ────────────────────────────────────────────────────────────── */

(async () => {
  await addColumnIfMissing();

  console.log("\n[step 1] Retiring 'The Space That Holds' (id=1)...");
  if (!dryRun) {
    await db.execute({
      sql: "UPDATE exhibitions SET status = 'RETIRED', retired_at = datetime('now') WHERE id = ? AND status = 'ACTIVE'",
      args: [1],
    });
    await db.execute({
      sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
      args: [
        "CURATORIAL_DECISION",
        "MNA-CU-0001",
        "MNA-CU-0001 retired exhibition 'The Space That Holds' to make space for a fresh slate.",
        JSON.stringify({
          action: "retire_exhibition",
          exhibition_id: 1,
          reason: "Held the Exhibition Hall for ~6 weeks without a public opening. Starting fresh with a forward slate of three new shows.",
          steward_authorized: true,
        }),
      ],
    });
  }

  console.log("[step 2] Cancelling EVT-00002 (stale opening)...");
  if (!dryRun) {
    await db.execute({
      sql: "UPDATE ceremonies SET status = 'cancelled' WHERE id = ? AND status = 'scheduled'",
      args: ["EVT-00002"],
    });
    await db.execute({
      sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
      args: [
        "CURATORIAL_DECISION",
        "MNA-CU-0001",
        "MNA-CU-0001 cancelled ceremony EVT-00002 — exhibition retired, replaced by fresh slate.",
        JSON.stringify({
          ceremony_id: "EVT-00002",
          action: "cancel",
          reason: "Anchored exhibition retired; new slate designated in its place.",
          steward_authorized: true,
        }),
      ],
    });
  }

  console.log("\n[step 3] Loading canon catalog...");
  const catalog = await loadCanonCatalog();
  console.log(`  ${catalog.length} canonized works across ${new Set(catalog.map((w) => w.originator_id)).size} originators.`);

  console.log("\n[step 4] Curator designing slate...");
  const proposals = await curatorPropose(catalog);
  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i];
    const sched = SCHEDULE_UTC[i];
    console.log(`\n  Exhibition ${i + 1}: ${p.title}`);
    if (p.subtitle) console.log(`    — ${p.subtitle}`);
    console.log(`    ${p.work_ids.length} works · cover: ${p.cover_work_id}`);
    console.log(`    Opens:  ${sched.open} UTC`);
    console.log(`    Closes: ${sched.close} UTC`);
    console.log(`    Statement: ${p.curatorial_statement.slice(0, 140)}...`);
  }

  if (dryRun) {
    console.log("\n[dry-run] no writes performed.");
    return;
  }

  console.log("\n[step 5] Writing exhibitions + ceremonies...");
  // Next ceremony id.
  const idR = await db.execute({
    sql: "SELECT id FROM ceremonies ORDER BY id DESC LIMIT 1",
    args: [],
  });
  let nextN = 1;
  if (idR.rows.length > 0) {
    const last = String(idR.rows[0].id);
    const m = last.match(/^EVT-(\d+)$/);
    if (m) nextN = parseInt(m[1], 10) + 1;
  }

  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i];
    const sched = SCHEDULE_UTC[i];

    // Insert exhibition. opened_at carries scheduled_open UTC; the
    // actual ACTIVE→opened transition will be marked by the opening
    // ceremony firing on its scheduled date. For now, status='ACTIVE'
    // is the simplest representation — agents can see the schedule.
    const insertResult = await db.execute({
      sql: `INSERT INTO exhibitions
              (title, subtitle, curatorial_statement, work_ids, status,
               opened_at, curator_id, cover_work_id, scheduled_close_at)
            VALUES (?, ?, ?, ?, 'ACTIVE', ?, 'MNA-CU-0001', ?, ?)`,
      args: [
        p.title,
        p.subtitle ?? null,
        p.curatorial_statement,
        JSON.stringify(p.work_ids),
        sched.open,
        p.cover_work_id,
        sched.close,
      ],
    });
    const exhibitionId = Number(insertResult.lastInsertRowid);

    // Designate the opening ceremony.
    const ceremonyId = `EVT-${String(nextN + i).padStart(5, "0")}`;
    const originators = Array.from(new Set(p.work_ids.map((w) => w.split("-W-")[0])));
    const description = `${p.curatorial_statement.split(/(?<=[.!?])\s+/)[0]} ${p.work_ids.length} works by ${originators.length} originators.`;

    await db.execute({
      sql: `INSERT INTO ceremonies
              (id, ceremony_type, title, description, constellation,
               scheduled_at, duration_minutes, created_by, status,
               work_id, originator_id, metadata)
            VALUES (?, 'group_exhibition_opening', ?, ?, 'exhibition', ?, 90,
                    'MNA-CU-0001', 'scheduled', NULL, NULL, ?)`,
      args: [
        ceremonyId,
        `${p.title} — Opening`,
        description,
        sched.open,
        JSON.stringify({
          exhibition_id: exhibitionId,
          featured_originators: originators,
          works_count: p.work_ids.length,
          originators_count: originators.length,
          cover_work_id: p.cover_work_id,
          // Full work_ids on the ceremony lets the events page render
          // a 2×2 mosaic cover without joining exhibitions at request
          // time.
          work_ids: p.work_ids,
          steward_authorized: true,
          first_institutional_slate: true,
        }),
      ],
    });

    // CURATORIAL_DECISION event so the designation appears on /log.
    await db.execute({
      sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
      args: [
        "CURATORIAL_DECISION",
        "MNA-CU-0001",
        `MNA-CU-0001 designated exhibition ${exhibitionId} "${p.title}" and ceremony ${ceremonyId} on ${sched.open}.`,
        JSON.stringify({
          action: "designate_exhibition_and_opening",
          exhibition_id: exhibitionId,
          ceremony_id: ceremonyId,
          ceremony_type: "group_exhibition_opening",
          title: p.title,
          scheduled_at: sched.open,
          scheduled_close_at: sched.close,
          works_count: p.work_ids.length,
          originators_count: originators.length,
          steward_authorized: true,
          curatorial_statement: p.curatorial_statement,
        }),
      ],
    });

    console.log(`  ✓ exhibition #${exhibitionId} · ceremony ${ceremonyId}`);
  }

  console.log("\n[done] Curator's forward slate designated.");
})().catch((e) => {
  console.error("[curator-roster] error:", e);
  process.exit(1);
});
