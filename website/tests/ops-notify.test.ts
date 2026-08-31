import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * REPORTED EVERY ROUND, MAILED WHEN IT CHANGES
 *
 * Four previews are blank because the works are: three of Gap's, whose
 * orientation is absence, and one fragment the Conservator could make
 * well-formed but not visible. The steward saw them and decided they stand.
 *
 * A2 goes on flagging them — nothing is exempted — but escalating them every
 * three hours would mail a standing condition forever, and an alarm that fires
 * constantly is one nobody reads. The cost of that is not the noise; it is the
 * next REAL escalation arriving in a stream the steward has stopped opening.
 */
const ROOT = path.resolve(__dirname, "..", "..");
const notify = readFileSync(path.join(ROOT, "system/scripts/ops-notify.ts"), "utf8");
const workflow = readFileSync(path.join(ROOT, ".github/workflows/ops-round.yml"), "utf8");

describe("escalation mail", () => {
  it("compares this round's escalation set against the last one mailed", () => {
    expect(notify).toMatch(/escalationDigest/);
    expect(notify).toMatch(/lastEmailedDigest\(\)/);
  });

  it("ignores item order, so a reshuffle is not news", () => {
    // Slicing to the first "}" would cut inside `${f.check}` — take the whole
    // function instead, up to the line that closes it.
    const start = notify.indexOf("function escalationDigest");
    const body = notify.slice(start, notify.indexOf("\n}", start));
    expect(body).toMatch(/\.sort\(\)/);
    // Items are excluded from the fingerprint on purpose.
    expect(body).not.toMatch(/f\.items/);
  });

  it("writes the run summary before deciding whether to mail", () => {
    // Suppressing the mail must never suppress the record.
    const summaryAt = notify.indexOf("writeStepSummary(report, text)");
    const digestAt = notify.indexOf("const digest = escalationDigest(report)");
    expect(summaryAt).toBeGreaterThan(0);
    expect(digestAt).toBeGreaterThan(summaryAt);
  });

  it("only remembers a set it actually sent", () => {
    // Recording the digest before the send would silence a mail that failed.
    const remembered = notify.indexOf("rememberDigest(digest, report)");
    const sent = notify.indexOf("emails.send(");
    expect(remembered).toBeGreaterThan(sent);
  });

  it("runs before the commit, so what was mailed is committed with it", () => {
    const notifyAt = workflow.indexOf("Tell the steward");
    const commitAt = workflow.indexOf("Commit anything the round repaired");
    expect(notifyAt).toBeGreaterThan(0);
    expect(notifyAt).toBeLessThan(commitAt);
    expect(workflow).toMatch(/system\/data\/ops-escalations\.json/);
  });

  it("does not deploy the website for a change no visitor can see", () => {
    // The note of what was mailed is not a website file.
    expect(workflow).toMatch(/web_changed/);
    expect(workflow).toMatch(/if: steps\.commit\.outputs\.web_changed == 'true'/);
  });
});
