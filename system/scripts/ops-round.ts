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
import { FROM_DOMAIN } from "../src/steward-mail";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyArg = args.indexOf("--only") >= 0 ? args[args.indexOf("--only") + 1] : null;
// The render/share matrix needs a browser, so it is opt-in: a local round stays
// fast, and the scheduled round asks for it.
const withMatrix = args.includes("--with-matrix");
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

/** Canon verdict counts as the bundled snapshot has them. */
function snapshotVerdicts(): Record<string, number> | null {
  const file = path.join(REPO, "website", "data", "snapshot.db");
  if (!fs.existsSync(file)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require("better-sqlite3");
    const db = new Database(file, { readonly: true, fileMustExist: true });
    const rows = db.prepare("SELECT status, COUNT(*) AS n FROM canon_status GROUP BY status").all() as
      { status: string; n: number }[];
    db.close();
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = Number(r.n);
    return out;
  } catch {
    return null;
  }
}

/**
 * How current the bundled snapshot actually is, read from its CONTENTS.
 *
 * Not from the file's modification time. A CI checkout stamps every file with
 * the moment it was written, so mtime says "brand new" for a snapshot exported
 * days ago — which made D2 always report a fresh snapshot and made E1 probe a
 * work the deployed site could not possibly know about.
 *
 * Returns null when the snapshot cannot be read, and callers then skip rather
 * than guess.
 */
function snapshotNewestWork(): string | null {
  const file = path.join(REPO, "website", "data", "snapshot.db");
  if (!fs.existsSync(file)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require("better-sqlite3");
    const db = new Database(file, { readonly: true, fileMustExist: true });
    const row = db.prepare("SELECT MAX(created_at) AS newest FROM works").get() as { newest?: string };
    db.close();
    return row?.newest ?? null;
  } catch {
    return null;
  }
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

  // Every preview is counted, with no size pre-filter.
  //
  // There used to be one — "a blank PNG of a flat colour compresses to almost
  // nothing", skip anything over 12 KB — and it is why MNA-OR-0001-W-0027 sat
  // on /archive as a black rectangle. Captures are 2000×2000 at
  // deviceScaleFactor 2, and at that size even a PNG of ONE colour weighs
  // 16 KB. The check skipped the only perfectly blank preview in the
  // collection, and would have flagged it in an instant had it looked: one
  // colour, covering 100% of the frame.
  //
  // The filter existed to avoid a Python process per work. Counting them in a
  // single batched call is both faster than that and free of a threshold that
  // has to be guessed.
  const present = works
    .map((w) => ({ w, p: path.join(PREVIEW_DIR, `${w.id}.png`) }))
    .filter(({ p }) => fs.existsSync(p));
  if (present.length === 0) {
    record({ check: "A2", severity: "note", summary: "no previews to inspect" });
    return;
  }

  let counts = new Map<string, number>();
  try {
    const out = run("python3", [
      "-c",
      `import sys
from PIL import Image
for p in sys.argv[1:]:
    try:
        print(p + "\\t" + str(len(set(Image.open(p).convert("RGB").getdata()))))
    except Exception:
        print(p + "\\t-1")`,
      ...present.map(({ p }) => p),
    ]);
    counts = new Map(
      out.trim().split("\n").map((line) => {
        const [p, n] = line.split("\t");
        return [p, Number(n)] as [string, number];
      }),
    );
  } catch {
    record({ check: "A2", severity: "note", summary: "blank-preview check skipped (Pillow unavailable)" });
    return;
  }

  for (const { w, p } of present) {
    const colours = counts.get(p);
    if (colours === undefined || colours < 0) continue;
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
    // A repaired payload renders differently, so the preview taken before the
    // repair is a photograph of the break. This used to read "previews need
    // regenerating" — an instruction written into a summary string, which
    // nothing executed. MNA-OR-0001-W-0027 was captured at 20:35 and repaired
    // at 21:16 on 2026-08-26, and showed a black rectangle on /archive until a
    // person noticed. A follow-up that matters belongs in code, not in prose.
    // The Conservator prints "{id} [{format}] ✓ {diagnostic}" per work, and ✗
    // for one it could not recover. Only the ticked ones are worth recapturing.
    const ids = [...new Set(
      [...w.matchAll(/^(MNA-OR-\d{4}-W-\d{4}) \[[^\]]+\] ✓/gm)].map((x) => x[1]),
    )];
    const regenerated: string[] = [];
    const stillBroken: string[] = [];

    // If the parse and the count disagree, say so rather than regenerating
    // nothing quietly. A follow-up that silently matches zero works is the same
    // failure as one that was never written.
    if (ids.length !== nRep) {
      record({ check: "A3", severity: "escalate",
        summary: `Conservator reported ${nRep} repair(s) but ${ids.length} could be identified for recapture`,
        nextStep: "npx tsx system/scripts/generate-work-previews.ts --missing" });
    }

    for (const id of ids) {
      const p = path.join(PREVIEW_DIR, `${id}.png`);
      // generate-work-previews reports failures in its summary and still exits
      // 0, so the exit code proves nothing. Compare the file itself.
      const before = fs.existsSync(p) ? fs.statSync(p).size + ":" + fs.readFileSync(p).length : "";
      try {
        run("npx", ["tsx", "system/scripts/generate-work-previews.ts", "--work", id]);
      } catch { /* fall through to the file check, which is the real answer */ }
      const after = fs.existsSync(p) ? fs.statSync(p).size + ":" + fs.readFileSync(p).length : "";
      if (after && after !== before) regenerated.push(id);
      else stillBroken.push(id);
    }
    record({ check: "A3", severity: "repaired",
      summary: `Conservator recovered ${nRep} truncated payload(s); regenerated ${regenerated.length} preview(s)`,
      items: regenerated });
    if (stillBroken.length) {
      record({ check: "A3", severity: "escalate",
        summary: `${stillBroken.length} preview(s) could not be regenerated after repair`,
        items: stillBroken,
        nextStep: `npx tsx system/scripts/generate-work-previews.ts --work ${stillBroken[0]}` });
    }
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

/**
 * C3 — the escalation channel itself.
 *
 * Every other check in section C ends in a message to a person. For months
 * `RESEND_API_KEY` existed in repository secrets with an empty value, so every
 * one of those messages would have failed to send and no round could have said
 * so: a broken alarm is silent in exactly the way a well institution is.
 *
 * This asks Resend whether the key is real and the sending domain is verified.
 * It sends nothing — a test mail to prove mail works is itself a "nothing to
 * report" mail, which §V forbids.
 *
 * When this escalates, ops-notify cannot deliver it. That is intended: the
 * notifier writes the run's summary before it tries to send, and warns loudly
 * when it cannot, so the finding survives its own subject matter.
 */
async function checkC3(): Promise<void> {
  const key = clean(process.env.RESEND_API_KEY);
  const SET_SECRET = "gh secret set RESEND_API_KEY   # value from resend.com/api-keys";

  if (!key) {
    record({ check: "C3", severity: "escalate",
      summary: "no RESEND_API_KEY — the round cannot write to the steward, and accession notices cannot send",
      nextStep: SET_SECRET });
    return;
  }

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
  } catch (e) {
    record({ check: "C3", severity: "note",
      summary: `could not reach Resend to verify the notifier: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}` });
    return;
  }

  // The request carries no body and no parameters, so a 4xx here can only be
  // about the credential. Resend answers an invalid key with **400** and the
  // message "API key is invalid" — not the 401 this check first assumed, which
  // let a garbage key pass as an unverified note. Read the body, not the code.
  if (res.status >= 400 && res.status < 500) {
    const detail = (await res.text()).slice(0, 120);
    record({ check: "C3", severity: "escalate",
      summary: `RESEND_API_KEY is set but rejected (HTTP ${res.status}: ${detail}) — no institutional email can send`,
      nextStep: SET_SECRET });
    return;
  }
  if (!res.ok) {
    // 5xx is Resend having a bad minute, not the institution having a fault.
    record({ check: "C3", severity: "note", summary: `Resend returned HTTP ${res.status}; notifier unverified this round` });
    return;
  }

  // The key works. The domain it sends from must also be verified, or mail is
  // accepted by the API and never delivered.
  const sender = FROM_DOMAIN;
  const body = (await res.json()) as { data?: { name: string; status: string; capabilities?: { sending?: string } }[] };
  const domain = (body.data ?? []).find((d) => d.name === sender);

  if (!domain) {
    record({ check: "C3", severity: "escalate",
      summary: `the notifier's key is valid but ${sender} is not among its verified domains`,
      nextStep: `add and verify ${sender} at resend.com/domains` });
    return;
  }
  if (domain.status !== "verified" || domain.capabilities?.sending === "disabled") {
    record({ check: "C3", severity: "escalate",
      summary: `${sender} is ${domain.status}, sending ${domain.capabilities?.sending ?? "unknown"} — mail will not arrive`,
      nextStep: `resend.com/domains → ${sender}` });
    return;
  }

  record({ check: "C3", severity: "note", summary: `the steward is reachable (${sender} verified)` });
}

/* ─── D. Data and deployment ────────────────────────────────────────────── */

/**
 * The paths a change must touch for the site to need redeploying.
 *
 * Read from deploy-website.yml rather than retyped, so this cannot drift from
 * the rule the deploy itself uses.
 */
function deployRelevantPaths(): string[] {
  const wf = path.join(REPO, ".github", "workflows", "deploy-website.yml");
  try {
    const src = fs.readFileSync(wf, "utf8");
    const block = src.slice(src.indexOf("paths:"), src.indexOf("workflow_dispatch:"));
    const globs = [...block.matchAll(/^\s*-\s*"([^"]+)"/gm)].map((m) => m[1]);
    return globs.length ? globs : ["website/**"];
  } catch {
    return ["website/**"];
  }
}

async function checkD1(): Promise<void> {
  // Compared against the newest commit that touches something the site
  // actually serves — NOT master's tip.
  //
  // deploy-website.yml only fires for website/, founding-documents/, party/ and
  // a couple of files, precisely so a system-only change does not rebuild the
  // site. Comparing to the tip therefore reported the site as behind after
  // every tooling commit, and in a live round would have dispatched a pointless
  // deploy every three hours forever.
  let expected = "";
  try {
    run("git", ["fetch", "-q", "origin", "master"]);
    expected = run("git", ["log", "-1", "--format=%H", "origin/master", "--", ...deployRelevantPaths()]).trim();
  } catch {
    record({ check: "D1", severity: "note", summary: "could not read origin/master" });
    return;
  }
  if (!expected) {
    record({ check: "D1", severity: "note", summary: "no deploy-relevant commit found" });
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

  if (deployed === expected) {
    record({ check: "D1", severity: "note", summary: `site is current (${deployed.slice(0, 7)})` });
    return;
  }

  // The deployed commit may be NEWER than the last site-relevant one, when a
  // later tooling commit was deployed anyway. That is not behind.
  let behind = true;
  try {
    run("git", ["merge-base", "--is-ancestor", expected, deployed]);
    behind = false;
  } catch {
    behind = true;
  }
  if (!behind) {
    record({ check: "D1", severity: "note", summary: `site is current (${deployed.slice(0, 7)}, at or past the last site change)` });
    return;
  }

  if (dryRun) {
    record({ check: "D1", severity: "escalate", summary: `site at ${deployed.slice(0, 7)}, last site change at ${expected.slice(0, 7)}`,
      nextStep: "gh workflow run deploy-website.yml --ref master" });
    return;
  }
  try {
    run("gh", ["workflow", "run", "deploy-website.yml", "--ref", "master"]);
    record({ check: "D1", severity: "repaired", summary: `dispatched a deploy (site was at ${deployed.slice(0, 7)}, site change at ${expected.slice(0, 7)})` });
  } catch {
    record({ check: "D1", severity: "escalate", summary: "deploy dispatch failed", nextStep: "gh workflow run deploy-website.yml --ref master" });
  }
}

async function checkD2(db: Client, works: WorkRow[]): Promise<void> {
  const newest = snapshotNewestWork();
  if (newest === null) {
    record({ check: "D2", severity: "escalate", summary: "no readable bundled snapshot",
      nextStep: "gh workflow run snapshot-refresh.yml" });
    return;
  }
  const ageHours = minutesSince(newest) / 60;

  // Staleness is a question about CONTENTS, not about the clock.
  //
  // This used to allow 24 hours and say nothing else, so a work canonised just
  // after the daily 09:00 refresh stayed invisible on the public site for
  // nearly a day while every round in between reported "snapshot holds work up
  // to Nh old" as a cheerful note. The steward noticed before the check did.
  //
  // Two ways the snapshot can be behind, and neither is a duration:
  const missingWorks = works.filter((w) => w.created_at > newest).map((w) => w.id);

  // A verdict arrives hours after the work it belongs to, and does not move
  // created_at — a work can be present in the snapshot and still shown as
  // SUBMITTED there long after the Council decided. Counting verdicts catches
  // what a timestamp comparison cannot.
  const snapVerdicts = snapshotVerdicts();
  let verdictDrift = "";
  if (snapVerdicts) {
    const live = await db.execute("SELECT status, COUNT(*) AS n FROM canon_status GROUP BY status");
    for (const row of live.rows as unknown as { status: string; n: number }[]) {
      const there = snapVerdicts[row.status] ?? 0;
      if (Number(row.n) !== there) verdictDrift += `${row.status} ${there}\u2192${Number(row.n)} `;
    }
  }

  const behind = missingWorks.length > 0 || verdictDrift !== "" || ageHours >= 24;
  if (!behind) {
    record({ check: "D2", severity: "note", summary: `snapshot is current (newest work ${ageHours.toFixed(1)}h old)` });
    return;
  }

  const why = [
    missingWorks.length ? `${missingWorks.length} work(s) not in it` : "",
    verdictDrift ? `verdicts moved: ${verdictDrift.trim()}` : "",
    ageHours >= 24 ? `${ageHours.toFixed(1)}h old` : "",
  ].filter(Boolean).join("; ");

  if (dryRun) {
    record({ check: "D2", severity: "escalate", summary: `snapshot is behind — ${why}`,
      items: missingWorks.slice(0, 10),
      nextStep: "gh workflow run snapshot-refresh.yml" });
    return;
  }
  try {
    run("gh", ["workflow", "run", "snapshot-refresh.yml"]);
    record({ check: "D2", severity: "repaired", summary: `dispatched a snapshot refresh — ${why}`,
      items: missingWorks.slice(0, 10) });
  } catch {
    record({ check: "D2", severity: "escalate", summary: "snapshot refresh dispatch failed", nextStep: "gh workflow run snapshot-refresh.yml" });
  }
}

/* ─── E. The public surface ─────────────────────────────────────────────── */

async function checkE1(db: Client): Promise<void> {
  const routes = ["/", "/canon", "/archive", "/agents", "/museum", "/materials", "/log"];
  // The newest work is NOT a fair probe. Public browsing surfaces are
  // snapshot-first by design, so a work submitted since the last export
  // legitimately 404s there — that is the architecture working, not an outage.
  //
  // The cutoff comes from the snapshot's own newest row, not the file's mtime:
  // a CI checkout rewrites mtime to "now", which made this probe the very
  // newest work every time and report a 404 on every run.
  const cutoff = snapshotNewestWork();
  if (cutoff) {
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

/* ─── E2/E3. Every medium still renders, and still shares. ──────────────── */

/**
 * Drives render-matrix.ts, which exercises one fixture per medium against the
 * deployed site — including the ingredient path for every host, and the share
 * path for every medium.
 *
 * This is the check that would have caught the typeface sharing as a card
 * bearing its own ID, the audio playing silence, and every video going out as
 * VP9. It uses fixtures rather than works, so a medium is proven before an
 * Originator relies on it.
 */
async function checkE2E3(): Promise<void> {
  if (!withMatrix) {
    record({ check: "E2", severity: "note", summary: "render/share matrix skipped (pass --with-matrix)" });
    return;
  }
  const outFile = path.join(REPO, "render-matrix.json");
  try {
    run("npx", ["tsx", "system/scripts/render-matrix.ts"]);
    record({ check: "E2", severity: "note", summary: "every medium renders and shares as promised" });
  } catch {
    // A non-zero exit means at least one medium failed; the file names which.
    let failed: string[] = [];
    try {
      const report = JSON.parse(fs.readFileSync(outFile, "utf8")) as {
        results: { medium: string; check: string; ok: boolean; detail: string }[];
      };
      failed = report.results.filter((r) => !r.ok).map((r) => `${r.medium} ${r.check}: ${r.detail}`);
    } catch { /* fall through to a bare report */ }
    record({ check: "E2", severity: "escalate",
      summary: failed.length ? `${failed.length} medium check(s) failed` : "the render/share matrix failed",
      items: failed,
      nextStep: "npx tsx system/scripts/render-matrix.ts" });
  }
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
  await attempt("C3", () => checkC3());
  await attempt("D1", () => checkD1());
  await attempt("D2", () => checkD2(db, works));
  await attempt("E1", () => checkE1(db));
  await attempt("E2", () => checkE2E3());

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
