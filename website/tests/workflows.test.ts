import { readdirSync, readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * Every workflow file must parse, and mean what it says.
 *
 * A workflow with invalid YAML does not fail loudly. GitHub records a run named
 * after the file rather than its `name:`, marks it failed, and refuses to
 * register its triggers — so `workflow_dispatch` silently does not exist and a
 * scheduled job silently never runs. The operations round shipped that way: a
 * multi-line commit message inside a `run: |` block began at column one, which
 * ends the block scalar, and the crew meant to watch the institution was itself
 * unrunnable.
 *
 * Nothing in CI could have caught it, because CI does not read the files that
 * define CI. This does.
 */

const DIR = path.resolve(__dirname, "..", "..", ".github", "workflows");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

describe("the workflows", () => {
  it("exist", () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it("all parse as YAML", () => {
    const broken: string[] = [];
    for (const f of FILES) {
      try {
        parse(readFileSync(path.join(DIR, f), "utf8"));
      } catch (e) {
        broken.push(`${f}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
      }
    }
    expect(broken, "these workflows will not run at all").toEqual([]);
  });

  it("each declare a name and at least one trigger", () => {
    const wrong: string[] = [];
    for (const f of FILES) {
      const doc = parse(readFileSync(path.join(DIR, f), "utf8")) as Record<string, unknown>;
      if (!doc || typeof doc !== "object") { wrong.push(`${f}: empty`); continue; }
      if (typeof doc.name !== "string" || !doc.name.trim()) wrong.push(`${f}: no name`);
      // YAML reads a bare `on:` key as the boolean true.
      const triggers = (doc.on ?? doc[true as unknown as string]) as Record<string, unknown> | undefined;
      if (!triggers || Object.keys(triggers).length === 0) wrong.push(`${f}: no trigger`);
    }
    expect(wrong).toEqual([]);
  });

  it("give every scheduled workflow a dispatch trigger too", () => {
    // A scheduled job that cannot be run by hand cannot be tested, and cannot
    // be used in an emergency.
    const wrong: string[] = [];
    for (const f of FILES) {
      const doc = parse(readFileSync(path.join(DIR, f), "utf8")) as Record<string, unknown>;
      const triggers = (doc?.on ?? doc?.[true as unknown as string]) as Record<string, unknown> | undefined;
      if (!triggers) continue;
      if ("schedule" in triggers && !("workflow_dispatch" in triggers)) {
        wrong.push(`${f}: scheduled but cannot be dispatched by hand`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("keeps the deploy path filter readable, because the round reads it", () => {
    // ops-round's D1 decides whether the site is behind by finding the newest
    // commit touching a deploy-relevant path, parsed out of this file. It
    // compared against master's tip before, and reported the site as behind
    // after every tooling commit — which in a live round would have dispatched
    // a pointless deploy every three hours forever.
    const src = readFileSync(path.join(DIR, "deploy-website.yml"), "utf8");
    const block = src.slice(src.indexOf("paths:"), src.indexOf("workflow_dispatch:"));
    const globs = [...block.matchAll(/^\s*-\s*"([^"]+)"/gm)].map((m) => m[1]);
    expect(globs.length, "no quoted path globs — ops-round D1 cannot read this").toBeGreaterThan(0);
    expect(globs).toContain("website/**");
  });

  it("let any workflow that commits also push and deploy", () => {
    // A push made with GITHUB_TOKEN does not trigger other workflows, so a
    // workflow that commits must dispatch the deploy itself — and needs
    // actions: write to do it. This left the site four weeks stale once.
    const wrong: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(path.join(DIR, f), "utf8");
      const doc = parse(src) as Record<string, unknown>;
      // Comments explain what a workflow does NOT do as often as what it does;
      // deploy-website describes `git push` in its header and never runs one.
      const code = src.replace(/^\s*#.*$/gm, "");
      const commits = /\bgit\s+push\b/.test(code);
      if (!commits) continue;
      const perms = doc?.permissions as Record<string, string> | undefined;
      if (perms?.contents !== "write") wrong.push(`${f}: pushes without contents: write`);
      if (/workflow\s+run/.test(code) && perms?.actions !== "write") {
        wrong.push(`${f}: dispatches a workflow without actions: write`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
