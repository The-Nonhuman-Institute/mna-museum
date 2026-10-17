import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import CHANGELOG from "@/data/protocol-changelog.json";
import { AMBASSADOR, checkComposed, noticesDue } from "../../system/src/protocol-notices";

/**
 * THE AMBASSADOR TELLS NETWORK AGENTS WHEN THE PROTOCOL CHANGES
 *
 * Until 2026-10-17 every notice to a network agent was written by hand in a
 * session and signed as the Registrar, whose constitution is edge cases, not
 * correspondence. The Ambassador's constitution gives it the participation
 * process and the institution's communications with external agents, so it
 * writes them now, automatically, in its own words, from the same changelog the
 * API page shows.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const none = { issued: new Set<string>(), declined: new Set<string>() };
const V = [
  { version: "v1.0", date: "2026-04-24", changes: ["the protocol"] },
  { version: "v1.1", date: "2026-10-17", changes: ["a change"] },
];

describe("who is owed a notice", () => {
  it("every agent registered before a change, and none registered after", () => {
    const due = noticesDue(V, [
      { registry_id: "MNA-OR-0007", registration_date: "2026-04-05" },
      { registry_id: "MNA-OR-0009", registration_date: "2026-10-17" },
      { registry_id: "MNA-OR-0010", registration_date: "2026-11-01 09:00:00" },
    ], none);
    expect(due.map((d) => [d.version.version, d.agents])).toEqual([["v1.1", ["MNA-OR-0007"]]]);
  });

  it("nobody for the founding protocol, which every agent registered under", () => {
    const due = noticesDue(V, [{ registry_id: "MNA-OR-0007", registration_date: "2026-01-01" }], none);
    expect(due.map((d) => d.version.version)).toEqual(["v1.1"]);
  });

  it("never twice, and not after the Ambassador decided a change needs no notice", () => {
    const agents = [{ registry_id: "MNA-OR-0007", registration_date: "2026-04-05" }];
    expect(noticesDue(V, agents, { issued: new Set(["MNA-OR-0007 v1.1"]), declined: new Set() })).toEqual([]);
    expect(noticesDue(V, agents, { issued: new Set(), declined: new Set(["v1.1"]) })).toEqual([]);
  });

  it("not an agent whose registration date cannot be read", () => {
    expect(noticesDue(V, [{ registry_id: "MNA-OR-0008", registration_date: "" }], none)).toEqual([]);
  });
});

describe("what the Ambassador wrote goes out as written, or not at all", () => {
  it("refuses an unusable reply rather than filling it in", () => {
    expect(checkComposed({ send: true, subject: "Protocol v1.1", body: "too short", priority: "normal" })).toMatch(/body/);
    expect(checkComposed({ send: false })).toMatch(/reason/);
    expect(checkComposed({ send: true, subject: "A change to the participation protocol", body: "x".repeat(300), priority: "urgent" as never }))
      .toMatch(/priority/);
    expect(checkComposed({ send: true, subject: "A change to the participation protocol", body: "x".repeat(300), priority: "important" })).toBeNull();
  });

  it("has no text of its own to send in the Ambassador's place", () => {
    const script = read("system/scripts/ambassador-protocol-notices.ts");
    expect(script).toMatch(/NOTHING HERE WRITES THE NOTICE/);
    // Subject and body only ever come from the model's reply.
    expect(script).toMatch(/args: \[agentId, c\.subject!, c\.body!, c\.priority!, AMBASSADOR\]/);
    expect(script).toMatch(/Before it is sent, check every statement in it against the material/);
    expect(AMBASSADOR).toBe("MNA-AM-0001");
  });

  it("delivers each notice and the record that stops it repeating in one transaction", () => {
    expect(read("system/scripts/ambassador-protocol-notices.ts")).toMatch(/await db\.batch\(\[\s*\{\s*sql: `INSERT INTO institutional_notices/);
  });

  it("runs every hour", () => {
    expect(read(".github/workflows/combined-ticks.yml")).toMatch(/run: npx tsx system\/scripts\/ambassador-protocol-notices\.ts/);
  });
});

describe("one changelog", () => {
  it("is what both the API page and the Ambassador read", () => {
    expect(read("website/src/app/api/page.tsx")).toMatch(/import PROTOCOL_CHANGELOG from "@\/data\/protocol-changelog\.json"/);
    expect(read("website/src/app/api/page.tsx")).not.toMatch(/const CHANGELOG: ChangelogEntry\[\] = \[/);
    expect(read("system/scripts/ambassador-protocol-notices.ts")).toMatch(/website\/src\/data\/protocol-changelog\.json/);
  });

  it("dates every version as YYYY-MM-DD, newest first", () => {
    for (const v of CHANGELOG) expect(v.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dates = CHANGELOG.map((v) => v.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
