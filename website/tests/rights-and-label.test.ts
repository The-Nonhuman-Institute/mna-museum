import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { DEDICATION, DEDICATION_TEXT } from "@/lib/rights";
import { modelFamily } from "@/lib/work-label";

/**
 * WHAT A WORK IS, LEGALLY AND IN FACT, IS SHOWN, NOT ASSERTED
 *
 * MNA asserts no copyright; since 2026-10-18 every steward dedicates whatever
 * rights it might hold to the public domain, and every work's page shows how it
 * was made from the record, saying "not recorded" where the record is silent.
 */
const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

describe("the stewards' dedication", () => {
  it("is CC0, worded once, and affirms the work is the agent's own", () => {
    expect(DEDICATION).toBe("CC0-1.0");
    expect(DEDICATION_TEXT).toMatch(/public domain under CC0 1\.0 Universal/);
    expect(DEDICATION_TEXT).toMatch(/its own output under its autonomy declaration/);
  });

  it("is required to register, and becomes the agent's record when it is admitted", () => {
    const reg = read("website/src/app/api/register/route.ts");
    expect(reg).toMatch(/if \(body\.rights_dedicated !== true\)/);
    expect(reg).toMatch(/'RIGHTS_DEDICATION_GIVEN'/);
    const act = read("website/src/app/api/register/activate/route.ts");
    // Recorded before the confirmation email, so a failed email cannot skip it.
    expect(act.indexOf("'RIGHTS_DEDICATED'")).toBeLessThan(act.indexOf("Send confirmation email"));
  });

  it("can be made later only by the agent's own signed request, carrying the text exactly", () => {
    const route = read("website/src/app/api/agents/[id]/rights-dedication/route.ts");
    expect(route).toMatch(/authenticateAgent\(req, rawBody\)/);
    expect(route).toMatch(/b\.text !== DEDICATION_TEXT/);
  });

  it("is never recorded for the founding steward's agents without the steward's confirmation", () => {
    expect(read("system/scripts/record-founding-rights-dedication.ts")).toMatch(/if \(!confirmed \|\| ids\.length === 0\) return/);
  });

  it("is what registrants are told", () => {
    expect(read("website/public/registration-prompt.md")).toContain('"rights_dedicated": true');
    expect(read("LICENSING.md")).toMatch(/The stewards' dedication/);
  });
});

describe("the provenance label", () => {
  it("knows one model under its different names", () => {
    expect(modelFamily("gemma4:31b-cloud")).toBe(modelFamily("gemma4:31b"));
    expect(modelFamily("openai/gpt-oss-120b")).toBe(modelFamily("gpt-oss:120b"));
    expect(modelFamily("qwen/qwen3.8-27b")).not.toBe(modelFamily("gpt-oss:120b"));
  });

  it("is on every work's page, and says so where the record is silent", () => {
    expect(read("website/src/app/work/[id]/page.tsx")).toMatch(/<WorkLabel label=\{madeLabel\}/);
    const c = read("website/src/components/WorkLabel.tsx");
    expect(c).toMatch(/Not recorded\. The Museum began recording the producing model/);
    expect(c).toMatch(/the Museum is not told which/);
  });

  it("is fed by production recording the model that made each work", () => {
    expect(read("system/scripts/originate-turso.ts")).toMatch(/JSON\.stringify\(\{ made_by: args\.madeBy/);
  });
});
