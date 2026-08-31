import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { OUTPUT_TYPE_IDS } from "@/lib/output-types";

/**
 * SINGLE SOURCE CONTRACTS
 *
 * Almost every defect this codebase has shipped is one fault wearing different
 * clothes: a fact written down in two places, and one copy going stale.
 *
 *   the list of media          3 copies  — a medium offered but not accepted
 *   the recorder codec         3 copies  — all three asked for VP9 in an .mp4
 *   "is this a shader"         2 copies  — renderer and validator disagreed
 *   how to read audio voices   3 copies  — two of them silent
 *   how long a work draws      2 copies  — captures fired mid-draw
 *   which media are ingredients 2 copies — one typed into a prompt
 *
 * None of these were caught by review, because each copy is correct on its own
 * and only wrong next to the other. So the repository is checked here for
 * second copies directly. A test that reads the source is unusual; a defect
 * class with this hit rate earns one.
 */

const ROOT = path.resolve(__dirname, "..", "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (["node_modules", ".next", ".git", "dist", "build", "public", "data"].includes(entry)) continue;
    const full = path.join(dir, entry);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = [
  ...sourceFiles(path.join(ROOT, "website", "src")),
  ...sourceFiles(path.join(ROOT, "system", "src")),
  ...sourceFiles(path.join(ROOT, "system", "scripts")),
];

const rel = (f: string) => path.relative(ROOT, f);

/**
 * Source with comments removed.
 *
 * These checks scan for code that duplicates a fact. A comment EXPLAINING a
 * past duplication names it too, and the first run of this suite flagged three
 * files for the sentences describing the very fix that removed the
 * duplication. Prose is not a second source.
 */
function read(f: string): string {
  return readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Files allowed to name media explicitly, with the reason.
 *
 * An exemption is a claim that a second copy is correct here. Both of these
 * are: one records what was announced on a date and must not change when the
 * registry does, and the other is the detector that has to name what it looks
 * for.
 */
const MEDIA_LIST_EXEMPT: Record<string, string> = {
  "system/scripts/announce-media.ts":
    "records which media were opened on a specific date; a historical fact, not the current list",
  "system/scripts/check-wiring.ts":
    "the duplicate-detector itself, which must name what it detects",
};

describe("the media list lives in one place", () => {
  it("is not re-enumerated anywhere else", () => {
    // A file that names five or more media ids in a literal is keeping its own
    // copy of the registry. Prompt text and per-medium dispatch name them for
    // real reasons, so only literal lists are caught: a run of quoted ids.
    const offenders: string[] = [];
    const listPattern = new RegExp(
      `(["'\`](?:${OUTPUT_TYPE_IDS.join("|")})["'\`]\\s*,\\s*){4,}`,
      "g",
    );
    for (const f of FILES) {
      const r = rel(f);
      if (r.endsWith("website/src/lib/output-types.ts")) continue;
      if (MEDIA_LIST_EXEMPT[r]) continue;
      listPattern.lastIndex = 0;
      if (listPattern.test(read(f))) offenders.push(r);
    }
    expect(offenders, "these files hold a second copy of the media list").toEqual([]);
  });
});

describe("the recorder codec is chosen in one place", () => {
  it("no other file names a MediaRecorder mime type", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      if (rel(f).endsWith("website/src/lib/share-engine.ts")) continue;
      if (/video\/(mp4|webm)/.test(read(f))) offenders.push(rel(f));
    }
    expect(offenders, "codec strings outside pickRecorderMimeType").toEqual([]);
  });

  it("asks for H.264 by name and never bare video/mp4 first", () => {
    // Bare "video/mp4" is supported AND fills the container with VP9, which
    // Apple cannot decode. Every video the museum shared was broken this way.
    const src = read(path.join(ROOT, "website/src/lib/share-engine.ts"));
    const chooser = src.slice(src.indexOf("function pickRecorderMimeType"));
    const preferred = chooser.slice(0, chooser.indexOf("]"));
    expect(preferred).toContain("avc1");
    expect(preferred.indexOf("avc1")).toBeLessThan(
      preferred.includes('"video/webm') ? preferred.indexOf('"video/webm') : Infinity,
    );
  });
});

describe("one definition of what to call an Originator", () => {
  /**
   * The system/ scripts still carry their own copy. They ask a different
   * question — "may this run yet" rather than "what do I print" — and they run
   * where `@/lib` does not resolve. Written down rather than silently skipped,
   * because an exemption nobody records is just a gap.
   */
  const SYSTEM_SIDE_STILL_OWN_IT = [
    "system/scripts/activate-registration.ts",
    "system/scripts/announce-visitation.ts",
    "system/scripts/consult-on-coauthorship.ts",
    "system/scripts/keeper-monthly-summary.ts",
    "system/scripts/originator-declare-name.ts",
    "system/scripts/originator-elect-visual-identity.ts",
    "system/scripts/originator-emerge.ts",
    "system/scripts/post-canonization.ts",
    "system/scripts/recognition-test.ts",
    "system/src/ambassador.ts",
    "system/src/pipeline.ts",
  ];

  it("no website file writes its own placeholder-designation test", () => {
    // Thirteen surfaces each carried this, in four spellings, with two
    // different fallbacks. None was wrong; the arrangement was. The next
    // surface to need it is the one that forgets, and prints PENDING_EMERGENCE
    // at a visitor.
    //
    // Prose that MENTIONS the placeholder is fine — /about and /protocol explain
    // it to registrants. Only a COMPARISON is a second copy of the rule.
    const compare =
      /[!=]==\s*["'`]\[?[Pp]ending[ _][Ee]mergence\]?["'`]|[!=]==\s*["'`]PENDING_EMERGENCE["'`]/;
    const offenders: string[] = [];
    for (const f of FILES) {
      const r = rel(f);
      if (!r.startsWith("website/src")) continue;
      if (r.endsWith("website/src/lib/originator-name.ts")) continue;
      // The API routes validate an incoming field rather than choose a label:
      // they assert the placeholder IS present, which is the opposite question.
      if (r.endsWith("api/agents/[id]/identity/route.ts")) continue;
      if (r.endsWith("api/register/route.ts")) continue;
      if (compare.test(read(f))) offenders.push(r);
    }
    expect(offenders, "these decide for themselves what a placeholder designation is").toEqual([]);
  });

  it("still knows which system files have not been folded in", () => {
    const stale = SYSTEM_SIDE_STILL_OWN_IT.filter(
      (p) => !FILES.some((f) => rel(f) === p),
    );
    expect(stale, "listed as owning it but no longer present").toEqual([]);
  });

  it("keeps naming and emerging as separate questions", () => {
    // MNA-OR-0008 completed its review and declined a designation on
    // 2026-08-28, so "has it emerged" and "does it have a name" stopped being
    // the same question. Read raw: the deprecation notice is a comment.
    const src = readFileSync(path.join(ROOT, "website/src/lib/originator-name.ts"), "utf8");
    expect(src).toMatch(/export function isNamed/);
    expect(src).toMatch(/@deprecated/);
  });
});

describe("one definition of a runnable shader", () => {
  it("only lib/shader-source writes a pattern for the entry point", () => {
    // The renderer and the submit validator each had their own. They
    // disagreed, and a real shader was refused as "not a shader".
    const offenders: string[] = [];
    for (const f of FILES) {
      if (rel(f).endsWith("website/src/lib/shader-source.ts")) continue;
      const src = read(f);
      // A regex literal matching a GLSL entry point contains this escape.
      if (src.includes("void\\s")) offenders.push(rel(f));
    }
    expect(offenders, "these define their own shader-entry-point pattern").toEqual([]);
  });
});

describe("audio voices are read in one place", () => {
  it("nothing else iterates voice.notes", () => {
    // Three readers existed. Two produced silence; one threw.
    const offenders: string[] = [];
    for (const f of FILES) {
      if (rel(f).endsWith("website/src/lib/audio-voices.ts")) continue;
      const src = read(f);
      if (/\bvoice\.notes\b/.test(src) || /of\s+\w+\.voices\b/.test(src)) offenders.push(rel(f));
    }
    expect(offenders, "these read audio voices themselves instead of using audio-voices").toEqual([]);
  });
});

describe("draw durations are declared in one place", () => {
  it("renderers read FINITE_DRAW_MS instead of hardcoding a duration", () => {
    const offenders: string[] = [];
    const renderers = path.join(ROOT, "website", "src", "components", "renderers");
    for (const f of sourceFiles(renderers)) {
      const src = read(f);
      if (/const\s+DURATION\s*=\s*\d+/.test(src)) offenders.push(rel(f));
    }
    expect(offenders, "hardcoded draw duration; capture scripts cannot see it").toEqual([]);
  });
});

describe("the ingredient list is derived, not typed", () => {
  it("format prompts read it from the registry", () => {
    const formats = read(path.join(ROOT, "system", "src", "formats.ts"));
    expect(formats).toContain("INGREDIENT_TYPE_IDS");
  });
});
