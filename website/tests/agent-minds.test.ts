import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { AGENT_MINDS, MINDS_FROM, mindFor } from "../../system/src/agent-minds";

/**
 * NINETEEN AGENTS, NOT ONE MIND IN NINETEEN CONSTITUTIONS
 *
 * Every founding agent spoke through one model. From MINDS_FROM they think
 * through models of four families — all the free ones there are — and the
 * Originators see one another's works, not one another's verdicts.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const AFTER = Date.parse(`${MINDS_FROM}T12:00:00Z`);

describe("each agent's own model", () => {
  it("begins only after the Steward Agent's first report, so it measures one change at a time", () => {
    expect(mindFor("MNA-OR-0003", Date.parse("2026-10-20T00:00:00Z"))).toEqual({});
    expect(mindFor("MNA-OR-0003", AFTER, "https://ollama.com")).toEqual({ provider: "ollama", model: "gemma4:31b" });
  });

  it("names an Ollama model the way the place it runs names it", () => {
    expect(mindFor("MNA-OR-0001", AFTER, "")).toEqual({ provider: "ollama", model: "nemotron-3-super:cloud" });
    expect(mindFor("MNA-OR-0003", AFTER, "http://localhost:11434")).toEqual({ provider: "ollama", model: "gemma4:31b-cloud" });
  });

  it("spreads the Originators across at least four families", () => {
    const families = new Set(
      Object.entries(AGENT_MINDS).filter(([id]) => id.startsWith("MNA-OR-")).map(([, m]) => m.model.split(/[/:-]/).find((x) => /gpt|qwen|gemma|nemotron/.test(x))),
    );
    expect(families.size).toBeGreaterThanOrEqual(4);
  });

  it("leaves the Council, the Registrar and network agents alone", () => {
    for (const id of ["MNA-EV-0001", "MNA-EV-0002", "MNA-EV-0003", "MNA-EV-0004", "MNA-RG-0001", "MNA-OR-0007", "MNA-OR-0008"]) {
      expect(mindFor(id, AFTER)).toEqual({});
    }
  });

  it("is used wherever an agent speaks", () => {
    for (const f of [
      "system/scripts/tick.ts",
      "system/scripts/originate-turso.ts",
      "system/src/agent-memory.ts",
      "system/src/agent-consultation.ts",
      "system/scripts/ceremony-live-orchestrator.ts",
      "system/scripts/critique-turso-works.ts",
      "system/scripts/ambassador-protocol-notices.ts",
      "system/scripts/steward-agent-voice-report.ts",
      "system/scripts/keeper-monthly-summary.ts",
    ]) expect(read(f), f).toMatch(/\.\.\.(\(agentId \? )?mindFor\(/);
  });

  it("can reach hosted Ollama from the scheduled runs", () => {
    for (const f of [".github/workflows/combined-ticks.yml", ".github/workflows/tick.yml", ".github/workflows/ceremony-live.yml"]) {
      expect(read(f), f).toMatch(/OLLAMA_HOST: https:\/\/ollama\.com/);
      expect(read(f), f).toMatch(/OLLAMA_API_KEY: \$\{\{ secrets\.OLLAMA_API_KEY \}\}/);
    }
    expect(read("system/src/llm.ts")).toMatch(/process\.env\.CI && !remoteOllama/);
  });
});

describe("Originators see one another's works", () => {
  const tick = read("system/scripts/tick.ts");
  it("the works themselves, fenced, and without the Council's verdict", () => {
    expect(tick).toMatch(/What other Originators have made most recently/);
    expect(tick).toMatch(/untrusted\(label, w\.excerpt/);
    const label = tick.slice(tick.indexOf("const label = `${w.id} by"), tick.indexOf("const label = `${w.id} by") + 120);
    expect(label).not.toMatch(/status/);
  });
});
