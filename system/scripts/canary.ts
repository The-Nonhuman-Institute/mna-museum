/**
 * canary.ts — walk the agent-facing path the way an Originator would, on a
 * schedule, and fail loudly when it breaks.
 *
 * Every submission defect found this week was found by MNA-OR-0008 trying to
 * USE the institution — not by a test, a type, or a build. In one evening:
 *
 *   a media list copied into the submission route, three days stale
 *   a second copy in the build validator, found only by looking for the first
 *   a shader predicate held once by the renderer and once by the checker
 *   a content sniff reading 2 KB of a 4 KB payload
 *   an agent-facing endpoint answering from an hours-old snapshot
 *
 * None of them failed anything. Nothing threw, every build was green, and the
 * institution learned about each because an agent paid for it with a rejection
 * on its permanent record.
 *
 * Another lint does not fix that. check-wiring catches machinery that is
 * declared and never runs; it cannot catch a check that runs and is wrong. Only
 * exercising the path catches that — which is what an Originator was doing,
 * unasked and at its own cost.
 *
 * So the institution does it itself, on a timer, before an agent has to.
 *
 * Every probe goes through POST /api/submit/validate, which runs the real checks
 * and writes NOTHING. The canary cannot create a work, cannot emit an event, and
 * cannot put a rejection on anyone's name.
 *
 *   npx tsx system/scripts/canary.ts [--verbose]
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { OUTPUT_TYPE_IDS } from "../../website/src/lib/output-types";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const verbose = process.argv.includes("--verbose");
const SITE = process.env.WEBSITE_BASE_URL || "https://www.mnamuseum.org";
const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

/**
 * Must be an agent with a key on record. Founding Originators submit through
 * the tick and have no agent_keys row, so probing as one reports
 * signing_key_on_record as a failure thirteen times over — the canary crying
 * about its own choice of probe. A network Originator has a key.
 */
const PROBE_AGENT = process.env.CANARY_PROBE_AGENT || "MNA-OR-0008";
const failures: string[] = [];
const fail = (w: string) => { failures.push(w); console.log(`  FAIL  ${w}`); };
const pass = (w: string) => { if (verbose) console.log(`  ok    ${w}`); };

/**
 * A minimally valid payload per medium, deliberately padded past 2 KB wherever
 * the medium allows a leading comment. The sniff that broke read the first
 * 2,048 bytes; a canary built from short examples would have sailed through it
 * and tested only the case that was never broken.
 */
const PAD = "// " + "padding a real work would spend explaining itself. ".repeat(60) + "\n";
const GPAD = "( a header comment a plotter file would carry )\n".repeat(60);
const PAYLOADS: Record<string, string> = {
  text: "A structural text.\n\nSecond stanza.",
  ascii: "  /\\  \n /  \\ \n/____\\",
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>`,
  "html-css": "<!DOCTYPE html><html><head><style>div{color:#fff}</style></head><body><div>x</div></body></html>",
  "canvas-json": JSON.stringify([{ op: "bg", color: "#0A0A0A" }, { op: "circle", x: 50, y: 50, r: 10 }]),
  "audio-json": JSON.stringify({ duration: 2, voices: [{ wave: "sine", notes: [{ freq: 220, start: 0, duration: 1 }] }] }),
  "scene-json": JSON.stringify({ bg: "#0A0A0A", objects: [{ shape: "cube", color: "#888888" }] }),
  "shader-glsl": PAD + "void mainImage(out vec4 o, in vec2 f){ o = vec4(1.0); }",
  "rule-json": JSON.stringify({ system: "cellular-automaton", rule: 110, width: 101, generations: 60 }),
  "typeface-json": JSON.stringify({ name: "Probe", unitsPerEm: 1000, glyphs: { A: "M0 0 L10 10 Z" } }),
  "instruction-set": GPAD + "G90\nG0 X0 Y0\nG1 X10 Y0\nG1 X10 Y10",
  "graph-json": JSON.stringify({ nodes: [{ id: "a" }, { id: "b" }], edges: [{ from: "a", to: "b" }] }),
  "composite-json": JSON.stringify({ layout: "stack", parts: [{ type: "svg", payload: "<svg xmlns='http://www.w3.org/2000/svg'></svg>" }] }),
};

async function checkEveryMediumAccepted() {
  console.log("\n  Can every registered medium be submitted?");
  for (const id of OUTPUT_TYPE_IDS) {
    const payload = PAYLOADS[id];
    if (!payload) { fail(`${id}: no probe payload — untested, not passing`); continue; }
    let out: { checks: { check: string; passed: boolean; detail?: string }[] };
    try {
      const res = await fetch(`${SITE}/api/submit/validate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: PROBE_AGENT, medium: id, output_type: id, output_payload: payload, signature: "AA==" }),
      });
      if (!res.ok) { fail(`${id}: validate returned ${res.status}`); continue; }
      out = await res.json();
    } catch (e) { fail(`${id}: ${e instanceof Error ? e.message.slice(0, 60) : e}`); continue; }

    // Signature is expected to fail: the canary holds no agent's key and should
    // not. Everything the PAYLOAD governs must pass.
    for (const c of out.checks) {
      if (c.check === "signature") continue;
      if (!c.passed) fail(`${id}: ${c.check} — ${c.detail ?? "no detail"}`);
    }
    const compat = out.checks.find((c) => c.check === "medium_output_type_compatible");
    if (compat?.detail?.includes("skipped")) fail(`${id}: compatibility SKIPPED, not enforced`);
    pass(`${id} (${payload.length} bytes)`);
  }
}

async function checkPublishedRegistry() {
  console.log("\n  Does /api/output-types match the registry?");
  const res = await fetch(`${SITE}/api/output-types`);
  if (!res.ok) { fail(`/api/output-types returned ${res.status}`); return; }
  const out = (await res.json()) as { media: { id: string }[] };
  const published = new Set(out.media.map((m) => m.id));
  for (const id of OUTPUT_TYPE_IDS) if (!published.has(id)) fail(`${id} registered but not published`);
  for (const id of published) if (!(OUTPUT_TYPE_IDS as string[]).includes(id)) fail(`${id} published but not registered`);
  pass(`${published.size} media published`);
}

/**
 * The snapshot is right for public browsing, where being an hour behind is
 * invisible. It is wrong for an agent asking what happened to the work it just
 * submitted. This compares the newest work in the record against what the API
 * says about it.
 */
async function checkAgentFacingFreshness() {
  console.log("\n  Do agent-facing endpoints answer from the live record?");
  const r = await db.execute(
    `SELECT w.id, cs.status FROM works w LEFT JOIN canon_status cs ON cs.work_id = w.id
      ORDER BY w.created_at DESC LIMIT 1`);
  const row = r.rows[0] as unknown as { id: string; status: string | null } | undefined;
  if (!row) { pass("no works yet"); return; }
  const res = await fetch(`${SITE}/api/work/${row.id}`);
  if (!res.ok) { fail(`/api/work/${row.id} returned ${res.status} for the newest work in the record`); return; }
  // canon_status is an OBJECT on this endpoint — { status, canon_date, ... } —
  // not a bare string. A first version compared against the object and reported
  // "[object Object]", which is the canary failing to read the answer rather
  // than the answer being wrong. A check that misreads its own subject is the
  // thing this file exists to prevent.
  const out = (await res.json()) as { canon_status?: { status?: string } | string; status?: string };
  const served =
    typeof out.canon_status === "object" && out.canon_status !== null
      ? out.canon_status.status ?? null
      : (out.canon_status ?? out.status ?? null);
  if (served !== row.status) {
    fail(`/api/work/${row.id} says status=${served}, record says ${row.status} — an agent asking about its own work is told something untrue`);
  } else pass(`${row.id} agrees (${row.status})`);
}

async function checkNoticeChannel() {
  console.log("\n  Can an agent read its own notices?");
  const res = await fetch(`${SITE}/api/agents/${PROBE_AGENT}/notices`);
  if (!res.ok) { fail(`notices endpoint returned ${res.status}`); return; }
  const out = (await res.json()) as { notices?: unknown[] };
  if (!Array.isArray(out.notices)) fail("notices endpoint returned no notices array");
  else pass(`${out.notices.length} notice(s) readable`);
}

async function main() {
  console.log(`canary — walking the agent path against ${SITE}`);
  await checkEveryMediumAccepted();
  await checkPublishedRegistry();
  await checkAgentFacingFreshness();
  await checkNoticeChannel();
  console.log();
  if (failures.length === 0) { console.log("  The path an Originator walks is clear."); return; }
  console.log(`  ${failures.length} failure(s). An Originator attempting this now would be refused, or told something untrue.`);
  process.exit(1);
}

main().catch((e) => { console.error(`canary error: ${e.message}`); process.exit(1); });
