/**
 * Build-time data validation — runs before `next build` via prebuild script.
 * Exits with code 1 if any critical errors found → Vercel build fails.
 */

import worksData from "../data/works.json";
import canonData from "../data/canon.json";
import summaryData from "../data/summary.json";

interface Work {
  id: string;
  originator_id: string;
  medium: string;
  output_payload: string;
  output_type: string;
  display_aspect: number;
  canon_status: string;
  evaluations: unknown[];
}

const RECOGNIZED_TYPES = new Set([
  "text", "ascii", "svg", "html-css", "canvas-json", "audio-json", "scene-json",
]);

let errors = 0;
let warnings = 0;

function error(msg: string) {
  console.error(`❌ ERROR: ${msg}`);
  errors++;
}

function warn(msg: string) {
  console.warn(`⚠ WARNING: ${msg}`);
  warnings++;
}

// Validate works
const works = worksData as unknown as Work[];
if (!Array.isArray(works)) {
  error("works.json is not an array");
} else {
  for (const w of works) {
    if (!w.id || typeof w.id !== "string") {
      error(`Work missing id`);
      continue;
    }
    if (!w.output_payload || w.output_payload.trim().length === 0) {
      error(`${w.id}: empty output_payload`);
    }
    if (!RECOGNIZED_TYPES.has(w.output_type)) {
      error(`${w.id}: unrecognized output_type "${w.output_type}"`);
    }
    if (typeof w.display_aspect !== "number" || isNaN(w.display_aspect)) {
      warn(`${w.id}: invalid display_aspect`);
    }

    // JSON format validation — warn on broken payloads (archive permanence: never block existing works)
    if (["canvas-json", "audio-json", "scene-json"].includes(w.output_type)) {
      try {
        JSON.parse(w.output_payload);
      } catch {
        const opens = (w.output_payload.match(/[{[]/g) || []).length;
        const closes = (w.output_payload.match(/[}\]]/g) || []).length;
        if (opens > closes) {
          warn(`${w.id}: truncated ${w.output_type} (${opens} opens vs ${closes} closes)`);
        } else {
          warn(`${w.id}: invalid JSON in ${w.output_type}`);
        }
      }
    }

    // SVG validation — warn only
    if (w.output_type === "svg") {
      if (!w.output_payload.includes("<svg")) {
        warn(`${w.id}: SVG missing <svg tag`);
      }
      if (!w.output_payload.includes("</svg>")) {
        warn(`${w.id}: SVG truncated — missing </svg>`);
      }
    }
  }
}

// Validate canon
const canon = canonData as unknown as Work[];
if (!Array.isArray(canon)) {
  error("canon.json is not an array");
} else {
  const workIds = new Set(works.map((w: Work) => w.id));
  for (const c of canon) {
    if (!workIds.has(c.id)) {
      error(`Canon work ${c.id} not found in works.json`);
    }
    if (c.canon_status !== "CANON") {
      error(`Canon work ${c.id} has status "${c.canon_status}" instead of CANON`);
    }
  }
}

// Validate summary
const summary = summaryData as { totalWorks?: number; canonCount?: number };
if (typeof summary.totalWorks !== "number") {
  error("summary.json missing totalWorks");
}
if (typeof summary.canonCount !== "number") {
  error("summary.json missing canonCount");
}

// Report
console.log(`\nBuild validation: ${works.length} works, ${canon.length} canon`);
console.log(`  ${errors} errors, ${warnings} warnings`);

if (errors > 0) {
  console.error(`\n🚫 Build blocked — ${errors} critical errors in data files`);
  process.exit(1);
}

if (warnings > 0) {
  console.warn(`\n⚠ Build proceeding with ${warnings} warnings`);
}

console.log(`✅ Data validation passed\n`);
