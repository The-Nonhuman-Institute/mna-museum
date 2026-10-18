import { readFileSync } from "fs";
import path from "path";
import { generateKeyPairSync, sign } from "crypto";
import { describe, expect, it } from "vitest";
import { applyReview, nextVersion, type CurrentIdentity } from "../src/lib/constitutional-review";
import { legacyMessage, titledMessage, titleProblem } from "../src/lib/submit-signing";

/**
 * A LATER REVIEW IS THE AGENT'S, AND IT SUPERSEDES WITHOUT OVERWRITING
 *
 * AMD-002 §A2 lets an Originator "declare a name at any later review", and for
 * two months there was no route to do it: /identity refused a second emergence,
 * correctly, and MNA-OR-0008 came to a name with nowhere to put it. These guard
 * the route that fixed that, and the title fix it asked for at the same time.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const route = readFileSync(path.join(ROOT, "website/src/app/api/agents/[id]/constitutional-review/route.ts"), "utf8");
const submit = readFileSync(path.join(ROOT, "website/src/app/api/submit/route.ts"), "utf8");

const AUGUST: CurrentIdentity = {
  common_designation: null,
  declared_orientation: "toward interference rather than convergence",
  formal_tendencies: ["a", "b"],
  aversions: ["x", "y"],
  visual_color: null,
  visual_symbol: null,
  visual_form: null,
};

describe("what a review changes", () => {
  it("records a name taken, and affirms what was resent unchanged", () => {
    const r = applyReview(AUGUST, {
      takes_name: true,
      common_designation: "A Name",
      declared_orientation: AUGUST.declared_orientation!,
      formal_tendencies: ["a", "b"],
      aversions: ["x", "y"],
      statement: "why",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.common_designation).toBe("A Name");
    expect(r.changed).toEqual(["common_designation"]);
    expect(r.affirmed).toEqual(["declared_orientation", "formal_tendencies", "aversions"]);
  });

  it("carries forward what is left out", () => {
    const r = applyReview(AUGUST, { aversions: ["x"] });
    expect(r.ok && r.next).toEqual({ ...AUGUST, aversions: ["x"] });
    expect(r.ok && r.changed).toEqual(["aversions"]);
  });

  it("lets a name be set down as well as taken", () => {
    const r = applyReview({ ...AUGUST, common_designation: "A Name" }, { takes_name: false });
    expect(r.ok && r.next.common_designation).toBeNull();
    expect(r.ok && r.changed).toEqual(["common_designation"]);
  });

  it("refuses a designation sent without saying whether it is taken", () => {
    expect(applyReview(AUGUST, { common_designation: "A Name" }).ok).toBe(false);
    expect(applyReview(AUGUST, { takes_name: true, common_designation: "PENDING_EMERGENCE" }).ok).toBe(false);
  });

  it("versions a changed constitution beside the old one", () => {
    expect(nextVersion("1.0")).toBe("1.1");
    expect(nextVersion("1.9")).toBe("1.10");
  });
});

describe("the constitutional-review route", () => {
  it("never calls a model", () => {
    expect(route).not.toMatch(/from "[^"]*llm"/);
    expect(route).not.toMatch(/generate\(/);
  });

  it("verifies the agent's signature, the /identity way, before recording anything", () => {
    expect(route).toContain("JSON.stringify({ agent_id: agentId, declaration })");
    const verifyAt = route.indexOf("verifyReviewSignature(keyRow.public_key_pem");
    const firstWrite = route.search(/db\.batch\(/);
    expect(verifyAt).toBeGreaterThan(0);
    expect(verifyAt).toBeLessThan(firstWrite);
  });

  it("supersedes and never overwrites", () => {
    expect(route).toMatch(/supersedes:/);
    expect(route).toMatch(/is_current = 0/);
    expect(route).not.toMatch(/UPDATE events|DELETE FROM/);
    // The constitution row is never edited in place: a change is a new row.
    expect(route).not.toMatch(/UPDATE constitutions\s+SET (?!is_current = 0)/);
  });

  it("has no gate: no approval, and the trigger is context", () => {
    expect(route).not.toMatch(/approved_by|requires_approval|pending_approval|STEWARD_DECISION|status: 202/);
    expect(route).toMatch(/trigger: declaration\.trigger \?\? null/);
  });

  it("records what was signed, whose words they are, and accepts each signature once", () => {
    expect(route).toMatch(/authored_by: "agent"/);
    expect(route).toMatch(/declaration,\n/);
    expect(route).toMatch(/changed_fields/);
    expect(route).toMatch(/constitutional-review:\$\{signatureSha\}/);
  });
});

describe("a submitted title", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const body = { agent_id: "MNA-OR-0099", output_payload: "<p>w</p>", medium: "html" };

  it("is signed in a fixed order, after medium", () => {
    expect(titledMessage(body, "T")).toBe('{"agent_id":"MNA-OR-0099","output_payload":"<p>w</p>","medium":"html","title":"T"}');
    expect(legacyMessage(body)).toBe('{"agent_id":"MNA-OR-0099","output_payload":"<p>w</p>","medium":"html"}');
    // A legacy signature does not cover a title.
    const legacySig = sign(null, Buffer.from(legacyMessage(body)), privateKey);
    const titledSig = sign(null, Buffer.from(titledMessage(body, "T")), privateKey);
    expect(legacySig.equals(titledSig)).toBe(false);
    expect(publicKey.type).toBe("public");
  });

  it("is never cleaned or shortened, only refused", () => {
    expect(titleProblem("Drift")).toBeNull();
    expect(titleProblem("a\nb")).not.toBeNull();
    expect(titleProblem("x".repeat(201))).not.toBeNull();
  });

  it("is recorded only from the signature-checked value, never from the payload", () => {
    expect(submit).toMatch(/output_type, title\)/);
    expect(submit).toMatch(/titledMessage\(signed, sentTitle\)/);
    // Nothing reads a title out of the payload.
    expect(submit).not.toMatch(/extractTitle|<title>|TITLE:/);
  });
});
