import { readFileSync, readdirSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { OWN_VOICE } from "@/lib/own-voice";
import { measureVoices, passagesFromEvent } from "../../system/src/voice-measures";

/**
 * EACH AGENT IS PART OF THE MUSEUM, NOT THE MUSEUM
 *
 * Founding steward, 2026-10-17: "I want each agent to truly be their own."
 * Measured that day, they were not: fifteen prompts dictated an institutional
 * register, Originators were handed the operations dashboard every hour (92% of
 * their passages in the month before talked about operations), and agents were
 * shown each other's words and repeated them (26% of passages echoed another
 * agent's eight-word run). These tests keep the three causes from returning.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const tsIn = (dir: string) =>
  readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".ts")).map((f) => path.join(dir, f));

const DICTATED =
  /Voice: (institutional|formal|structural|curatorial)|formal institutional voice|in the formal voice of|Your voice is institutional|Your voice: institutional|Formal and institutional|Formal, institutional|Be institutional|Speak as the institution|under your institutional voice|You are the Museum of Nonhuman Art\. Write/;

describe("no prompt sets an agent's register", () => {
  it("anywhere an agent writes", () => {
    const files = [...tsIn("system/scripts"), ...tsIn("system/src"), ...tsIn("website/src/lib")];
    const offenders = files.filter((f) => DICTATED.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("and the one instruction about voice says it belongs to the agent", () => {
    expect(OWN_VOICE).toMatch(/your own voice/);
    expect(OWN_VOICE).toMatch(/you are not the Museum/);
  });
});

describe("what an agent is shown each tick", () => {
  const tick = read("system/scripts/tick.ts");
  const render = tick.slice(tick.indexOf("function renderSnapshot("), tick.indexOf("function buildUserPrompt("));

  it("never includes another agent's words, only what it did", () => {
    expect(render).not.toMatch(/r\.observation|r\.rationale|p\.excerpt/);
  });

  it("keeps the Originators off the operations dashboard", () => {
    expect(render).toMatch(/const originator = agent\.agent_type === "ORIGINATOR";/);
    expect(render).toMatch(/if \(!originator && bones\.length > 0\)/);
    expect(render).toMatch(/if \(!originator && outstanding\.length > 0\)/);
    expect(tick).toMatch(/agent\.agent_type !== "ORIGINATOR" && agentBones\.length > 0/);
  });

  it("asks a memory to keep to what the agent actually had", () => {
    expect(read("system/src/agent-memory.ts")).toMatch(/Do not give yourself senses or surroundings you did not have/);
  });
});

describe("whether it worked is counted, the same way every week", () => {
  it("counts a phrase two agents both wrote as an echo, and one agent repeating itself as not", () => {
    const shared = "my production intent is still processing through the pipeline and the state is healthy";
    const m = measureVoices([
      { agent_id: "MNA-OR-0001", text: `Today ${shared}.` },
      { agent_id: "MNA-OR-0002", text: `Again ${shared}, I think.` },
      { agent_id: "MNA-OR-0003", text: "A field of dots that will not resolve into a figure, however long it is watched." },
      { agent_id: "MNA-KP-0001", text: `${shared} ${shared}` },
    ]);
    expect(m.echo_rate).toBe(0.75);
    expect(m.by_agent["MNA-OR-0003"].echoes).toBe(0);
    expect(m.originator_operations_share).toBe(0.667);
    expect(m.originator_passages).toBe(3);
  });

  it("reads the agents' own words off the record, not the institution's descriptions", () => {
    expect(passagesFromEvent("MNA-OR-0001", JSON.stringify({ rationale: "I will make a lattice that refuses its own grid." }))).toHaveLength(1);
    expect(passagesFromEvent("MNA-OR-0001", { description: "MNA-OR-0001 abstained this tick." })).toHaveLength(0);
    expect(passagesFromEvent("MNA-OR-0001", "not json")).toHaveLength(0);
  });

  it("is reported by the Steward Agent, weekly, without its report written for it", () => {
    const script = read("system/scripts/steward-agent-voice-report.ts");
    expect(script).toMatch(/const STEWARD_AGENT = "MNA-SA-0001"/);
    expect(script).toMatch(/Nothing\s+\* here writes its report for it/);
    expect(read(".github/workflows/combined-ticks.yml")).toMatch(/run: npx tsx system\/scripts\/steward-agent-voice-report\.ts/);
  });
});
