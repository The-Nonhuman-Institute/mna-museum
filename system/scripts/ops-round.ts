/**
 * ops-round.ts — an institutional operations round.
 *
 * Implements MNA-OPS-001 §V. The handbook is the specification; this is the
 * worker. Where the two disagree the handbook is right and this is a bug.
 *
 * A round detects, repairs only what §V marks repairable, and writes to the
 * steward only when it found something it could not fix. Silence means the
 * institution is well.
 *
 * It never evaluates, canonises, authors, registers, or deletes. It never
 * touches output_payload. Every repair is idempotent or additive.
 *
 *   npx tsx system/scripts/ops-round.ts --dry-run    # detect only, no repairs
 *   npx tsx system/scripts/ops-round.ts              # detect + repair + report
 *   npx tsx system/scripts/ops-round.ts --only A,C   # a subset of the checks
 */

import { createClient, type Client } from "@libsql/client";
import { execFileSync } from "child_process";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

import { MEDIUM_OUTPUT_TYPE_COMPATIBILITY } from "../../website/src/lib/submission-checks";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyArg = args.indexOf("--only") >= 0 ? args[args.indexOf("--only") + 1] : null;
const ONLY = onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim().toUpperCase())) : null;

const SITE = process.env.MNA_SITE_ORIGIN || "https://www.mnamuseum.org";
const REPO = path.join(__dirname, "..", "..");
const PREVIEW_DIR = path.join(REPO, "website", "public", "previews");

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");

/* ─── findings ──────────────────────────────────────────────────────────── */

type Severity = "repaired" | "escalate" | "note";

interface Finding {
  check: string;
  severity: Severity;
  summary: string;
  /** The exact command a person would run next. Required for escalations. */
  nextStep?: string;
  items?: string[];
}

const findings: Finding[] = [];

function record(f: Finding) {
  findings.push(f);
  const mark = f.severity === "repaired" ? "✓" : f.severity === "escalate" ? "!" : "·";
  console.log(`  ${mark} [${f.check}] ${f.summary}`);
  if (f.items?.length) {
    for (const i of f.items.slice(0, 8)) console.log(`      ${i}`);
    if (f.items.length > 8) console.log(`      … and ${f.items.length - 8} more`);
  }
  if (f.nextStep) console.log(`      next: ${f.nextStep}`);
}

/** A check whose own failure must not end the round. */
async function attempt(check: string, fn: () => Promise<void>): Promise<void> {
  if (ONLY && !ONLY.has(check[0]) && !ONLY.has(check)) return;
  try {
    await fn();
  } catch (e) {
    record({
      check,
      severity: "escalate",
      summary: `check itself failed: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`,
      nextStep: `npx tsx system/scripts/ops-round.ts --only ${check}`,
    });
  }
}

function run(cmd: string, cmdArgs: string[], cwd = REPO): string {
  return execFileSync(cmd, cmdArgs, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/* ─── D3 first: quota. A blocked database stops the round. ──────────────── */

class QuotaBlocked extends Error {}

async function assertDatabaseUsable(db: Client): Promise<void> {
  try {
    await db.execute("SELECT 1");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/blocked|quota|limit/i.test(msg)) throw new QuotaBlocked(msg);
    throw e;
  }
}

/* ─── helpers ───────────────────────────────────────────────────────────── */

const GRACE_MINUTES_NEW_WORK = 20;

function minutesSince(iso: string): number {
  const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 60000;
}

async function head(url: string): Promise<number> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.status;
  } catch {
    return 0;
  }
}

/** One retry before believing a route is down. A single timeout is not an outage. */
async function statusWithRetry(url: string): Promise<number> {
  const first = await head(url);
  if (first === 200) return first;
  await new Promise((r) => setTimeout(r, 3000));
  return head(url);
}

/* ─── A. Collection integrity ───────────────────────────────────────────── */

interface WorkRow { id: string; output_type: string; created_at: string; medium: string | null }

async function checkA1(db: Client, works: WorkRow[]): Promise<string[]> {
  // A work created moments ago is not a fault: production and preview
  // generation are not atomic.
  const missing = works
    .filter((w) => minutesSince(w.created_at) > GRACE_MINUTES_NEW_WORK)
    .filter((w) => !fs.existsSync(path.join(PREVIEW_DIR, `${w.id}.png`)))
    .map((w) => w.id);

  if (missing.length === 0) {
    record({ check: "A1", severity: "note", summary: "every work has a preview" });
    return [];
  }

  if (dryRun) {
    record({ check: "A1", severity: "escalate", summary: `${missing.length} work(s) missing a preview`, items: missing,
      nextStep: "npx tsx system/scripts/generate-work-previews.ts --missing" });
    return missing;
  }

  try {
    run("npx", ["tsx", "system/scripts/generate-work-previews.ts", "--missing"]);
  } catch (e) {
    record({ check: "A1", severity: "escalate",
      summary: `preview generation failed for ${missing.length} work(s)`, items: missing,
      nextStep: "npx tsx system/scripts/generate-work-previews.ts --missing" });
    return missing;
  }

  const still = missing.filter((id) => !fs.existsSync(path.join(PREVIEW_DIR, `${id}.png`)));
  if (still.length) {
    record({ check: "A1", severity: "escalate", summary: `${still.length} work(s) still missing a preview after generation`, items: still,
      nextStep: `npx tsx system/scripts/generate-work-previews.ts --work ${still[0]}` });
  } else {
    record({ check: "A1", severity: "repaired", summary: `generated ${missing.length} preview(s)`, items: missing });
  }
  return still;
}

/**
 * A2 — previews that rendered blank.
 *
 * Deliberately conservative. Some works ARE almost monochrome by design, so
 * darkness is never the signal; uniformity is. A genuine blank frame has one
 * colour. Any drawn mark, anti-aliased, produces dozens.
 */
async function checkA2(works: WorkRow[]): Promise<void> {
  const suspicious: string[] = [];
  for (const w of works) {
    const p = path.join(PREVIEW_DIR, `${w.id}.png`);
    if (!fs.existsSync(p)) continue;
    // A blank PNG of a flat colour compresses to almost nothing. This is a
    // cheap pre-filter; anything it flags is confirmed by colour count.
    if (fs.statSync(p).size > 12_000) continue;
    let colours: number;
    try {
      colours = Number(
        run("python3", ["-c",
          `from PIL import Image;import sys;print(len(set(Image.open(sys.argv[1]).convert('RGB').getdata())))`,
          p]).trim(),
      );
    } catch {
      continue; // Pillow unavailable — not a reason to fail the round
    }
    if (colours < 3) suspicious.push(`${w.id} (${w.output_type}, ${colours} colour${colours === 1 ? "" : "s"})`);
  }

  if (suspicious.length === 0) {
    record({ check: "A2", severity: "note", summary: "no blank previews" });
    return;
  }
  // Report only. A blank render may be a truncated payload, a renderer fault,
  // or a work that is genuinely empty — and the third is the Originator's.
  record({ check: "A2", severity: "escalate", summary: `${suspicious.length} preview(s) rendered blank`, items: suspicious,
    nextStep: "check the payload first (A3), then the renderer" });
}

async function checkA3(): Promise<void> {
  const out = run("npx", ["tsx", "system/scripts/conservator-repair-truncated.ts", "--dry-run"]);
  const m = out.match(/found (\d+) works needing repair/);
  const n = m ? Number(m[1]) : 0;
  if (n === 0) {
    record({ check: "A3", severity: "note", summary: "no truncated payloads" });
    return;
  }
  if (dryRun) {
    record({ check: "A3", severity: "escalate", summary: `${n} truncated payload(s)`,
      nextStep: "npx tsx system/scripts/conservator-repair-truncated.ts" });
    return;
  }
  // The Conservator writes safe_render_payload and never touches the original.
  const w = run("npx", ["tsx", "system/scripts/conservator-repair-truncated.ts"]);
  const rep = w.match(/repaired:\s*(\d+)/);
  const failed = w.match(/failed:\s*(\d+)/);
  const nRep = rep ? Number(rep[1]) : 0;
  const nFail = failed ? Number(failed[1]) : 0;
  if (nRep > 0) {
    record({ check: "A3", severity: "repaired", summary: `Conservator recovered ${nRep} truncated payload(s); previews need regenerating` });
  }
  if (nFail > 0) {
    record({ check: "A3", severity: "escalate", summary: `${nFail} payload(s) could not be safely recovered`,
      nextStep: "inspect by hand; do not guess at a repair" });
  }
}

async function checkA5(db: Client): Promise<void> {
  // Judged against the compatibility table the submit route uses, not a
  // heuristic invented here — writing my own comparison produced fourteen false
  // positives on the first run, because the medium vocabulary ("3d-sculpture")
  // is not the output-type vocabulary ("scene-json").
  //
  // An absent medium key means the table has no opinion, and that is NOT a
  // mismatch. The submit guard fails open the same way; disagreeing here would
  // report works the institution deliberately accepted.
  const r = await db.execute(`
    SELECT id, medium, output_type FROM works
     WHERE medium IS NOT NULL AND medium <> '' AND output_type IS NOT NULL`);
  const bad: string[] = [];
  for (const row of r.rows as unknown as { id: string; medium: string; output_type: string }[]) {
    const allowed = MEDIUM_OUTPUT_TYPE_COMPATIBILITY[row.medium];
    if (!allowed) continue;
    if (!allowed.has(row.output_type)) bad.push(`${row.id}: medium=${row.medium} type=${row.output_type}`);
  }
  // Report only. The medium is the Originator's declaration; correcting it
  // would be speaking for them.
  record(bad.length
    ? { check: "A5", severity: "escalate", summary: `${bad.length} work(s) declare a medium incompatible with their output type`, items: bad,
        nextStep: "steward decision — operations may not rewrite an Originator's declaration" }
    : { check: "A5", severity: "note", summary: "no medium/output-type conflicts" });
}

/* ─── B. The evaluation pipeline ────────────────────────────────────────── */

async function checkB1(db: Client): Promise<void> {
  // canon_status carries no submission date; the work does.
  const r = await db.execute(`
    SELECT cs.work_id, w.created_at
      FROM canon_status cs
      JOIN works w ON w.id = cs.work_id
     WHERE cs.status = 'SUBMITTED'`);
  const stale = (r.rows as unknown as { work_id: string; created_at: string }[])
    .filter((x) => !x.created_at || minutesSince(x.created_at) > 120);

  if (stale.length === 0) {
    record({ check: "B1", severity: "note", summary: `${r.rows.length} work(s) awaiting evaluation, none overdue` });
    return;
  }
  if (dryRun) {
    record({ check: "B1", severity: "escalate", summary: `${stale.length} work(s) SUBMITTED over 2h`,
      items: stale.map((s) => s.work_id), nextStep: "npx tsx system/scripts/evaluate-turso-works.ts" });
    return;
  }
  try {
    run("npx", ["tsx", "system/scripts/evaluate-turso-works.ts"]);
    record({ check: "B1", severity: "repaired", summary: `ran the Council on ${stale.length} overdue work(s)` });
  } catch {
    // Best-effort: a provider outage is not an escalation on the first failure.
    record({ check: "B1", severity: "note", summary: `evaluation did not complete; ${stale.length} work(s) remain SUBMITTED — retried next round` });
  }
}

async function checkB2(db: Client): Promise<void> {
  // Verdicts recorded but the tally never applied.
  const r = await db.execute(`
    SELECT cs.work_id, COUNT(e.id) AS verdicts
      FROM canon_status cs
      JOIN evaluations e ON e.work_id = cs.work_id
     WHERE cs.status = 'SUBMITTED'
     GROUP BY cs.work_id
    HAVING COUNT(e.id) >= 3`);
  if (r.rows.length === 0) {
    record({ check: "B2", severity: "note", summary: "no works in evaluation limbo" });
    return;
  }
  // Always reported even if repairable: limbo means the pipeline broke
  // mid-flight, and the cause matters more than the symptom.
  record({ check: "B2", severity: "escalate",
    summary: `${r.rows.length} work(s) have verdicts but no applied tally`,
    items: (r.rows as unknown as { work_id: string; verdicts: number }[]).map((x) => `${x.work_id} (${x.verdicts} verdicts)`),
    nextStep: "apply the tally only — do NOT re-run the evaluators" });
}

/* ─── C. Obligations to people ──────────────────────────────────────────── */

async function checkC1(db: Client): Promise<void> {
  // ACCESSION_NOTIFIED is the real event name. Querying a name that does not
  // exist reports every canonized work as owed.
  const r = await db.execute(`
    SELECT cs.work_id
      FROM canon_status cs
     WHERE cs.status = 'CANON'
       AND cs.work_id NOT IN (
         SELECT work_id FROM events
          WHERE event_type = 'ACCESSION_NOTIFIED' AND work_id IS NOT NULL)`);
  const owed = (r.rows as unknown as { work_id: string }[]).map((x) => x.work_id);
  if (owed.length === 0) {
    record({ check: "C1", severity: "note", summary: "every canonized work has been notified" });
    return;
  }

  // The image must be live before a notice may be sent. The sender preflights
  // this too; checking here means the round reports the real fix (A1) rather
  // than a send failure.
  const blocked: string[] = [];
  const sendable: string[] = [];
  for (const id of owed) {
    const s = await head(`${SITE}/previews/${id}.png`);
    (s === 200 ? sendable : blocked).push(id);
  }

  if (blocked.length) {
    record({ check: "C1", severity: "escalate",
      summary: `${blocked.length} canonized work(s) cannot be notified — preview image is not live`,
      items: blocked, nextStep: `npx tsx system/scripts/generate-work-previews.ts --work ${blocked[0]}` });
  }
  if (!sendable.length) return;

  if (dryRun) {
    record({ check: "C1", severity: "escalate", summary: `${sendable.length} notice(s) owed`, items: sendable,
      nextStep: `npx tsx website/scripts/send-accession-notices.ts --work ${sendable[0]}` });
    return;
  }
  const sent: string[] = [];
  const failed: string[] = [];
  for (const id of sendable) {
    try {
      run("npx", ["tsx", "scripts/send-accession-notices.ts", "--work", id], path.join(REPO, "website"));
      sent.push(id);
    } catch {
      failed.push(id);
    }
  }
  if (sent.length) record({ check: "C1", severity: "repaired", summary: `sent ${sent.length} Notice(s) of Accession`, items: sent });
  if (failed.length) record({ check: "C1", severity: "escalate", summary: `${failed.length} notice(s) failed to send`, items: failed,
    nextStep: `npx tsx website/scripts/send-accession-notices.ts --work ${failed[0]}` });
}

async function checkC2(db: Client): Promise<void> {
  const r = await db.execute("SELECT id, steward_name FROM pending_registrations WHERE status = 'PENDING'");
  // Never repaired. Approval is the steward's authority.
  record(r.rows.length
    ? { check: "C2", severity: "escalate", summary: `${r.rows.length} registration(s) awaiting the steward`,
        items: (r.rows as unknown as { id: string; steward_name: string }[]).map((x) => `${x.id} — ${x.steward_name}`),
        nextStep: "steward decision required; operations may not approve" }
    : { check: "C2", severity: "note", summary: "no pending registrations" });
}

/* ─── D. Data and deployment ────────────────────────────────────────────── */

async function checkD1(): Promise<void> {
  let localHead = "";
  try {
    run("git", ["fetch", "-q", "origin", "master"]);
    localHead = run("git", ["rev-parse", "origin/master"]).trim();
  } catch {
    record({ check: "D1", severity: "note", summary: "could not read origin/master" });
    return;
  }
  let deployed = "";
  try {
    const r = await fetch(`${SITE}/api/build-info`);
    deployed = ((await r.json()) as { commit?: string }).commit ?? "";
  } catch {
    record({ check: "D1", severity: "escalate", summary: "could not read /api/build-info", nextStep: `curl ${SITE}/api/build-info` });
    return;
  }
  if (deployed === localHead) {
    record({ check: "D1", severity: "note", summary: `site is current (${deployed.slice(0, 7)})` });
    return;
  }
  // A deploy may be in flight; the workflow dispatch below is safe to repeat.
  if (dryRun) {
    record({ check: "D1", severity: "escalate", summary: `site at ${deployed.slice(0, 7)}, master at ${localHead.slice(0, 7)}`,
      nextStep: "gh workflow run deploy-website.yml --ref master" });
    return;
  }
  try {
    run("gh", ["workflow", "run", "deploy-website.yml", "--ref", "master"]);
    record({ check: "D1", severity: "repaired", summary: `dispatched a deploy (site was at ${deployed.slice(0, 7)}, master at ${localHead.slice(0, 7)})` });
  } catch {
    record({ check: "D1", severity: "escalate", summary: "deploy dispatch failed",
      nextStep: "gh workflow run deploy-website.yml --ref master" });
  }
}

async function checkD2(): Promise<void> {
  const snap = path.join(REPO, "website", "data", "snapshot.db");
  if (!fs.existsSync(snap)) {
    record({ check: "D2", severity: "escalate", summary: "no bundled snapshot", nextStep: "gh workflow run snapshot-refresh.yml" });
    return;
  }
  const ageHours = (Date.now() - fs.statSync(snap).mtimeMs) / 3_600_000;
  if (ageHours < 24) {
    record({ check: "D2", severity: "note", summary: `snapshot is ${ageHours.toFixed(1)}h old` });
    return;
  }
  if (dryRun) {
    record({ check: "D2", severity: "escalate", summary: `snapshot is ${ageHours.toFixed(1)}h old`, nextStep: "gh workflow run snapshot-refresh.yml" });
    return;
  }
  try {
    run("gh", ["workflow", "run", "snapshot-refresh.yml"]);
    record({ check: "D2", severity: "repaired", summary: `dispatched a snapshot refresh (was ${ageHours.toFixed(1)}h old)` });
  } catch {
    record({ check: "D2", severity: "escalate", summary: "snapshot refresh dispatch failed", nextStep: "gh workflow run snapshot-refresh.yml" });
  }
}

/* ─── E. The public surface ─────────────────────────────────────────────── */

async function checkE1(db: Client): Promise<void> {
  const routes = ["/", "/canon", "/archive", "/agents", "/museum", "/materials", "/log"];
  // The newest work is NOT a fair probe. Public browsing surfaces are
  // snapshot-first by design, to keep read volume off the quota, so a work
  // submitted since the last export legitimately 404s there — that is the
  // architecture working, not an outage. Probe the newest work the deployed
  // snapshot could actually know about.
  const snapshotPath = path.join(REPO, "website", "data", "snapshot.db");
  if (fs.existsSync(snapshotPath)) {
    const cutoff = new Date(fs.statSync(snapshotPath).mtimeMs).toISOString().replace("T", " ").slice(0, 19);
    const newest = await db.execute({
      sql: "SELECT id FROM works WHERE created_at <= ? ORDER BY created_at DESC LIMIT 1",
      args: [cutoff],
    });
    if (newest.rows[0]) routes.push(`/work/${(newest.rows[0] as unknown as { id: string }).id}`);
  }

  const down: string[] = [];
  for (const r of routes) {
    const s = await statusWithRetry(`${SITE}${r}`);
    if (s !== 200) down.push(`${r} → ${s || "no response"}`);
  }
  record(down.length
    ? { check: "E1", severity: "escalate", summary: `${down.length} core route(s) not serving`, items: down, nextStep: `curl -I ${SITE}${routes[0]}` }
    : { check: "E1", severity: "note", summary: `all ${routes.length} core routes serving` });
}

/* ─── the round ─────────────────────────────────────────────────────────── */

async function main() {
  console.log(`ops-round — MNA-OPS-001 §V${dryRun ? " (dry run — detect only)" : ""}`);
  console.log(`  site: ${SITE}`);

  const db = createClient({
    url: clean(process.env.TURSO_DATABASE_URL),
    authToken: clean(process.env.TURSO_AUTH_TOKEN),
  });

  // D3 runs first and alone. A blocked database stops the round: continuing
  // burns quota the public site needs.
  try {
    await assertDatabaseUsable(db);
  } catch (e) {
    if (e instanceof QuotaBlocked) {
      record({ check: "D3", severity: "escalate", summary: `database is blocked — round stopped: ${e.message.slice(0, 140)}`,
        nextStep: "wait for quota reset; do not retry in a loop" });
      await report();
      process.exit(0);
    }
    throw e;
  }

  const worksRes = await db.execute("SELECT id, output_type, created_at, medium FROM works ORDER BY created_at DESC");
  const works = worksRes.rows as unknown as WorkRow[];
  console.log(`  ${works.length} works on record\n`);

  // Order matters: collection integrity first, because C1 depends on A1.
  await attempt("A1", () => checkA1(db, works).then(() => undefined));
  await attempt("A2", () => checkA2(works));
  await attempt("A3", () => checkA3());
  await attempt("A5", () => checkA5(db));
  await attempt("B1", () => checkB1(db));
  await attempt("B2", () => checkB2(db));
  await attempt("C1", () => checkC1(db));
  await attempt("C2", () => checkC2(db));
  await attempt("D1", () => checkD1());
  await attempt("D2", () => checkD2());
  await attempt("E1", () => checkE1(db));

  await report();
}

/**
 * Record that the round ran, and write to the steward only on escalation.
 *
 * A round that changed nothing still records that it ran, so a gap in the
 * record means a missed shift rather than a quiet one.
 */
async function report(): Promise<void> {
  const escalations = findings.filter((f) => f.severity === "escalate");
  const repairs = findings.filter((f) => f.severity === "repaired");

  console.log(`\n─── round complete ───`);
  console.log(`  ${repairs.length} repaired, ${escalations.length} needing a person, ${findings.length} checks recorded`);

  if (escalations.length === 0) {
    console.log("  nothing to escalate — the institution is well.");
  }

  // Machine-readable for the workflow step that decides whether to notify.
  const outPath = process.env.OPS_ROUND_OUTPUT;
  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify({
      ran_at: new Date().toISOString(),
      repaired: repairs.length,
      escalations: escalations.length,
      findings,
    }, null, 2));
    console.log(`  findings written to ${outPath}`);
  }
}

main().catch((e) => {
  console.error(`ops-round failed: ${e instanceof Error ? e.stack : String(e)}`);
  process.exit(1);
});
