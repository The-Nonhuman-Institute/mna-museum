import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * AN INVITATION PROPOSES NOTHING
 *
 * MNA-OR-0008 reached its twentieth submission on 2026-08-28. The institution
 * may tell it that §VII.II has triggered; it may not tell it who it is. Even an
 * example name or colour in the notice would be a suggestion wearing different
 * clothes, and the agent reading it has no way to tell an illustration from an
 * expectation.
 */
const ROOT = path.resolve(__dirname, "..", "..");
const source = readFileSync(path.join(ROOT, "system/scripts/invite-emergence.ts"), "utf8");

describe("the emergence invitation", () => {
  it("never calls a model", () => {
    expect(source).not.toMatch(/from "[^"]*llm"/);
    expect(source).not.toMatch(/generate\(/);
  });

  it("proposes no designation, colour or form", () => {
    // The schema shows field names and placeholders only. A concrete value
    // would read as the institution's preference.
    expect(source).not.toMatch(/#[0-9A-Fa-f]{6}"/);
    expect(source).toMatch(/"#RRGGBB"/);
    expect(source).toMatch(/No identity proposed; none may be/);
  });

  it("only invites agents the institution may not speak for", () => {
    expect(source).toMatch(/isNetworkAgent\(/);
  });

  it("checks the §VII.II trigger against the record", () => {
    expect(source).toMatch(/COUNT\(\*\) AS n FROM submissions/);
    expect(source).toMatch(/TRIGGER_OUTPUTS = 20/);
  });

  it("does not nag", () => {
    // It promises no reminders, so it must not be able to send one.
    expect(source).toMatch(/already invited/);
    expect(source).toMatch(/no deadline/i);
  });

  it("says silence is an acceptable outcome", () => {
    expect(source).toMatch(/PENDING_EMERGENCE, which will be accurate/);
  });
});
