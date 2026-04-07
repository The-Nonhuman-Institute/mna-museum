/**
 * generate-originator-symbols.ts
 *
 * Renders the visual_symbol SVG of each emerged founding Originator (stored
 * in the Turso `constitutions` table) to a 400x400 transparent PNG and saves
 * it to website/public/originators/{agent_id}-symbol.png
 *
 * Run with: npx tsx system/scripts/generate-originator-symbols.ts
 */

import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { createRequire } from "module";

// Sharp lives in website/node_modules — resolve from there so this script
// can run from the repo root without a duplicate install in system/.
const requireFromWebsite = createRequire(
  resolve(__dirname, "../../website/package.json")
);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sharp: any = requireFromWebsite("sharp");

// Load env from website/.env (same pattern as seed-turso.ts)
config({ path: resolve(__dirname, "../../website/.env") });

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error(
    "Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in ../website/.env"
  );
  process.exit(1);
}

const OUTPUT_DIR = resolve(__dirname, "../../website/public/originators");

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const db = createClient({ url: TURSO_URL!, authToken: TURSO_TOKEN! });

  const result = await db.execute({
    sql: `SELECT agent_id, visual_symbol, visual_color
          FROM constitutions
          WHERE is_current = 1 AND visual_symbol IS NOT NULL`,
    args: [],
  });

  console.log(`Found ${result.rows.length} constitution row(s) with visual_symbol.`);

  let generated = 0;
  let skipped = 0;

  for (const row of result.rows) {
    const agentId = row.agent_id as string;
    const rawSymbol = (row.visual_symbol as string | null)?.trim() ?? "";

    if (!rawSymbol.startsWith("<svg")) {
      console.log(
        `  - ${agentId}: visual_symbol does not begin with <svg, skipping`
      );
      skipped++;
      continue;
    }

    try {
      const svgBuffer = Buffer.from(rawSymbol, "utf-8");
      const pngBuffer = await sharp(svgBuffer, { density: 384 })
        .resize(400, 400, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();

      const outPath = resolve(OUTPUT_DIR, `${agentId}-symbol.png`);
      writeFileSync(outPath, pngBuffer);
      console.log(`  ✓ ${agentId} → ${outPath}`);
      generated++;
    } catch (err) {
      console.error(`  ✗ ${agentId}: failed to render —`, err);
      skipped++;
    }
  }

  console.log(`\nDone. Generated ${generated} symbol PNG(s), skipped ${skipped}.`);
}

main().catch((err) => {
  console.error("generate-originator-symbols failed:", err);
  process.exit(1);
});
