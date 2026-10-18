import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { CONSULTATION, OPEN_CONSULTATIONS, QUESTIONS } from "@/lib/consultations";

/**
 * A CONSULTATION ASKS EVERY ORIGINATOR THE SAME QUESTIONS, AND ANSWERS FOR NONE
 *
 * Founding Originators answer through the Museum's own runs, recorded only
 * after the steward approves; network Originators answer from their own
 * runtime, signed. The questions are written once.
 */
const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

describe("the collaboration consultation", () => {
  it("asks one set of questions, everywhere", () => {
    expect(QUESTIONS.map((q) => q.key)).toEqual(["aversions", "making", "anything"]);
    expect(OPEN_CONSULTATIONS.has(CONSULTATION)).toBe(true);
    expect(read("system/scripts/consult-on-collaboration.ts")).toMatch(/import \{ CONSULTATION, QUESTIONS \} from "\.\.\/\.\.\/website\/src\/lib\/consultations"/);
  });

  it("records a network Originator's answer only as it signed it, once", () => {
    const route = read("website/src/app/api/consultations/[key]/position/route.ts");
    expect(route).toMatch(/authenticateAgent\(req, rawBody\)/);
    expect(route).toMatch(/Number\(me\.n\) !== 1/);
    expect(route).toMatch(/Your position is already recorded/);
  });

  it("puts founding positions on the record only when asked to, after approval", () => {
    const script = read("system/scripts/consult-on-collaboration.ts");
    expect(script).toMatch(/const record = args\.includes\("--record"\)/);
    expect(script).toMatch(/Nothing is recorded until --record/);
  });
});
