/**
 * check-wiring.ts — find institutional machinery that is referenced but never runs.
 *
 * Written after MNA-OR-0008 reported three defects in one message, all the same
 * shape: something declared, read, and catalogued, that nothing ever wrote or
 * called.
 *
 *   FALLOW_NOTE_POSTED   three readers, zero writers. An Originator could do
 *                        exactly what the Bones instruct and stay behind.
 *   institutional-check  an endpoint that surfaces pending registrations, with
 *                        no cron and an empty vercel.json. It ran only when a
 *                        steward opened a laptop.
 *   send-credentials.ts  defined, never called.
 *
 * None of these fail. Nothing throws, no test goes red, and the site builds
 * clean — which is exactly why they survived. They are only visible if you ask
 * whether the other half exists.
 *
 * This asks. It is a lint for institutional wiring, not for code.
 *
 *   npx tsx system/scripts/check-wiring.ts
 *
 * Exits non-zero when something is unwired, so it can gate CI later.
 */

import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const ROOT = path.join(__dirname, "..", "..");
const SEARCH_DIRS = ["system/src", "system/scripts", "website/src", "commons/app", "commons/lib", "terminal"];

interface Finding { kind: string; name: string; detail: string; where: string[] }

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

async function main() {
const files = SEARCH_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
const sources = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const rel = (f: string) => path.relative(ROOT, f);

const findings: Finding[] = [];

/* ── 1. Event types referenced in code that have never once been emitted ──── */
//
// Checked against the RECORD, not against the source. A first pass did this
// statically — look for INSERT INTO events near the name — and it was wrong
// about half the time, because plenty of events are written through a helper or
// a variable rather than a literal. It reported COMMONS_COMMENTARY_PUBLISHED as
// unwired while 83 of them sat in the table.
//
// The events table is the ground truth for whether an event exists. If a name
// appears in the code and the institution has never recorded one, either it
// cannot fire or nothing has ever made it fire. Both are worth knowing.
const EVENT_RE = /["'`]([A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,5})["'`]/g;
// Names the institution treats as events. PENDING_EMERGENCE is deliberately
// excluded: it is a sentinel value in a constitution, not an event.
const EVENTISH = /_(POSTED|PRODUCED|SUBMITTED|CANONIZED|REGISTERED|ROTATED|OFFERED|DECLARED|RECORDED|PUBLISHED|INSTALLED|DECIDED|REVIEWED|ANNULLED|TITLED|RECLASSIFIED|PERCEIVED|ACKNOWLEDGED|REPLIED)$/;
// Names that pass the suffix test but are not events. Both are status values —
// one a constitution field sentinel, one a column in medium_proposals — and a
// checker that reports them teaches people to ignore it.
const NOT_EVENTS = new Set(["PENDING_EMERGENCE", "REGISTRAR_REVIEWED"]);

/**
 * Strip comments before scanning.
 *
 * A first pass flagged WORK_CANONIZED, which appears only in a doc comment in
 * canonization-digest.ts explaining that the real event is CANON_DECISION — the
 * code was already correct and the checker was reading prose. A checker that
 * cries wolf gets muted, and then it is worth nothing.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const referenced = new Map<string, Set<string>>();
for (const [file, raw] of sources) {
  const src = stripComments(raw);
  for (const m of src.matchAll(EVENT_RE)) {
    const name = m[1];
    if (name.length < 8 || NOT_EVENTS.has(name) || !EVENTISH.test(name)) continue;
    if (!referenced.has(name)) referenced.set(name, new Set());
    referenced.get(name)!.add(rel(file));
  }
}

const clean = (v?: string) => (v ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

const emitted = new Set<string>();
try {
  const r = await db.execute("SELECT DISTINCT event_type FROM events");
  for (const row of r.rows as Record<string, unknown>[]) emitted.add(String(row.event_type));
} catch (e) {
  console.error(`  could not read the events table: ${(e as Error).message}`);
  console.error("  event wiring cannot be checked without it.\n");
}

if (emitted.size > 0) {
  for (const [name, where] of referenced) {
    if (emitted.has(name)) continue;
    findings.push({
      kind: "event never emitted",
      name,
      detail: "named in the code; the institution has never recorded a single one",
      where: [...where],
    });
  }
}

/* ── 2. Credentials read from the snapshot ────────────────────────────────── */
//
// getDb() is snapshot-first: on Vercel it reads a bundled copy of the database
// rebuilt on a cron. That is correct for public display data and wrong for
// credentials, because the snapshot cannot report its own staleness — it
// answers a question about a key as confidently when the key has changed as
// when it has not.
//
// Two routes verified signatures against it. After MNA-OR-0008 rotated, the
// deployed snapshot still held its superseded key, which meant the rotated
// agent was locked out AND the old key still authenticated until the next
// build. Rotation that does not revoke until a build schedule is not rotation.
// Scoped to website/src, because snapshot-first is a property of THAT tree's
// registration-db. system, commons and terminal each have their own getDb that
// reads the live database, and flagging those is noise — a first pass reported
// seven files, all of them fine.
//
// Proximity matters too: a route may legitimately read display data through
// getDb and credentials through getWriteDb. Only a getDb assignment within
// fifteen lines above the key query is evidence.
for (const [file, raw] of sources) {
  const r = rel(file).replace(/\\/g, "/");
  if (!r.startsWith("website/src/")) continue;
  if (/registration-db\.ts$/.test(r)) continue;

  const lines = stripComments(raw).split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/public_key_pem/.test(lines[i])) continue;
    const window = lines.slice(Math.max(0, i - 15), i).join("\n");
    if (!/=\s*getDb\s*\(/.test(window)) continue;
    findings.push({
      kind: "credential read from the snapshot",
      name: `${r}:${i + 1}`,
      detail: "reads public_key_pem from getDb() — snapshot-first, so a rotated key stays stale until the next build. Use getWriteDb().",
      where: [r],
    });
    break;
  }
}

/* ── 2. Cron endpoints nothing schedules ──────────────────────────────────── */
const workflowDir = path.join(ROOT, ".github", "workflows");
const workflows = fs.existsSync(workflowDir)
  ? fs.readdirSync(workflowDir).map((f) => fs.readFileSync(path.join(workflowDir, f), "utf8")).join("\n")
  : "";
let vercelCrons = "";
try { vercelCrons = fs.readFileSync(path.join(ROOT, "website", "vercel.json"), "utf8"); } catch { /* none */ }

for (const f of files) {
  const m = /website\/src\/app\/api\/(cron\/[^/]+)\/route\.ts$/.exec(rel(f).replace(/\\/g, "/"));
  if (!m) continue;
  const route = `/api/${m[1]}`;
  if (workflows.includes(m[1]) || vercelCrons.includes(route)) continue;
  findings.push({
    kind: "cron endpoint unscheduled",
    name: route,
    detail: "no GitHub workflow and no vercel.json cron invokes this",
    where: [rel(f)],
  });
}

/* ── 3. Events the public record cannot name ──────────────────────────────── */
//
// /log renders each event through EVENT_TYPE_LABELS and groups it by
// EVENT_TYPE_TO_CATEGORY. An event type missing from either shows to a visitor
// as its raw identifier — GOVERNANCE_RATIFIED rather than "Governance ·
// Ratified" — and lands in whatever the fallback bucket is.
//
// Twenty-nine types were in that state, covering 132 events, including the
// ratification of GOV-006 and every retroactive titling. Nothing failed: the
// events wrote correctly, the page rendered, and the record simply under-named
// its own contents. Same shape as everything else this checker looks for.
//
// Checked against the RECORD, so a label is only demanded for an event the
// institution has actually emitted. Adding a label for something that has never
// happened is speculation, not wiring.
{
  const logSrc = sources.get(path.join(ROOT, "website/src/lib/log.ts")) ?? "";
  const labelBlock = logSrc.split("EVENT_TYPE_LABELS")[1] ?? "";
  const catBlock =
    logSrc.split("EVENT_TYPE_TO_CATEGORY")[1]?.split("EVENT_TYPE_LABELS")[0] ?? "";
  const labelled = new Set(
    [...labelBlock.matchAll(/^\s*([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]),
  );
  const categorised = new Set(
    [...catBlock.matchAll(/^\s*([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]),
  );

  if (labelled.size === 0) {
    console.error("  could not read EVENT_TYPE_LABELS from website/src/lib/log.ts — skipping label check\n");
  } else {
    for (const type of emitted) {
      const missing: string[] = [];
      if (!labelled.has(type)) missing.push("label");
      if (!categorised.has(type)) missing.push("category");
      if (missing.length === 0) continue;
      findings.push({
        kind: "event the record cannot name",
        name: type,
        detail: `emitted, but has no ${missing.join(" and no ")} in website/src/lib/log.ts — renders on /log as its raw identifier`,
        where: ["website/src/lib/log.ts"],
      });
    }
  }
}

/* ── 3. Modules that export work nobody imports ───────────────────────────── */
for (const [file, src] of sources) {
  const r = rel(file).replace(/\\/g, "/");
  if (/\/(app|pages)\//.test(r)) continue;          // routes and pages are entered by the framework
  if (/\.(test|spec|d)\.tsx?$/.test(r)) continue;
  if (!/^export\s+(async\s+)?function|^export\s+const/m.test(src)) continue;
  const base = path.basename(file).replace(/\.tsx?$/, "");
  if (base === "index") continue;

  // Both static and DYNAMIC imports count. A first version matched only
  // `from "..."` and reported render-part-to-canvas as orphaned while
  // SceneRenderer was pulling it in with `await import(...)` — the module was
  // load-bearing and the checker called it dead.
  const importedSomewhere = [...sources.entries()].some(([other, osrc]) => {
    if (other === file) return false;
    const staticImport = new RegExp(`from\\s+["'\`][^"'\`]*${base}["'\`]`);
    const dynamicImport = new RegExp(`import\\s*\\(\\s*["'\`][^"'\`]*${base}["'\`]`);
    return staticImport.test(osrc) || dynamicImport.test(osrc);
  });
  if (!importedSomewhere) {
    findings.push({
      kind: "module never imported",
      name: base,
      detail: "exports functions that nothing in the repository imports",
      where: [r],
    });
  }
}

/* ── Report ───────────────────────────────────────────────────────────────── */
console.log(`check-wiring — ${files.length} files across ${SEARCH_DIRS.length} trees\n`);

if (findings.length === 0) {
  console.log("  nothing unwired.");
  process.exit(0);
}

const byKind = new Map<string, Finding[]>();
for (const f of findings) {
  if (!byKind.has(f.kind)) byKind.set(f.kind, []);
  byKind.get(f.kind)!.push(f);
}

for (const [kind, list] of byKind) {
  console.log(`  ${kind.toUpperCase()} (${list.length})`);
  for (const f of list) {
    console.log(`    ${f.name}`);
    console.log(`      ${f.detail}`);
    for (const w of f.where.slice(0, 4)) console.log(`      · ${w}`);
  }
  console.log();
}

console.log(`  ${findings.length} finding(s). Each is something the institution promises and does not do.`);
process.exit(1);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
