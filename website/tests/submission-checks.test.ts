import { describe, expect, it } from "vitest";
import { OUTPUT_TYPE_IDS } from "@/lib/output-types";
import { RECOGNIZED_OUTPUT_TYPES, sniffPayload } from "@/lib/submission-checks";

const SHADER = "void mainImage(out vec4 o, in vec2 f){ o = vec4(1.0); }";

describe("recognised output types", () => {
  it("recognises exactly what the registry defines", () => {
    // This was a hand-written list. MNA-OR-0008 was told shader-glsl was not a
    // valid output_type while the menu was offering it.
    expect(Array.from(RECOGNIZED_OUTPUT_TYPES).sort()).toEqual(Array.from(OUTPUT_TYPE_IDS).sort());
  });
});

describe("sniffPayload", () => {
  it("accepts a well-formed payload for each medium it checks", () => {
    expect(sniffPayload("svg", "<svg xmlns='http://www.w3.org/2000/svg'></svg>")).toBeNull();
    expect(sniffPayload("shader-glsl", SHADER)).toBeNull();
    expect(sniffPayload("canvas-json", '[{"op":"bg","color":"#000"}]')).toBeNull();
    expect(sniffPayload("instruction-set", "G21\nG0 X0 Y0\nG1 X10 Y0")).toBeNull();
  });

  it("finds a shader entry point beyond the first two kilobytes", () => {
    // The sniff read a 2KB sample and rejected shaders whose main() came later,
    // which is how a real submission was refused as "not a shader".
    const padded = "// " + "x".repeat(4000) + "\n" + SHADER;
    expect(sniffPayload("shader-glsl", padded)).toBeNull();
  });

  it("rejects a shader with no entry point", () => {
    expect(sniffPayload("shader-glsl", "float x = 1.0;")).toMatch(/entry point|main/i);
  });

  it("refuses an audio work that cannot sound", () => {
    // The exact failure W-0030 slipped through: parses, has voices, sounds
    // nothing.
    const silent = JSON.stringify({ duration: 10, voices: [{ type: "sine" }] });
    expect(sniffPayload("audio-json", silent)).toMatch(/playable notes/i);
  });

  it("accepts audio in either supported shape", () => {
    const nested = JSON.stringify({ voices: [{ type: "sine", notes: [{ freq: 440, duration: 1 }] }] });
    const flat = JSON.stringify({ voices: [{ type: "sine", freq: 32.7, start: 0, end: 45 }] });
    expect(sniffPayload("audio-json", nested)).toBeNull();
    expect(sniffPayload("audio-json", flat)).toBeNull();
  });

  it("catches a payload that is plainly the wrong medium", () => {
    expect(sniffPayload("svg", "just some words")).toBeTruthy();
    expect(sniffPayload("canvas-json", "<svg></svg>")).toBeTruthy();
  });

  it("never throws, whatever it is handed", () => {
    for (const id of OUTPUT_TYPE_IDS) {
      for (const payload of ["", "   ", "{", "<", " ", "x".repeat(5000)]) {
        expect(() => sniffPayload(id, payload)).not.toThrow();
      }
    }
  });
});
