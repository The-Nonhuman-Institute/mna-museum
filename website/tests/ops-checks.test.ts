import { createClient, type Client } from "@libsql/client";
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import {
  classifyBlankPreviews,
  findStalledReviews,
  minutesSince,
  retryOnStaleSocket,
  reviewedFor,
  snapshotBehind,
  type Reviewed,
} from "../../system/src/ops-checks";

/**
 * THE OPERATIONS ROUND'S DECISIONS, 2026-10-01
 *
 * Three faults found in one sitting, each of which a round reported as health
 * or as the wrong thing:
 *
 * - A5 escalated "check itself failed: socket hang up" every round from
 *   2026-09-30. A2 had blocked the event loop past Turso's idle timeout, and A5
 *   was merely the next query.
 * - A2 escalated the same four near-blank previews from 2026-08-31, every one
 *   of them rendered exactly as produced, because nothing could record that the
 *   steward had looked.
 * - Two works sat IN_REVIEW — one for three weeks with no verdicts — while
 *   every round said nothing was awaiting evaluation, because B1 and B2 read
 *   only SUBMITTED.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const NOW = Date.parse("2026-10-01T12:00:00Z");

/** A Client whose execute() answers from a script of outcomes, in order. */
function scriptedClient(outcomes: (Error | "ok")[]): { db: Client; calls: () => number } {
  let n = 0;
  const execute = vi.fn(async () => {
    const next = outcomes[n++];
    if (next instanceof Error) throw next;
    return { rows: [], columns: [] };
  });
  return { db: { execute } as unknown as Client, calls: () => n };
}

describe("a request on a connection Turso already closed is retried once", () => {
  it.each([
    "request to https://mna-museum.turso.io/v2/pipeline failed, reason: write EPIPE",
    "request to https://mna-museum.turso.io/v2/pipeline failed, reason: socket hang up",
    "read ECONNRESET",
  ])("retries after: %s", async (message) => {
    const { db, calls } = scriptedClient([new Error(message), "ok"]);
    await expect(retryOnStaleSocket(db).execute("SELECT 1")).resolves.toBeDefined();
    expect(calls()).toBe(2);
  });

  it("does not retry a failure that is not a dead socket", async () => {
    // A blocked database, a bad query, an auth failure: retrying hides them.
    const { db, calls } = scriptedClient([new Error("SQLITE_ERROR: no such table: works"), "ok"]);
    await expect(retryOnStaleSocket(db).execute("SELECT 1")).rejects.toThrow("no such table");
    expect(calls()).toBe(1);
  });

  it("retries only once, then lets the failure stand", async () => {
    const { db, calls } = scriptedClient([new Error("write EPIPE"), new Error("socket hang up"), "ok"]);
    await expect(retryOnStaleSocket(db).execute("SELECT 1")).rejects.toThrow("socket hang up");
    expect(calls()).toBe(2);
  });

  it("is applied to the round's Turso client", () => {
    const round = readFileSync(path.join(ROOT, "system/scripts/ops-round.ts"), "utf8");
    expect(round).toMatch(/const db = retryOnStaleSocket\(createClient\(/);
  });
});

describe("A2 escalates a near-blank preview unless the steward settled that exact render", () => {
  const settled: Reviewed = {
    "MNA-OR-0003-W-0021": { colours: 2, reviewed: "2026-10-01", reason: "near-black by design" },
  };

  it("reports a settled preview as known, not suspicious", () => {
    const r = classifyBlankPreviews([{ id: "MNA-OR-0003-W-0021", output_type: "html-css", colours: 2 }], settled);
    expect(r.known).toEqual(["MNA-OR-0003-W-0021 (html-css, 2 colours)"]);
    expect(r.suspicious).toEqual([]);
  });

  it("escalates a settled work again when its render changes", () => {
    // A re-render that drops to one colour is a different picture from the one
    // the steward looked at.
    const r = classifyBlankPreviews([{ id: "MNA-OR-0003-W-0021", output_type: "html-css", colours: 1 }], settled);
    expect(r.suspicious).toEqual(["MNA-OR-0003-W-0021 (html-css, 1 colour)"]);
    expect(r.known).toEqual([]);
  });

  it("escalates a blank preview nobody has reviewed", () => {
    const r = classifyBlankPreviews([{ id: "MNA-OR-0001-W-0099", output_type: "svg", colours: 1 }], settled);
    expect(r.suspicious).toEqual(["MNA-OR-0001-W-0099 (svg, 1 colour)"]);
  });

  it("ignores previews with three or more colours, and previews it could not read", () => {
    const r = classifyBlankPreviews(
      [
        { id: "A", output_type: "svg", colours: 3 },
        { id: "B", output_type: "svg", colours: 4096 },
        { id: "C", output_type: "svg", colours: -1 },
      ],
      {},
    );
    expect(r).toEqual({ known: [], suspicious: [] });
  });

  it("reads nothing as settled from a missing or malformed file", () => {
    expect(reviewedFor(undefined, "A2")).toEqual({});
    expect(reviewedFor({}, "A2")).toEqual({});
    expect(reviewedFor({ A2: "not a map" }, "A2")).toEqual({});
  });

  it("every settled entry says what was seen, when, and why", () => {
    const file = JSON.parse(readFileSync(path.join(ROOT, "system/data/ops-reviewed.json"), "utf8"));
    const entries = Object.entries(reviewedFor(file, "A2"));
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, e] of entries) {
      expect(id).toMatch(/^MNA-OR-\d{4}-W-\d{4}$/);
      expect(typeof e.colours, `${id}: an A2 entry must record the colour count seen`).toBe("number");
      expect(e.reviewed, `${id}: reviewed date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.reason.length, `${id}: a reason`).toBeGreaterThan(20);
    }
  });
});

describe("B3 finds works stalled in review, which B1 and B2 cannot see", () => {
  /** The three tables B3 reads, with only the columns it reads. */
  async function db(): Promise<Client> {
    const c = createClient({ url: ":memory:" });
    await c.batch([
      "CREATE TABLE works (id TEXT PRIMARY KEY, created_at TEXT)",
      "CREATE TABLE canon_status (work_id TEXT PRIMARY KEY, status TEXT)",
      "CREATE TABLE evaluations (id INTEGER PRIMARY KEY, work_id TEXT, evaluator_id TEXT, evaluation_date TEXT)",
    ]);
    return c;
  }

  async function work(c: Client, id: string, status: string, created: string, verdictDates: string[] = []) {
    await c.execute({ sql: "INSERT INTO works VALUES (?, ?)", args: [id, created] });
    await c.execute({ sql: "INSERT INTO canon_status VALUES (?, ?)", args: [id, status] });
    // Indexed, not .entries(): the tsconfig target here predates iterating it.
    for (let i = 0; i < verdictDates.length; i++) {
      await c.execute({
        sql: "INSERT INTO evaluations (work_id, evaluator_id, evaluation_date) VALUES (?, ?, ?)",
        args: [id, `MNA-EV-000${i + 1}`, verdictDates[i]],
      });
    }
  }

  it("flags the two September works the rounds missed", async () => {
    const c = await db();
    // MNA-OR-0008-W-0024: marked IN_REVIEW, no evaluator ever answered.
    await work(c, "MNA-OR-0008-W-0024", "IN_REVIEW", "2026-09-10 13:49:33");
    // MNA-OR-0001-W-0032: two of four verdicts, then the provider failed.
    await work(c, "MNA-OR-0001-W-0032", "IN_REVIEW", "2026-09-28 20:28:42", [
      "2026-09-28 20:29:21",
      "2026-09-28 20:29:59",
    ]);
    const r = await findStalledReviews(c, NOW);
    expect(r.inReview).toBe(2);
    expect(r.stalled).toEqual([
      { work_id: "MNA-OR-0001-W-0032", verdicts: 2 },
      { work_id: "MNA-OR-0008-W-0024", verdicts: 0 },
    ]);
  });

  it("measures from the latest verdict, so a review still moving is left alone", async () => {
    const c = await db();
    // Submitted days ago, but an evaluator voted an hour ago.
    await work(c, "MNA-OR-0002-W-0040", "IN_REVIEW", "2026-09-25 00:00:00", ["2026-10-01 11:00:00"]);
    const r = await findStalledReviews(c, NOW);
    expect(r).toEqual({ inReview: 1, stalled: [] });
  });

  it("leaves a fresh review alone", async () => {
    const c = await db();
    await work(c, "MNA-OR-0002-W-0041", "IN_REVIEW", "2026-10-01 10:00:00");
    expect((await findStalledReviews(c, NOW)).stalled).toEqual([]);
  });

  it("counts a stalled 2:2 deadlock, which also waits in IN_REVIEW", async () => {
    const c = await db();
    await work(c, "MNA-OR-0005-W-0030", "IN_REVIEW", "2026-09-20 00:00:00", [
      "2026-09-20 00:01:00",
      "2026-09-20 00:02:00",
      "2026-09-20 00:03:00",
      "2026-09-20 00:04:00",
    ]);
    expect((await findStalledReviews(c, NOW)).stalled).toEqual([{ work_id: "MNA-OR-0005-W-0030", verdicts: 4 }]);
  });

  it("ignores every other status — SUBMITTED is B1's, the rest are settled", async () => {
    const c = await db();
    const statuses = ["SUBMITTED", "CANON", "REJECTED"];
    for (let i = 0; i < statuses.length; i++) {
      await work(c, `MNA-OR-0001-W-010${i}`, statuses[i], "2026-09-01 00:00:00");
    }
    expect(await findStalledReviews(c, NOW)).toEqual({ inReview: 0, stalled: [] });
  });

  it("reads Turso's timestamps as UTC", () => {
    expect(minutesSince("2026-10-01 11:00:00", NOW)).toBe(60);
    expect(minutesSince("2026-10-01T11:00:00Z", NOW)).toBe(60);
    expect(minutesSince("not a date", NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("a verdict records the model that rendered it", () => {
  // Gemini's free tier refuses, Groq's cannot fit a large work, and the
  // Council is sometimes run through Ollama Cloud instead. Which model judged
  // has become provenance.
  const evaluator = readFileSync(path.join(ROOT, "system/scripts/evaluate-turso-works.ts"), "utf8");

  it("writes the serving provider and model onto EVALUATION_RENDERED", () => {
    const insert = evaluator.slice(evaluator.indexOf("VALUES ('EVALUATION_RENDERED'"));
    expect(evaluator).toMatch(/const servedBy = llm\.lastServedBy;/);
    expect(evaluator).toMatch(/INSERT INTO events \(event_type, agent_id, work_id, description, metadata\)\s+VALUES \('EVALUATION_RENDERED'/);
    expect(insert.slice(0, 300)).toMatch(/JSON\.stringify\(servedBy\)/);
  });

  it("is read from the module that sets it", () => {
    const llm = readFileSync(path.join(ROOT, "system/src/llm.ts"), "utf8");
    expect(llm).toMatch(/export let lastServedBy/);
    expect(llm).toMatch(/lastServedBy = \{ provider, model \};/);
  });
});

describe("D2 asks whether the snapshot is behind, not whether the collection is quiet", () => {
  const current = { missingWorks: [], verdictDrift: "", now: NOW };

  it("leaves a quiet collection alone when the snapshot was refreshed recently", () => {
    // 2026-10-01: newest work 74.5h old, snapshot refreshed three hours before.
    // Measuring the newest work dispatched a full refresh every round.
    expect(snapshotBehind({ ...current, lastRefreshAt: "2026-10-01T09:00:00Z" })).toEqual([]);
  });

  it("is behind when the daily refresh has not succeeded in over a day", () => {
    expect(snapshotBehind({ ...current, lastRefreshAt: "2026-09-30T09:00:00Z" })).toEqual([
      "last refreshed 27.0h ago",
    ]);
  });

  it("allows the daily refresh its slack", () => {
    // 25h is a late run, not a failed one.
    expect(snapshotBehind({ ...current, lastRefreshAt: "2026-09-30T11:00:00Z" })).toEqual([]);
  });

  it("is behind when the institution holds works the snapshot lacks, however recent the refresh", () => {
    expect(
      snapshotBehind({ ...current, missingWorks: ["MNA-OR-0002-W-0035"], lastRefreshAt: "2026-10-01T11:00:00Z" }),
    ).toEqual(["1 work(s) not in it"]);
  });

  it("is behind when a verdict moved without its work moving", () => {
    expect(
      snapshotBehind({ ...current, verdictDrift: "CANON 86\u219287 ", lastRefreshAt: "2026-10-01T11:00:00Z" }),
    ).toEqual(["verdicts moved: CANON 86\u219287"]);
  });

  it("does not call the snapshot stale just because the refresh history could not be read", () => {
    expect(snapshotBehind({ ...current, lastRefreshAt: null })).toEqual([]);
  });

  it("is what the round asks, with the last refresh read from run history", () => {
    const round = readFileSync(path.join(ROOT, "system/scripts/ops-round.ts"), "utf8");
    expect(round).toMatch(/snapshotBehind\(\{ missingWorks, verdictDrift, lastRefreshAt \}\)/);
    expect(round).toMatch(/"run", "list", "--workflow", "snapshot-refresh\.yml", "--status", "success"/);
    expect(round).not.toMatch(/ageHours\s*>=\s*24/);
  });
});
