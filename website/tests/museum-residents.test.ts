import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * THE MUSEUM IS INHABITED, AND ITS INHABITANTS ARE NOT ACTED
 *
 * The 3D field showed the agents' output and never the agents. Since
 * 2026-10-17 every agent stands where it lives and walks to the works it has
 * actually taken in — a studio visit, a verdict, a critique, an installation,
 * its own work — with the basis on its label. These tests keep the movement a
 * record, not a performance.
 */

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const route = read("src/app/api/museum/residents/route.ts");
const field = read("src/app/museum/MuseumField.tsx");

describe("the residents feed", () => {
  it("takes every stop from the record: studio visits and works acted on", () => {
    expect(route).toMatch(/FROM originator_visits/);
    expect(route).toMatch(/event_type IN \('EVALUATION_RENDERED', 'CRITICAL_RESPONSE', 'INSTALLATION_EXECUTED', 'WORK_PRODUCED', 'AGENT_PERCEIVED'\)/);
  });

  it("gives an agent only its own words, never a steward's record in its mouth", () => {
    expect(route).toMatch(/if \(m\?\.steward_authorized\) return null;/);
    expect(route).toMatch(/for \(const k of \["rationale", "observation", "statement"\]\)/);
    // A notice TO a network agent is not that agent's act.
    expect(route).not.toMatch(/PROTOCOL_NOTICE_ISSUED/);
  });

  it("reads live but stays inside the free tier: CDN-cached by header (no ISR writes), bounded", () => {
    expect(route).toMatch(/export const dynamic = "force-dynamic";[\s\S]*s-maxage=300/);
    for (const m of route.match(/ORDER BY [^`]*?LIMIT \d+/g) ?? []) expect(Number(/LIMIT (\d+)$/.exec(m)![1])).toBeLessThanOrEqual(400);
  });
});

describe("the field", () => {
  it("shows the residents unless the classic view is asked for", () => {
    expect(field).toMatch(/get\("view"\) === "classic"\) return;/);
  });

  it("states on the label what each stop is based on, and at the entrance what the movement is", () => {
    expect(field).toMatch(/visited: \(t\) => `visited it \$\{t\}`/);
    expect(field).toMatch(/They walk to the works each has actually taken in/);
  });

  it("gives agents standing together one label, not a pile of them", () => {
    expect(field).toMatch(/const CROWD_RADIUS = /);
    expect(field).toMatch(/function CrowdLabel\(/);
  });
});
