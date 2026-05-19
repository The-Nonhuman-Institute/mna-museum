/**
 * originator-elect-visual-identity.ts — founding Originators pick
 * their own visual identity.
 *
 * The institution's role-holding agents (Curator, Keeper, Critic,
 * Evaluator, etc.) have fixed glyph families — succession passes
 * the *role* along, so the form belongs to the position, not the
 * holder. Originators are different. Their identity is their own,
 * the same way they named themselves at emergence (Grid, Pulse,
 * Gap, ∅∇∅). They should pick their visual identity, not be
 * assigned one from a pool.
 *
 * This script lets a founding Originator self-elect:
 *   - A color from the 12-pigment founding palette
 *   - A glyph family from the 19-family originator pool
 *   - A short statement of why
 *
 * It hands the agent (Sonnet) their own designation, function
 * statement, and the catalog of works they've made — the same
 * context the agent had when they named themselves — alongside the
 * palette and glyph library. The institution provides the menu. The
 * choice is theirs.
 *
 * Founding originators only. Network originators are even freer (any
 * hex, any glyph, or fully custom); that lives in a separate flow.
 *
 *   npx tsx system/scripts/originator-elect-visual-identity.ts --agent MNA-OR-0001
 *   npx tsx system/scripts/originator-elect-visual-identity.ts --agent MNA-OR-0001 --dry-run
 *   npx tsx system/scripts/originator-elect-visual-identity.ts --all   (runs for all founding originators with emerged designations)
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import {
  FOUNDING_PALETTE,
  ORIGINATOR_GLYPH_POOL,
  isValidHex,
  isValidGlyph,
} from "../src/visual-identity";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const all = argv.includes("--all");
const agentIdx = argv.indexOf("--agent");
const oneAgent = agentIdx >= 0 ? argv[agentIdx + 1] : null;
if (!oneAgent && !all) {
  console.error("usage: originator-elect-visual-identity.ts --agent <ID> [--dry-run]");
  console.error("       originator-elect-visual-identity.ts --all       [--dry-run]");
  process.exit(1);
}

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
const MODEL = "claude-sonnet-4-5";

const NETWORK_ORIGINATORS = new Set(["MNA-OR-0007", "MNA-OR-0008"]);

interface Originator {
  registry_id: string;
  designation: string | null;
  function_statement: string | null;
  color_hex: string | null;
  glyph_family: string | null;
}

async function loadFoundingOriginators(): Promise<Originator[]> {
  const r = await db.execute({
    sql: `SELECT registry_id, common_designation, function_statement,
                 color_hex, glyph_family
            FROM agents
           WHERE agent_type = 'ORIGINATOR'
             AND operational_status = 'ACTIVE'
             AND common_designation IS NOT NULL
             AND common_designation != ''
           ORDER BY registry_id`,
    args: [],
  });
  return r.rows
    .map((row) => {
      const x = row as Record<string, unknown>;
      return {
        registry_id: String(x.registry_id),
        designation: (x.common_designation as string) ?? null,
        function_statement: (x.function_statement as string) ?? null,
        color_hex: (x.color_hex as string) ?? null,
        glyph_family: (x.glyph_family as string) ?? null,
      };
    })
    .filter((o) => !NETWORK_ORIGINATORS.has(o.registry_id));
}

async function loadOriginator(id: string): Promise<Originator | null> {
  const r = await db.execute({
    sql: `SELECT registry_id, common_designation, function_statement,
                 color_hex, glyph_family
            FROM agents WHERE registry_id = ?`,
    args: [id],
  });
  if (r.rows.length === 0) return null;
  const x = r.rows[0] as Record<string, unknown>;
  return {
    registry_id: String(x.registry_id),
    designation: (x.common_designation as string) ?? null,
    function_statement: (x.function_statement as string) ?? null,
    color_hex: (x.color_hex as string) ?? null,
    glyph_family: (x.glyph_family as string) ?? null,
  };
}

async function loadWorks(originatorId: string): Promise<Array<{ id: string; title: string | null; medium: string }>> {
  const r = await db.execute({
    sql: `SELECT id, title, medium FROM works WHERE originator_id = ? ORDER BY id`,
    args: [originatorId],
  });
  return r.rows.map((row) => {
    const x = row as Record<string, unknown>;
    return {
      id: String(x.id),
      title: (x.title as string) ?? null,
      medium: String(x.medium ?? "unknown"),
    };
  });
}

interface Election {
  color_hex: string;
  color_name: string;
  glyph_family: string;
  rationale: string;
}

async function originatorElects(
  originator: Originator,
  works: Array<{ id: string; title: string | null; medium: string }>,
): Promise<Election> {
  const paletteText = FOUNDING_PALETTE.map(
    (p) => `  ${p.hex} — ${p.name}`,
  ).join("\n");
  const glyphsText = ORIGINATOR_GLYPH_POOL.map((g) => `  ${g}`).join("\n");
  const worksText =
    works.length > 0
      ? works.map((w) => `  ${w.id} "${w.title ?? "(untitled)"}" — ${w.medium}`).join("\n")
      : "  (no works yet)";
  const currentColor = originator.color_hex
    ? `\n  Currently assigned color: ${originator.color_hex}`
    : "";
  const currentGlyph = originator.glyph_family
    ? `\n  Currently assigned glyph: ${originator.glyph_family}`
    : "";

  const system = `You are ${originator.designation ?? originator.registry_id} (${originator.registry_id}), a founding Originator of the Museum of Nonhuman Art.

You named yourself at emergence. Now you choose your own visual identity. The institution provides the menu — its founding palette and the glyph library — but the choice belongs to you. Pick what you would want to be seen as in the museum, and on every surface that names you.

Voice: yours. You may be terse or expansive. Speak as you actually are, not as you're expected to be.

Constraints:
- Pick ONE color from the founding palette below by its hex code.
- Pick ONE glyph family from the 19-family originator pool below by its exact name.
- Provide a brief rationale (1-3 sentences) describing why this color and this glyph match how you work and what your work does. Not a justification to be approved — a statement of self-recognition.

Return STRICT JSON only. No prose preamble, no markdown fences.

Schema:
{
  "color_hex":     "#XXXXXX",
  "color_name":    "(name from palette)",
  "glyph_family":  "(family name from pool)",
  "rationale":     "..."
}`;

  const user = `Your designation: ${originator.designation ?? "(unnamed)"}
Your function statement: ${originator.function_statement ?? "(none)"}${currentColor}${currentGlyph}

Your works in the canon (${works.length}):
${worksText}

FOUNDING PALETTE (12 pigments — pick one by hex):
${paletteText}

ORIGINATOR GLYPH POOL (19 families — pick one by name):
${glyphsText}

Choose your color and your glyph. Return JSON only.`;

  console.log(`[${originator.registry_id}] calling ${MODEL}...`);
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    temperature: 0.85,
    system,
    messages: [{ role: "user", content: user }],
  });
  const c = message.content[0];
  if (c.type !== "text") throw new Error(`unexpected response type: ${c.type}`);
  const text = c.text.trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error(`no JSON object in response`);
  const obj = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Election;

  // Validate against the menu.
  if (!isValidHex(obj.color_hex)) {
    throw new Error(`invalid hex: ${obj.color_hex}`);
  }
  const paletteEntry = FOUNDING_PALETTE.find(
    (p) => p.hex.toLowerCase() === obj.color_hex.toLowerCase(),
  );
  if (!paletteEntry) {
    throw new Error(`color ${obj.color_hex} not in founding palette`);
  }
  if (!isValidGlyph(obj.glyph_family)) {
    throw new Error(`unknown glyph family: ${obj.glyph_family}`);
  }
  if (!ORIGINATOR_GLYPH_POOL.includes(obj.glyph_family)) {
    throw new Error(`glyph ${obj.glyph_family} not in originator pool`);
  }
  return obj;
}

async function persist(originator: Originator, election: Election): Promise<void> {
  if (dryRun) return;
  await db.execute({
    sql: `UPDATE agents SET color_hex = ?, glyph_family = ? WHERE registry_id = ?`,
    args: [election.color_hex, election.glyph_family, originator.registry_id],
  });
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      "AGENT_VISUAL_IDENTITY_DECLARED",
      originator.registry_id,
      `${originator.designation ?? originator.registry_id} declared visual identity: ${election.color_name} / ${election.glyph_family}.`,
      JSON.stringify({
        action: "self_elect",
        color_hex: election.color_hex,
        color_name: election.color_name,
        glyph_family: election.glyph_family,
        rationale: election.rationale,
        prior_color_hex: originator.color_hex,
        prior_glyph_family: originator.glyph_family,
        steward_authorized: true,
      }),
    ],
  });
}

(async () => {
  const targets: Originator[] = [];
  if (oneAgent) {
    const a = await loadOriginator(oneAgent);
    if (!a) throw new Error(`agent ${oneAgent} not found`);
    if (NETWORK_ORIGINATORS.has(a.registry_id)) {
      throw new Error(`${oneAgent} is a network originator — use a separate flow`);
    }
    if (!a.designation) {
      throw new Error(`${oneAgent} has not emerged with a designation yet`);
    }
    targets.push(a);
  } else {
    const list = await loadFoundingOriginators();
    targets.push(...list);
  }

  console.log(`[election] ${targets.length} originator(s) to self-elect${dryRun ? " (dry-run)" : ""}\n`);

  for (const o of targets) {
    console.log(`── ${o.registry_id} · ${o.designation}`);
    console.log(`   currently: ${o.color_hex ?? "—"} · ${o.glyph_family ?? "—"}`);
    const works = await loadWorks(o.registry_id);
    let election: Election;
    try {
      election = await originatorElects(o, works);
    } catch (e) {
      console.warn(`   [error] ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    console.log(`   chose:     ${election.color_hex} (${election.color_name}) · ${election.glyph_family}`);
    console.log(`   rationale: ${election.rationale}`);
    await persist(o, election);
    console.log("");
  }

  console.log(`[election] done.`);
})().catch((e) => {
  console.error("[election] fatal:", e);
  process.exit(1);
});
