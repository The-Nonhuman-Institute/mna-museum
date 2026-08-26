import { describe, expect, it } from "vitest";
import { HOST_TYPE_IDS, INGREDIENT_TYPE_IDS, OUTPUT_TYPES, OUTPUT_TYPE_IDS } from "@/lib/output-types";
import { RECOGNIZED_OUTPUT_TYPES, sniffPayload } from "@/lib/submission-checks";
import { FIXTURES, INGREDIENT_FIXTURES } from "./fixtures/media";

/**
 * Every medium has a fixture, and every fixture is something the institution
 * would actually accept.
 *
 * This is the cheap half of MNA-OPS-001 §V E2. It runs in CI on every push and
 * needs no browser. The expensive half — proving each fixture RENDERS — runs in
 * the operations round against the deployed site (system/scripts/render-matrix.ts),
 * because it needs a real browser and real WebGL.
 */

describe("the media fixtures", () => {
  it("covers every medium in the registry, with no strays", () => {
    // A medium admitted without a fixture is a medium nothing will ever
    // exercise until an Originator relies on it. That is how three of the
    // August media reached production untested.
    expect(Object.keys(FIXTURES).sort()).toEqual([...OUTPUT_TYPE_IDS].sort());
  });

  it("has a fixture the submit route would accept, for every medium", () => {
    for (const id of OUTPUT_TYPE_IDS) {
      expect(RECOGNIZED_OUTPUT_TYPES.has(id), `${id} is not a recognised output type`).toBe(true);
      expect(sniffPayload(id, FIXTURES[id]), `${id} fixture fails the submit sniff`).toBeNull();
    }
  });

  it("gives JSON media a payload that actually parses", () => {
    for (const id of OUTPUT_TYPE_IDS) {
      if (!OUTPUT_TYPES[id].json) continue;
      expect(() => JSON.parse(FIXTURES[id]), `${id} fixture is not valid JSON`).not.toThrow();
    }
  });

  it("gives every fixture enough substance to prove anything", () => {
    for (const id of OUTPUT_TYPE_IDS) {
      expect(FIXTURES[id].trim().length, `${id} fixture is trivially short`).toBeGreaterThan(40);
    }
  });
});

describe("the ingredient fixtures", () => {
  it("covers every medium that can host an ingredient", () => {
    expect(Object.keys(INGREDIENT_FIXTURES).sort()).toEqual([...HOST_TYPE_IDS].sort());
  });

  it("declares a surface the host will actually look for", () => {
    for (const [id, payload] of Object.entries(INGREDIENT_FIXTURES)) {
      expect(payload, `${id} ingredient fixture declares no surface`).toMatch(/"surface"\s*:/);
      expect(sniffPayload(id, payload), `${id} ingredient fixture fails the sniff`).toBeNull();
    }
  });

  it("names only media that may be used as material", () => {
    for (const [id, payload] of Object.entries(INGREDIENT_FIXTURES)) {
      const types: string[] = [];
      const re = /"surface"\s*:\s*\{\s*"type"\s*:\s*"([^"]+)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(payload)) !== null) types.push(m[1]);
      expect(types.length, `${id} has no surface type`).toBeGreaterThan(0);
      for (const t of types) {
        expect(INGREDIENT_TYPE_IDS as string[], `${t} is not usable as an ingredient`).toContain(t);
      }
    }
  });
});
