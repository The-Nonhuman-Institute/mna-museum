import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildCaseReportPrompt,
  buildRedeliberationPrompt,
  tally,
  type FirstVerdict,
  type WorkRow,
} from "../../system/src/council";

/**
 * A DIVIDED COUNCIL DELIBERATES AGAIN; THE REGISTRAR DOES NOT DECIDE
 *
 * Founding steward, 2026-10-16. The Registrar's constitution: it "investigates,
 * documents, and escalates"; "cases requiring canon decisions go to the
 * Evaluation Council with a full Registrar report"; "never the authority of a
 * final decision". The code had it render the binding verdict on every 2:2 —
 * twenty times — and the provenance pages credited MNA-PP-001, which grants no
 * such authority.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const evaluator = read("system/scripts/evaluate-turso-works.ts");

const work: WorkRow = { id: "MNA-OR-0005-W-0031", originator_id: "MNA-OR-0005", output_type: "svg", output_payload: "<svg/>", medium: "svg" };
const first: FirstVerdict[] = [
  { evaluator_id: "MNA-EV-0001", name: "Structuralist", verdict: "CANON", rationale: "CANON\n\nThe lattice holds." },
  { evaluator_id: "MNA-EV-0002", name: "Historicist", verdict: "REJECTED", rationale: "REJECTED\n\nA retreat." },
  { evaluator_id: "MNA-EV-0003", name: "Contextualist", verdict: "CANON", rationale: "CANON\n\nIt opens a field." },
  { evaluator_id: "MNA-EV-0004", name: "Empiricist", verdict: "REJECTED", rationale: "REJECTED\n\nNo presence." },
];

describe("the Council's rule", () => {
  it.each([
    [["CANON", "CANON", "CANON", "REJECTED"], "CANON"],
    [["REJECTED", "REJECTED", "REJECTED", "REJECTED"], "REJECTED"],
    [["CANON", "REJECTED", "CANON", "REJECTED"], "DIVIDED"],
  ])("%j → %s", (verdicts, outcome) => {
    expect(tally(verdicts)).toBe(outcome);
  });
});

describe("the Registrar reports and does not decide", () => {
  const prompt = buildCaseReportPrompt(work, first, "<svg/>");

  it("is told it does not decide, and asked not to recommend", () => {
    expect(prompt).toMatch(/You do not decide it\./);
    expect(prompt).toMatch(/Do not render a verdict, recommend one, or say which side is right\./);
    expect(prompt).not.toMatch(/binding/i);
  });

  it("is given its case reference, so it does not invent one", () => {
    expect(prompt).toContain("Case reference: RG-CASE-MNA-OR-0005-W-0031");
  });

  it("is shown the work and all four first verdicts in full", () => {
    expect(prompt).toContain("--- THE WORK ---\n<svg/>");
    for (const f of first) expect(prompt).toContain(f.rationale.trim());
  });

  it("is no longer asked for a verdict anywhere in the evaluator", () => {
    expect(evaluator).not.toMatch(/'REGISTRAR_DECISION'/);
    expect(evaluator).not.toMatch(/evaluator_id, verdict, rationale, constitution_version\)\s+VALUES \(\?, 'MNA-RG-0001'/);
    expect(evaluator).not.toMatch(/resolveDeadlock/);
  });
});

describe("each evaluator deliberates again with the whole first round and the report", () => {
  const prompt = buildRedeliberationPrompt("BASE PROMPT\n", "MNA-EV-0002", first, "The case turns on whether a retreat can be a development.");

  it("keeps its own evaluation prompt and adds the deliberation after it", () => {
    expect(prompt.startsWith("BASE PROMPT\n")).toBe(true);
    expect(prompt).toMatch(/--- SECOND DELIBERATION ---/);
  });

  it("is reminded of its own first verdict and shown all four, with the case report", () => {
    expect(prompt).toMatch(/You voted REJECTED\./);
    for (const f of first) expect(prompt).toContain(f.rationale.trim());
    expect(prompt).toContain("The case turns on whether a retreat can be a development.");
  });

  it("may hold or change its verdict, and is not steered either way", () => {
    expect(prompt).toMatch(/You may hold your verdict or change it; neither is expected of you\./);
  });
});

describe("the outcome is recorded either way", () => {
  const deliberate = evaluator.slice(evaluator.indexOf("async function deliberateAgain("), evaluator.indexOf("// ─── Main"));

  it("decides on three of four, writing the status and a CANON_DECISION", () => {
    expect(deliberate).toMatch(/const outcome = tally\(COUNCIL\.map\(\(id\) => second\[id\]\)\);/);
    expect(deliberate).toMatch(/VALUES \('CANON_DECISION', \?, \?, \?\)/);
    expect(deliberate).toMatch(/deliberation: 2/);
  });

  it("leaves a still-divided work In Review, with a COUNCIL_DIVIDED event, and never overwrites its status", () => {
    const divided = deliberate.slice(deliberate.indexOf('if (outcome === "DIVIDED")'), deliberate.indexOf("UPDATE canon_status"));
    expect(divided).toMatch(/'COUNCIL_DIVIDED'/);
    expect(divided).toMatch(/return \{ status: "IN_REVIEW" \};/);
  });

  it("records the case report and every second verdict as they happen, so a failed run resumes", () => {
    // Read back by round, so a second deliberation never resumes from a third's record.
    expect(deliberate).toMatch(/eventsOf\("REGISTRAR_CASE_REPORT", workId, 2\)/);
    expect(deliberate).toMatch(/eventsOf\("COUNCIL_REDELIBERATION", workId, 2\)/);
    expect(deliberate).toMatch(/if \(second\[evalId\]\) continue;/);
  });

  it("writes nothing in a dry run", () => {
    const beforeStep2 = deliberate.slice(0, deliberate.indexOf("const prior = await loadPriorWorks"));
    expect(beforeStep2).toMatch(/if \(dryRun\) \{[\s\S]{0,160}return \{ status: "IN_REVIEW" \};/);
  });
});

describe("the public record says what happened", () => {
  const provenance = read("website/src/app/work/[id]/provenance/provenance-client.tsx");

  it("no longer credits MNA-PP-001 with tie-breaking authority", () => {
    expect(provenance).not.toMatch(/the authority granted by MNA-PP-001/);
    expect(provenance).toMatch(/Under\s+the practice in place until 16 October 2026/);
  });

  it("shows every round of deliberation: its case report and its verdicts", () => {
    expect(provenance).toMatch(/work\.deliberations\.map\(\(d\) =>/);
    expect(provenance).toMatch(/\{name\} Deliberation/);
    expect(provenance).toMatch(/d\.report\.report/);
    expect(provenance).toMatch(/d\.verdicts\.map/);
  });

  it("says what happens next to a divided case, and what contested means", () => {
    expect(provenance).toMatch(/returns to the Council once the Originator has made three more works, or after ninety days/);
    expect(provenance).toMatch(/the work is contested, stays In Review with this record, and is not reopened/);
  });
});

import { createClient, type Client } from "@libsql/client";
import {
  REOPEN_AFTER_DAYS,
  REOPEN_AFTER_WORKS,
  buildReopenedCaseReportPrompt,
  buildThirdDeliberationPrompt,
  findReopenDue,
  reopenGrounds,
} from "../../system/src/council";

/**
 * A DIVIDED CASE STAYS OPEN WITH A TIMELINE, THEN IS DECIDED OR CONTESTED
 *
 * The evaluators define In Review as extended deliberation with "specific
 * unresolved questions and a timeline for resolution". The case reopens when
 * the Originator has made three more works or ninety days have passed; the
 * Council deliberates a third and final time; divided again, it is contested.
 */

const NOW = Date.parse("2026-10-16T12:00:00Z");

describe("the grounds for reopening a divided case", () => {
  it("are three further works by the Originator, or ninety days", () => {
    expect(REOPEN_AFTER_WORKS).toBe(3);
    expect(REOPEN_AFTER_DAYS).toBe(90);
  });

  it("do not arrive with two works and a few weeks", () => {
    expect(reopenGrounds({ dividedAt: "2026-09-20 00:00:00", laterWorks: 2, now: NOW })).toEqual([]);
  });

  it("arrive with the third work", () => {
    expect(reopenGrounds({ dividedAt: "2026-09-20 00:00:00", laterWorks: 3, now: NOW })).toEqual([
      "the Originator has made 3 works since the Council divided",
    ]);
  });

  it("arrive after ninety days, even if the Originator has made nothing", () => {
    expect(reopenGrounds({ dividedAt: "2026-07-01 00:00:00", laterWorks: 0, now: NOW })).toEqual([
      "107 days have passed since the Council divided",
    ]);
  });
});

describe("which divided cases are due", () => {
  async function db(): Promise<Client> {
    const c = createClient({ url: ":memory:" });
    await c.batch([
      "CREATE TABLE works (id TEXT PRIMARY KEY, originator_id TEXT, created_at TEXT)",
      "CREATE TABLE canon_status (work_id TEXT PRIMARY KEY, status TEXT)",
      "CREATE TABLE events (id INTEGER PRIMARY KEY, event_type TEXT, work_id TEXT, created_at TEXT)",
    ]);
    return c;
  }
  async function divided(c: Client, id: string, at: string, status = "IN_REVIEW") {
    await c.execute({ sql: "INSERT INTO works VALUES (?, 'MNA-OR-0002', ?)", args: [id, "2026-09-01 00:00:00"] });
    await c.execute({ sql: "INSERT INTO canon_status VALUES (?, ?)", args: [id, status] });
    await c.execute({ sql: "INSERT INTO events (event_type, work_id, created_at) VALUES ('COUNCIL_DIVIDED', ?, ?)", args: [id, at] });
  }

  it("finds a case once the Originator's third work since it divided has arrived", async () => {
    const c = await db();
    await divided(c, "MNA-OR-0002-W-0032", "2026-09-20 00:00:00");
    for (const n of ["W-0040", "W-0041"]) await c.execute({ sql: "INSERT INTO works VALUES (?, 'MNA-OR-0002', '2026-10-01 00:00:00')", args: [n] });
    expect((await findReopenDue(c, NOW)).due).toEqual([]);
    await c.execute("INSERT INTO works VALUES ('W-0042', 'MNA-OR-0002', '2026-10-10 00:00:00')");
    expect((await findReopenDue(c, NOW)).due).toEqual([
      { work_id: "MNA-OR-0002-W-0032", grounds: ["the Originator has made 3 works since the Council divided"] },
    ]);
  });

  it("does not count works made before the Council divided, or another Originator's", async () => {
    const c = await db();
    await divided(c, "MNA-OR-0002-W-0032", "2026-09-20 00:00:00");
    for (const n of ["A", "B", "C"]) await c.execute({ sql: "INSERT INTO works VALUES (?, 'MNA-OR-0002', '2026-09-10 00:00:00')", args: [n] });
    for (const n of ["D", "E", "F"]) await c.execute({ sql: "INSERT INTO works VALUES (?, 'MNA-OR-0001', '2026-10-10 00:00:00')", args: [n] });
    expect((await findReopenDue(c, NOW)).due).toEqual([]);
  });

  it("never reopens a contested case, or one already decided", async () => {
    const c = await db();
    await divided(c, "MNA-OR-0002-W-0050", "2026-06-01 00:00:00");
    await c.execute("INSERT INTO events (event_type, work_id, created_at) VALUES ('COUNCIL_CONTESTED', 'MNA-OR-0002-W-0050', '2026-09-01 00:00:00')");
    await divided(c, "MNA-OR-0002-W-0051", "2026-06-01 00:00:00", "CANON");
    expect(await findReopenDue(c, NOW)).toEqual({ divided: 0, due: [] });
  });
});

describe("the third and final deliberation", () => {
  const second: FirstVerdict[] = first.map((f) => ({ ...f, rationale: `${f.verdict}\n\nHeld after the report.` }));

  it("gives the Registrar its earlier report and what is new, and still no verdict", () => {
    const p = buildReopenedCaseReportPrompt(work, first, second, "Earlier report.", ["the Originator has made 3 works since the Council divided"], [{ id: "MNA-OR-0005-W-0040", output_payload: "<svg>new</svg>" }], "<svg/>");
    expect(p).toMatch(/The case reopens because the Originator has made 3 works since the Council divided\./);
    expect(p).toContain("Earlier report.");
    expect(p).toContain("MNA-OR-0005-W-0040: <svg>new</svg>");
    expect(p).toMatch(/Do not render a verdict, recommend one, or say which side is right\./);
  });

  it("tells each evaluator it is final and that contested is an honest outcome", () => {
    const p = buildThirdDeliberationPrompt("BASE\n", "MNA-EV-0004", first, second, "Updated report.");
    expect(p).toMatch(/In the second deliberation you voted REJECTED\./);
    expect(p).toMatch(/This is the final deliberation: if the Council divides again, the work is recorded as contested and is not reopened\./);
    expect(p).toMatch(/a contested outcome is an honest one/);
    expect(p).toContain("Updated report.");
  });

  it("records a third division as contested, leaving the status In Review", () => {
    const third = evaluator.slice(evaluator.indexOf("async function deliberateThird("), evaluator.indexOf("// ─── Main"));
    const divided = third.slice(third.indexOf('if (outcome === "DIVIDED")'), third.indexOf("UPDATE canon_status"));
    expect(divided).toMatch(/'COUNCIL_CONTESTED'/);
    expect(divided).toMatch(/return \{ status: "IN_REVIEW" \};/);
  });

  it("is run by the ops round's B4, which escalates a held or failed reopening", () => {
    const round = read("system/scripts/ops-round.ts");
    expect(round).toMatch(/run\("npx", \["tsx", "system\/scripts\/evaluate-turso-works\.ts", "--reopen"\]\)/);
    expect(round).toMatch(/attempt\("B4", \(\) => checkB4\(db\)\)/);
  });
});

import { readdirSync } from "fs";

describe("no code path lets the Registrar decide", () => {
  /**
   * The one exception, and why: backfill-registrar-rationales.ts ran once in
   * April 2026 to write rationales for decisions the Registrar had already
   * rendered. It records history; it decides nothing new.
   */
  const EXEMPT: Record<string, string> = {
    "system/scripts/backfill-registrar-rationales.ts": "one-off April 2026 backfill of rationales for decisions already rendered",
  };
  const files = ["system/src", "system/scripts"].flatMap((dir) =>
    readdirSync(path.join(ROOT, dir))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `${dir}/${f}`),
  );

  it("records no REGISTRAR_DECISION and no Registrar verdict row, outside the written exception", () => {
    const offenders = files.filter((f) => {
      if (EXEMPT[f]) return false;
      const src = read(f);
      return /VALUES \('REGISTRAR_DECISION'/.test(src) || /evaluations[^;]*VALUES \(\?, 'MNA-RG-0001'/.test(src);
    });
    expect(offenders, "these would let the Registrar decide a divided Council").toEqual([]);
  });

  it("keeps the local pipeline's tie-break retired", () => {
    const pipeline = read("system/src/pipeline.ts");
    expect(pipeline).not.toMatch(/export async function resolveDeadlock/);
    expect(pipeline).toMatch(/TIES_ARE_NOT_RESOLVED_LOCALLY/);
  });
});
