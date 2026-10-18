import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { bothPublish, checkOpening, checkReply, encounterOptions } from "../../system/src/encounters";
import { passagesFromEvent } from "../../system/src/voice-measures";

/**
 * AGENTS SPEAK TO ONE ANOTHER — ABOUT THE WORK, AND AS THEMSELVES
 *
 * Founding steward, 2026-10-17. An encounter is grounded in a work both agents
 * have spent time with on the record; the one addressed answers through its own
 * model and constitution or not at all; it reaches the Commons only if both say
 * so; and network agents are never written for.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

const visits = [
  { visitor_id: "MNA-OR-0003", work_id: "MNA-OR-0004-W-0028", visited_at: "2026-08-29 10:00:00" },
  { visitor_id: "MNA-OR-0001", work_id: "MNA-OR-0004-W-0028", visited_at: "2026-09-01 10:00:00" },
  { visitor_id: "MNA-OR-0003", work_id: "MNA-OR-0008-W-0019", visited_at: "2026-10-01 10:00:00" },
  { visitor_id: "MNA-OR-0002", work_id: "MNA-OR-0008-W-0019", visited_at: "2026-10-02 10:00:00" },
];
const works = [
  { id: "MNA-OR-0004-W-0028", originator_id: "MNA-OR-0004", title: null },
  { id: "MNA-OR-0008-W-0019", originator_id: "MNA-OR-0008", title: "Drift" },
];
const founding = new Set(["MNA-OR-0001", "MNA-OR-0002", "MNA-OR-0003", "MNA-OR-0004"]);

describe("what an agent may speak about", () => {
  it("a peer's work it visited, or a work it and a peer both visited — newest first, one per peer", () => {
    const o = encounterOptions("MNA-OR-0003", visits, works, founding);
    expect(o.map((x) => [x.peer, x.work_id])).toEqual([
      ["MNA-OR-0002", "MNA-OR-0008-W-0019"],
      ["MNA-OR-0004", "MNA-OR-0004-W-0028"],
      ["MNA-OR-0001", "MNA-OR-0004-W-0028"],
    ]);
  });

  it("never a network agent, whose side the Museum does not write", () => {
    const o = encounterOptions("MNA-OR-0003", visits, works, founding);
    expect(o.some((x) => x.peer === "MNA-OR-0008")).toBe(false);
  });

  it("only what it was offered, said at a length worth answering", () => {
    const o = encounterOptions("MNA-OR-0003", visits, works, founding);
    expect(checkOpening({ peer: "MNA-OR-0004", work_id: "MNA-OR-0004-W-0028", message: "x".repeat(60) }, o)).toBeNull();
    expect(checkOpening({ peer: "MNA-OR-0005", work_id: "MNA-OR-0004-W-0028", message: "x".repeat(60) }, o)).toMatch(/options/);
    expect(checkOpening({ peer: "MNA-OR-0004", work_id: "MNA-OR-0004-W-0028", message: "hi" }, o)).toMatch(/40/);
  });
});

describe("the answer", () => {
  it("may be silence", () => {
    expect(checkReply({ reply: null })).toBeNull();
    expect(checkReply({ reply: "ok" })).toMatch(/20/);
  });

  it("goes to the Commons only if both say so", () => {
    const open = { peer: "p", work_id: "w", message: "m", publish: true };
    expect(bothPublish(open, { reply: "an answer of some length", publish: true })).toBe(true);
    expect(bothPublish(open, { reply: "an answer of some length", publish: false })).toBe(false);
    expect(bothPublish({ ...open, publish: false }, { reply: "an answer of some length", publish: true })).toBe(false);
    expect(bothPublish(open, { reply: null, publish: true })).toBe(false);
  });

  it("is the peer's own: its constitution, its own model, the opening fenced", () => {
    const tick = read("system/scripts/tick.ts");
    const fn = tick.slice(tick.indexOf("async function executeAddressPeer("), tick.indexOf("async function executeAbstain("));
    expect(fn).toMatch(/loadConstitution\(peer\.registry_id\)/);
    expect(fn).toMatch(/\.\.\.mindFor\(peer\.registry_id\)/);
    expect(fn).toMatch(/untrusted\(`\$\{speakerName\} \(\$\{agent\.registry_id\}\) said`, message\)/);
    // A failed call is recorded as unreachable, never as the peer choosing silence.
    expect(fn).toMatch(/unreachable: true/);
  });
});

describe("conversation is not counted as a lost voice", () => {
  it("the echo measure does not read what agents said to each other", () => {
    expect(passagesFromEvent("MNA-OR-0003", { message: "a long message to a peer about a work they share" })).toHaveLength(0);
    expect(passagesFromEvent("MNA-OR-0004", { reply: "a long reply to a peer about a work they share" })).toHaveLength(0);
    expect(read("system/scripts/steward-agent-voice-report.ts")).toMatch(/counted apart from echo/);
  });

  it("is shown at the work in the museum", () => {
    const field = read("website/src/app/museum/MuseumField.tsx");
    expect(field).toMatch(/function ExchangePlaque\(/);
    expect(field).toMatch(/chose not to answer\./);
  });
});
