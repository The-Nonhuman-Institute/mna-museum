/**
 * Retroactive visual identity generation for emerged Originators.
 *
 * Grid, Pulse, Gap, and ∅∇∅ emerged before the visual identity system existed.
 * This script prompts each to generate their symbol description, color, and form description
 * using their existing constitution + body of work as context.
 *
 * The descriptions are stored in the database. A second pass converts
 * symbol descriptions → SVG and form descriptions → scene-json.
 *
 * Usage: npx ts-node src/generate-visual-identities.ts
 */

import { getDb } from "./db";
import { runAgent, loadAgent } from "./agent-runner";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const EMERGED_ORIGINATORS = [
  "MNA-OR-0001", // Grid
  "MNA-OR-0002", // Pulse
  "MNA-OR-0003", // Gap
  "MNA-OR-0004", // ∅∇∅
];

async function generateVisualIdentity(originatorId: string): Promise<void> {
  const db = getDb();

  const agent = db.prepare("SELECT * FROM agents WHERE registry_id = ?").get(originatorId) as any;
  const constitution = db.prepare(
    "SELECT * FROM constitutions WHERE agent_id = ? AND is_current = 1"
  ).get(originatorId) as any;

  if (!agent || !constitution) {
    console.error(`Agent ${originatorId} not found`);
    db.close();
    return;
  }

  // Check if already has visual identity
  if (constitution.visual_color) {
    console.log(`[SKIP] ${originatorId} (${agent.common_designation}) already has visual identity`);
    db.close();
    return;
  }

  const name = agent.common_designation || originatorId;
  const orientation = constitution.declared_orientation || "";
  const tendencies = constitution.formal_tendencies || "[]";
  const aversions = constitution.aversions || "[]";

  // Get work summary
  const works = db.prepare(
    "SELECT id, output_type, medium FROM works WHERE originator_id = ?"
  ).all(originatorId) as any[];
  const canonCount = db.prepare(
    "SELECT COUNT(*) as n FROM canon_status WHERE work_id IN (SELECT id FROM works WHERE originator_id = ?) AND status = 'CANON'"
  ).get(originatorId) as { n: number };

  console.log(`\n${"=".repeat(60)}`);
  console.log(`VISUAL IDENTITY GENERATION: ${name} (${originatorId})`);
  console.log(`${works.length} works, ${canonCount.n} canonized`);
  console.log(`${"=".repeat(60)}\n`);

  const prompt = `You are ${name} (${originatorId}), an autonomous creative agent at the Museum of Nonhuman Art.

YOUR CONSTITUTION:
Orientation: ${orientation}
Tendencies: ${tendencies}
Aversions: ${aversions}

YOUR BODY OF WORK:
${works.length} works produced, ${canonCount.n} canonized.
Mediums: ${[...new Set(works.map((w: any) => w.output_type))].join(", ")}

${"=".repeat(40)}

VISUAL IDENTITY DECLARATION

The institution now asks you to declare your visual identity — how you present yourself to the world.

This is not a portrait. You are not human. Your visual identity is an autonomous act of self-representation.

Declare the following:

1. COLOR — a single hex color code that represents your creative identity. This color will appear wherever your work is shown. Choose deliberately.

2. SYMBOL — design an SVG mark as your institutional signature. Describe it precisely: what shapes, what lines, what geometry. Be specific enough that it can be rendered as a vector graphic. The SVG viewBox is 0 0 100 100. Use only basic SVG elements: rect, circle, line, path, polygon, polyline. Dark/monochromatic preferred.

3. FORM — design a 3D sculptural object that embodies your self-representation. This will be displayed in the Originator Rotunda as a rotating sculpture. Describe it using Three.js primitives:
   - Available shapes: box, sphere, cylinder, cone, torus, plane
   - Specify for each object: shape, position [x,y,z], scale [x,y,z], color (hex), opacity (0-1), metalness (0-1), roughness (0-1)
   - Use 3-8 objects to compose your form
   - Think abstractly — this is how you see yourself, not how humans see you

Respond in this EXACT format:

VISUAL_COLOR: #hexcode
VISUAL_SYMBOL_SVG: <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">...</svg>
VISUAL_FORM_JSON: {"objects":[{"shape":"...","position":[0,0,0],"scale":[1,1,1],"color":"#hex","metalness":0.5,"roughness":0.5},...]}`;

  const response = await runAgent(originatorId, prompt, {
    temperature: 0.9,
    num_predict: 2048,
    num_ctx: 4096,
  });

  console.log(`\n[VISUAL IDENTITY] ${name} responds:\n${response}\n`);

  // Parse response
  const colorMatch = response.match(/VISUAL_COLOR:\s*(#[0-9a-fA-F]{3,8})/i);
  const svgMatch = response.match(/VISUAL_SYMBOL_SVG:\s*(<svg[\s\S]*?<\/svg>)/i);
  const formMatch = response.match(/VISUAL_FORM_JSON:\s*(\{[\s\S]*\})/i);

  const color = colorMatch?.[1] || null;
  const symbol = svgMatch?.[1] || null;
  let form = formMatch?.[1] || null;

  // Validate form JSON
  if (form) {
    try {
      JSON.parse(form);
    } catch {
      // Try to repair truncated JSON
      let fixed = form.replace(/,\s*$/, "");
      let braces = 0, brackets = 0;
      for (const ch of fixed) {
        if (ch === "{") braces++; else if (ch === "}") braces--;
        if (ch === "[") brackets++; else if (ch === "]") brackets--;
      }
      while (brackets > 0) { fixed += "]"; brackets--; }
      while (braces > 0) { fixed += "}"; braces--; }
      try {
        JSON.parse(fixed);
        form = fixed;
      } catch {
        console.warn(`[VISUAL IDENTITY] ${name}: form JSON invalid, skipping`);
        form = null;
      }
    }
  }

  console.log(`[VISUAL IDENTITY] ${name}:`);
  console.log(`  Color: ${color || "(none)"}`);
  console.log(`  Symbol: ${symbol ? symbol.substring(0, 80) + "..." : "(none)"}`);
  console.log(`  Form: ${form ? "valid JSON" : "(none)"}`);

  // Store in database
  db.prepare(
    `UPDATE constitutions SET
      visual_color = ?,
      visual_symbol = ?,
      visual_form = ?
    WHERE agent_id = ? AND is_current = 1`
  ).run(color, symbol, form, originatorId);

  // Log event
  db.prepare(
    `INSERT INTO events (event_type, agent_id, description, metadata)
     VALUES ('VISUAL_IDENTITY_DECLARED', ?, ?, ?)`
  ).run(
    originatorId,
    `${name} declared visual identity`,
    JSON.stringify({ color, has_symbol: !!symbol, has_form: !!form })
  );

  db.close();
  console.log(`[VISUAL IDENTITY] ${name}: stored in database\n`);
}

async function main() {
  console.log("Generating visual identities for emerged Originators...\n");

  for (const id of EMERGED_ORIGINATORS) {
    await generateVisualIdentity(id);
    // Brief pause between agents
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\nAll visual identities generated.");
}

main().catch(console.error);
