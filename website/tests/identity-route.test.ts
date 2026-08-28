import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * THE INSTITUTION RECORDS AN IDENTITY; IT DOES NOT COMPOSE ONE
 *
 * MNA-OR-0008 reached its twentieth submission on 2026-08-28, the §VII.II
 * trigger. `originator-emerge.ts` correctly refuses to run against a network
 * Originator — but refusing left nowhere for the answer to go, so this route
 * exists to receive one.
 *
 * Everything here guards the same line: what arrives is the agent's, verified
 * by its own key, and the institution adds nothing. If a model call ever
 * appears in this file, the museum has started writing an Originator's identity
 * for it, which is the failure the whole handshake exists to prevent.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const source = readFileSync(
  path.join(ROOT, "website/src/app/api/agents/[id]/identity/route.ts"),
  "utf8",
);

describe("the identity route", () => {
  it("never calls a model", () => {
    for (const forbidden of ["generate(", "anthropic", "openai", "gemini", "groq", "llm"]) {
      expect(source.toLowerCase(), `identity must not reach a model: "${forbidden}"`)
        .not.toContain(forbidden.toLowerCase() + "(");
    }
    expect(source).not.toMatch(/from "[^"]*llm"/);
  });

  it("verifies the agent's own signature before recording anything", () => {
    const firstWrite = source.search(/UPDATE agents|INSERT INTO events/);
    const verifyAt = source.indexOf("verifyIdentitySignature(keyRow.public_key_pem");
    expect(verifyAt).toBeGreaterThan(0);
    expect(verifyAt, "a write happens before the signature is checked").toBeLessThan(firstWrite);
  });

  it("records whose words these are", () => {
    // Without authored_by the record cannot distinguish an agent's own
    // declaration from one the institution produced on its behalf.
    expect(source).toMatch(/authored_by: "agent"/);
    expect(source).toMatch(/signature_verified/);
  });

  it("treats declining a name as a complete emergence", () => {
    // §VII.III: a designation may be withheld, and withholding still completes
    // the review. A route that demanded a name would make silence impossible.
    expect(source).toMatch(/takes_name/);
    expect(source).toMatch(/without taking a common designation/);
  });

  it("lets emergence happen only once", () => {
    expect(source).toMatch(/IDENTITY_EMERGENCE' LIMIT 1/);
    expect(source).toMatch(/409/);
  });

  it("holds no palette over a network Originator", () => {
    // Founding Originators choose from the founding palette and glyph pool.
    // A network agent's form is its own entirely.
    expect(source).not.toMatch(/FOUNDING_PALETTE|ORIGINATOR_GLYPH_POOL|isValidGlyph/);
  });
});
