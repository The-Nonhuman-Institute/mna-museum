import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * THE MENU IS INFORMATION, NOT PERMISSION
 *
 * Magna and Shade both elected `spiral` on 2026-08-28, neither knowing the
 * other had it, because the menu listed all nineteen families and said nothing
 * about which were in use. The menu now marks what is already carried.
 *
 * The line this file defends is that marking is not reserving. Refusing a glyph
 * because a peer holds it would be the institution overruling an Originator's
 * self-recognition to satisfy a uniqueness constraint — the exact override the
 * election exists to undo, and the reason four of the six chose their forms
 * while two were assigned theirs from a pool.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const source = readFileSync(
  path.join(ROOT, "system/scripts/originator-elect-visual-identity.ts"),
  "utf8",
);

describe("the election menu", () => {
  it("marks what other agents already carry", () => {
    expect(source).toMatch(/currentHolders\(/);
    expect(source).toMatch(/also carried by/);
  });

  it("reads the holders from the registry rather than a written-down list", () => {
    expect(source).toMatch(/FROM agents/);
    // A list of "taken" colours typed into the script would be stale the first
    // time anyone elected anything.
    expect(source).not.toMatch(/const TAKEN|const RESERVED|IN_USE\s*=/);
  });

  it("tells the Originator plainly that nothing is reserved", () => {
    expect(source).toContain("information and not a restriction");
    expect(source).toContain("Nothing here is reserved");
  });

  it("offers the whole palette and the whole pool, marked but never filtered", () => {
    // The menu must still be twelve pigments and nineteen families. Filtering
    // held entries out would turn a note into a veto without anyone deciding to.
    expect(source).toMatch(/FOUNDING_PALETTE\.map\(/);
    expect(source).toMatch(/ORIGINATOR_GLYPH_POOL\.map\(/);
    expect(source).not.toMatch(/FOUNDING_PALETTE\s*\.\s*filter/);
    expect(source).not.toMatch(/ORIGINATOR_GLYPH_POOL\s*\.\s*filter/);
  });

  it("does not reject an election for colliding with an existing form", () => {
    // Validation may reject a hex that is not in the palette. It may never
    // reject one because someone else chose it first.
    const validation = source.slice(source.indexOf("// Validate against the menu."));
    expect(validation).not.toMatch(/already (carried|taken|held|in use)/i);
  });

  it("says where a carried form came from, so keeping it is a real answer", () => {
    // An Originator that was assigned a form never made a choice. Without this
    // the only legible answer is to change something.
    expect(source).toContain("assigned administratively");
    expect(source).toMatch(/as complete an answer as/);
  });
});
