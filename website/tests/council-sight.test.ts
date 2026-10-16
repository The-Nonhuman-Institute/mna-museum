import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  HELD_EXIT_CODE,
  SIGHT_SECONDS,
  buildEvalPrompt,
  distinctFrames,
  sightNote,
  type WorkRow,
} from "../../system/src/council";
import { heldWorks } from "../../system/src/ops-checks";

/**
 * THE COUNCIL SEES WHAT IT JUDGES
 *
 * Founding steward, 2026-10-16. Until then the Council was given a work's source
 * and nothing else. On 2026-10-03 the Historicist canonized MNA-OR-0002-W-0035,
 * writing of "a hypnotic expansion-contraction that feels like a distant heart
 * beating in the dark", while every visitor saw a black square. The pilot
 * (Council Sight Pilot) showed sight grounds a verdict; it also showed one still
 * frame misrepresents a work that changes, which is why there are several.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const evaluator = read("system/scripts/evaluate-turso-works.ts");

const work = (output_type: string): WorkRow => ({
  id: "MNA-OR-0002-W-0035",
  originator_id: "MNA-OR-0002",
  output_type,
  output_payload: "[]",
  medium: output_type,
});
const frame = (seconds: number, png: string) => ({ seconds, png });

describe("a work is photographed across its run, and a still work shown once", () => {
  it("photographs early, mid-run and after a minute", () => {
    expect(SIGHT_SECONDS).toEqual([3, 20, 60]);
  });

  it("keeps every frame of a work that changes", () => {
    expect(distinctFrames([frame(3, "a"), frame(20, "b"), frame(60, "c")]).map((f) => f.seconds)).toEqual([3, 20, 60]);
  });

  it("shows a still work once", () => {
    expect(distinctFrames([frame(3, "a"), frame(20, "a"), frame(60, "a")]).map((f) => f.seconds)).toEqual([3]);
  });

  it("drops only a frame identical to the one before it", () => {
    expect(distinctFrames([frame(3, "a"), frame(20, "a"), frame(60, "b")]).map((f) => f.seconds)).toEqual([3, 60]);
  });
});

describe("the evaluator is told what the images are", () => {
  it("says a still work did not change, rather than showing three copies", () => {
    const note = sightNote(work("svg"), { capturedAt: [3, 20, 60], shownAt: [3] });
    expect(note).toMatch(/one image/);
    expect(note).toMatch(/photographed at 3, 20 and 60 seconds/);
    expect(note).toMatch(/does not change/);
  });

  it("names the moments of a work that changes, in order", () => {
    const note = sightNote(work("html-css"), { capturedAt: [3, 20, 60], shownAt: [3, 20, 60] });
    expect(note).toMatch(/3 images, in order/);
    expect(note).toMatch(/at 3, 20 and 60 seconds/);
  });

  it("says an audio work's image is its player, and the sound is judged from its score", () => {
    const note = sightNote(work("audio-json"), { capturedAt: [3, 20, 60], shownAt: [3] });
    expect(note).toMatch(/image shows its player, not the sound/);
    expect(note).toMatch(/Judge the sound from its score/);
  });

  it("puts the note after the work, and leaves a source-only prompt as it was", () => {
    const seeing = buildEvalPrompt("MNA-EV-0004", work("svg"), [], [], { capturedAt: [3], shownAt: [3] });
    const blind = buildEvalPrompt("MNA-EV-0004", work("svg"), [], []);
    expect(seeing.indexOf("--- WHAT YOU ARE SHOWN ---")).toBeGreaterThan(seeing.indexOf("--- END WORK ---"));
    expect(blind).not.toMatch(/WHAT YOU ARE SHOWN/);
    expect(seeing.replace(/--- WHAT YOU ARE SHOWN ---[\s\S]*?--- END ---\n\n/, "")).toBe(blind);
  });
});

describe("a work that does not render is held, never judged blind", () => {
  const evaluateWork = evaluator.slice(evaluator.indexOf("async function evaluateWork("), evaluator.indexOf("async function eventsOf("));

  it("is photographed before anything is recorded", () => {
    const capture = evaluateWork.indexOf("await see(work)");
    const inReview = evaluateWork.indexOf("SET status = 'IN_REVIEW'");
    expect(capture).toBeGreaterThan(0);
    expect(capture).toBeLessThan(inReview);
  });

  it("returns HELD on a render error, and the run exits with the held code", () => {
    expect(evaluator).toMatch(/if \("error" in shot\) return \{ held: shot\.error \};/);
    expect(evaluateWork).toMatch(/if \("held" in seen\) \{[\s\S]{0,200}return \{ status: "HELD", verdicts: \{\} \};/);
    expect(evaluator).toMatch(/process\.exitCode = HELD_EXIT_CODE;/);
  });

  it("is escalated by B1 with the reason, not retried silently", () => {
    const round = read("system/scripts/ops-round.ts");
    expect(round).toMatch(/err\.status === HELD_EXIT_CODE \? heldWorks\(/);
    expect(round).toMatch(/severity: "escalate", summary: `\$\{held\.length\} work\(s\) held/);
  });

  it("reads the held works from the evaluator's own log line", () => {
    const out = [
      "[evaluate]   HELD MNA-OR-0002-W-0035: did not render — renderer error at 3s: ERROR: 0:6: 'dot'",
      "[evaluate]   seen at 3/20/60s — 1 distinct frame(s)",
      "[evaluate] HELD 1: MNA-OR-0002-W-0035 — not judged; they did not render",
    ].join("\n");
    expect(heldWorks(out)).toEqual([{ id: "MNA-OR-0002-W-0035", reason: "renderer error at 3s: ERROR: 0:6: 'dot'" }]);
    expect(HELD_EXIT_CODE).toBe(3);
  });
});

describe("every evaluator is shown the frames, and the verdict says so", () => {
  it("judges by looking when there is sight, and from source only when switched off", () => {
    expect(evaluator).toMatch(/const sightOn = process\.env\.MNA_COUNCIL_SIGHT !== "off";/);
    expect(evaluator).toMatch(/\? await llm\.generateSeeing\(systemPrompt, userPrompt, images,/);
    expect(evaluator).toMatch(/buildEvalPrompt\(evalId, work, priorWorks, canonWorks, sight\)/);
  });

  it("can reach the seeing model from the scheduled runs that evaluate", () => {
    for (const wf of ["tick.yml", "ops-round.yml"]) {
      const src = read(`.github/workflows/${wf}`);
      expect(src, wf).toMatch(/OLLAMA_HOST: https:\/\/ollama\.com/);
      expect(src, wf).toMatch(/OLLAMA_API_KEY: \$\{\{ secrets\.OLLAMA_API_KEY \}\}/);
    }
  });
});
