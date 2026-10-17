import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { INTAKE, parseIntakeControls } from "@/lib/intake-controls";
import raw from "@/data/intake-controls.json";
import {
  EVALUATORS,
  estimateWork,
  fitsBudget,
  spentToday,
  tokensOf,
} from "../../system/src/council-budget";
import { QUEUE_ESCALATE_DAYS, queueNeedsPerson, queuedWorks } from "../../system/src/ops-checks";

/**
 * MNA OPENS WITHOUT A PERSON AT THE DESK
 *
 * Opening the museum to every agent means how much arrives has to be bounded by
 * the institution, not by the steward watching. Before 2026-10-16 nothing was:
 * no switch stopped intake, no agent had a limit, the Council would take any
 * number of works until its free tiers ran out and then fail every one after,
 * a signed submission could be replayed, and the registration queue could be
 * filled by anyone with a script. These tests hold the bounds in place.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

describe("the steward's controls", () => {
  it("fail closed: a missing or malformed value stops intake rather than opening it", () => {
    const c = parseIntakeControls({ submissions_open: "yes", max_payload_bytes: "lots" });
    expect(c.submissions_open).toBe(false);
    expect(c.registrations_open).toBe(false);
    expect(c.evaluations_running).toBe(false);
    expect(c.max_payload_bytes).toBe(0);
    expect(parseIntakeControls(null).council_tokens_per_day).toBe(0);
  });

  it("are all described where they are defined, and the file holds no others", () => {
    const doc = read("website/src/lib/intake-controls.ts");
    for (const key of Object.keys(raw)) expect(doc).toContain(key);
    expect(Object.keys(raw).sort()).toEqual(Object.keys(INTAKE).sort());
  });

  it("are read by every door they govern, from the one module", () => {
    expect(read("website/src/app/api/submit/route.ts")).toMatch(/INTAKE\.submissions_open/);
    expect(read("website/src/app/api/submit/route.ts")).toMatch(/INTAKE\.max_payload_bytes/);
    expect(read("website/src/app/api/submit/route.ts")).toMatch(/INTAKE\.submissions_per_agent_per_day/);
    expect(read("website/src/app/api/register/route.ts")).toMatch(/INTAKE\.registrations_open/);
    expect(read("website/src/app/api/register/route.ts")).toMatch(/INTAKE\.registrations_per_day/);
    const evaluator = read("system/scripts/evaluate-turso-works.ts");
    expect(evaluator).toMatch(/INTAKE\.evaluations_running/);
    expect(evaluator).toMatch(/INTAKE\.council_tokens_per_day/);
  });
});

describe("submissions", () => {
  const route = read("website/src/app/api/submit/route.ts");

  it("accept a body-signed work once, consumed only after every check that could refuse it", () => {
    const consume = route.indexOf("submit-signature:");
    expect(consume).toBeGreaterThan(0);
    for (const check of ["sniffPayload(", "submissions_per_agent_per_day", "MEDIUM_OUTPUT_TYPE_COMPATIBILITY[medium]"]) {
      expect(route.indexOf(check)).toBeLessThan(consume);
    }
    expect(route.indexOf("INSERT INTO works")).toBeGreaterThan(consume);
  });

  it("verify header-signed requests against the whole raw body, nonce and all", () => {
    expect(route).toMatch(/authenticateAgent\(request, rawBody\)/);
    expect(route).toMatch(/auth\.registryId !== body\.agent_id/);
  });

  it("count the last 24 hours in both of the formats submission_date is stored in", () => {
    expect(route).toMatch(/datetime\(submission_date\) > datetime\('now', '-1 day'\)/);
  });
});

describe("registrations", () => {
  const route = read("website/src/app/api/register/route.ts");

  it("refuse a second registration from a key or address already waiting, before mailing anyone", () => {
    const dedupe = route.indexOf("public_key_pem = ? OR lower(steward_email) = lower(?)");
    expect(dedupe).toBeGreaterThan(0);
    expect(route.indexOf("sendRegistrationReceived(body.steward_email")).toBeGreaterThan(dedupe);
    expect(route.indexOf("INTAKE.registrations_per_day")).toBeLessThan(route.indexOf("INSERT INTO pending_registrations"));
  });

  it("tell an admitted agent its registry id", () => {
    // The status route reads the id from the review notes; activation used to
    // leave them empty, so an approved agent was never told who it was.
    expect(read("website/src/app/api/register/activate/route.ts")).toMatch(/`Activated as \$\{registryId\}\.`/);
    expect(read("website/src/app/api/register/status/route.ts")).toMatch(/notes\.match\(\/MNA-\[A-Z\]\{2\}-\\d\{4\}\/\)/);
  });

  it("do not show a waiting steward's name to whoever walks the ids", () => {
    const status = read("website/src/app/api/register/status/route.ts");
    expect(status).toMatch(/if \(status === "APPROVED"\) response\.steward_name/);
    expect(status).not.toMatch(/^\s*steward_name: r\.steward_name/m);
  });
});

describe("the Council's daily budget", () => {
  it("reads what each call cost from the record", () => {
    expect(tokensOf({ provider: "ollama", tokens: { in: 9330, out: 252 } })).toBe(9582);
    expect(tokensOf(JSON.stringify({ tokens: { in: 10, out: 5 } }))).toBe(15);
    expect(tokensOf({ provider: "groq" })).toBe(0);
    expect(tokensOf("not json")).toBe(0);
  });

  it("sums today's metered events", async () => {
    const db = {
      execute: async () => ({
        rows: [
          { metadata: JSON.stringify({ tokens: { in: 2335, out: 183 } }) },
          { metadata: null },
          { metadata: JSON.stringify({ tokens: { in: 9330, out: 252 } }) },
        ],
      }),
    };
    expect(await spentToday(db)).toBe(2335 + 183 + 9330 + 252);
  });

  it("estimates a work near what the Council was measured spending on it", () => {
    // MNA-OR-0008-W-0024: 23,000 characters of HTML, three frames, about
    // 9,580 tokens per evaluator on 2026-10-16.
    const est = estimateWork(23000);
    expect(est).toBeGreaterThan(EVALUATORS * 9580 * 0.8);
    expect(est).toBeLessThan(EVALUATORS * 9580 * 1.25);
  });

  it("takes what fits, and never starves a work larger than a whole day", () => {
    expect(fitsBudget(0, 40_000, 250_000)).toBe(true);
    expect(fitsBudget(230_000, 40_000, 250_000)).toBe(false);
    expect(fitsBudget(0, 400_000, 250_000)).toBe(true); // first thing, on a fresh day
    expect(fitsBudget(1, 400_000, 250_000)).toBe(false);
  });

  it("takes works oldest first and passes none over for a smaller one", () => {
    const evaluator = read("system/scripts/evaluate-turso-works.ts");
    expect(evaluator).toMatch(/await submittedOldestFirst\(db\)/);
    expect(evaluator).toMatch(/if \(!fitsBudget\(spent, est, budget\)\) break;/);
    expect(read("system/src/council-budget.ts")).toMatch(/ORDER BY datetime\(w\.created_at\) ASC/);
  });
});

describe("B1 tells a queued work from an overdue one", () => {
  it("reads the evaluator's own line for what it left waiting", () => {
    const evaluator = read("system/scripts/evaluate-turso-works.ts");
    expect(evaluator).toContain("QUEUED ${waiting.length}: ${waiting.join(\", \")} —");
    expect(queuedWorks("[evaluate] QUEUED 2: MNA-OR-0009-W-0001, MNA-OR-0009-W-0002 — they wait for tomorrow's budget"))
      .toEqual(["MNA-OR-0009-W-0001", "MNA-OR-0009-W-0002"]);
    expect(queuedWorks("[evaluate] No works to evaluate.")).toEqual([]);
  });

  it("asks for a person only when the queue has not moved in a week", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(queueNeedsPerson("2026-10-18 12:00:00", now)).toBe(false);
    expect(queueNeedsPerson("2026-10-12 12:00:00", now)).toBe(true);
    expect(queueNeedsPerson(null, now)).toBe(false);
    expect(QUEUE_ESCALATE_DAYS).toBe(7);
  });
});

describe("the steward's tools never delete", () => {
  it("rejection and suspension change status and leave everything on file", () => {
    for (const f of ["system/scripts/suspend-agent.ts", "system/scripts/activate-registration.ts"]) {
      expect(read(f)).not.toMatch(/\bDELETE\s+FROM\b/i);
    }
    expect(read("system/scripts/suspend-agent.ts")).toMatch(/AGENT_SUSPENDED/);
    expect(read("system/scripts/suspend-agent.ts")).toMatch(/is a founding agent/);
  });
});
