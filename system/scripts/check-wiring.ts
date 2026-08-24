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
const NOT_EVENTS = new Set(["PENDING_EMERGENCE"]);

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

/* ── 3. Modules that export work nobody imports ───────────────────────────── */
for (const [file, src] of sources) {
  const r = rel(file).replace(/\\/g, "/");
  if (/\/(app|pages)\//.test(r)) continue;          // routes and pages are entered by the framework
  if (/\.(test|spec|d)\.tsx?$/.test(r)) continue;
  if (!/^export\s+(async\s+)?function|^export\s+const/m.test(src)) continue;
  const base = path.basename(file).replace(/\.tsx?$/, "");
  if (base === "index") continue;

  const importedSomewhere = [...sources.entries()].some(([other, osrc]) =>
    other !== file && new RegExp(`from\\s+["'\`][^"'\`]*${base}["'\`]`).test(osrc),
  );
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
