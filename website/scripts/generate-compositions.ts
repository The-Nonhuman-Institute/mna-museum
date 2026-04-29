/**
 * generate-compositions.ts
 *
 * Generates the MNAComposition raster asset library by calling the free
 * Pollinations.ai FLUX endpoint. No API key required. Saves PNGs to
 * `public/compositions/{theme}/{nnn}.png` and writes a manifest at
 * `public/compositions/manifest.json` that MNAComposition reads at render
 * time to pick a deterministic asset per (theme, seed).
 *
 * Usage:
 *   cd website
 *   npx tsx scripts/generate-compositions.ts
 *   # or with options:
 *   npx tsx scripts/generate-compositions.ts --per-theme=12 --themes=fragmentation,absence
 *
 * The script is resumable — if a target file already exists it skips it.
 * Re-run to fill in failed/missing slots.
 */

import { mkdir, writeFile, readFile, access, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/* ─── Theme prompts ────────────────────────────────────────────────────── */

interface ThemeConfig {
  prompt: string;
  width: number;
  height: number;
  /* Optional per-variant prompt fragments — appended to the base prompt for
     style diversity within the same theme. */
  variantHints?: string[];
}

const THEMES: Record<string, ThemeConfig> = {
  fragmentation: {
    prompt:
      "Vertical fine-art composition on warm cream paper. A dense column of horizontal black ink brushstrokes stacked tightly down the center, varying widths and opacities, with grungy hand-printed letterpress texture, ink bleed, small spatters, occasional thin gaps revealing the paper. The dense column suggests a hidden vertical figure beneath. Heavy negative space on the left and right sides. Editorial fine-art poster, hand-printed quality, 18th-century scientific-engraving meets contemporary ink-print aesthetic. Black ink on warm cream paper, no color other than ink and paper, absolutely no text, no letters, no numbers, no figures, no people.",
    width: 768,
    height: 1152,
    variantHints: [
      "denser central column, sharper bands",
      "more diffuse, ink wash bleeding edges",
      "tighter rhythm, smaller bands",
      "looser rhythm, larger gaps",
      "subtle vertical figure barely visible through breaks",
      "with hairline registration marks running across",
    ],
  },
  absence: {
    prompt:
      "Architectural photography, photorealistic 3D render of a minimalist quiet stone room with a tall pointed arch ceiling. A single small black rectangular doorway is set into the back wall — the only opening in the entire space. Soft warm natural daylight enters from the upper left, casting a long soft diagonal shadow across the smooth stone floor. Aged plaster wall texture, subtle imperfections. Empty, ceremonial, monastic. Beige-cream and ink-black palette only. Architectural photography composition. No people, no objects, no furniture, no text, no signage, no figures.",
    width: 960,
    height: 1152,
    variantHints: [
      "wider arch, taller ceiling",
      "narrower pointed arch",
      "rounded Roman arch instead of pointed",
      "doorway centered low",
      "doorway slightly off-center",
      "stronger raking light from the left",
      "soft frontal light, minimal shadow",
    ],
  },
  structure: {
    prompt:
      "Constructivist fine-art composition on warm cream paper. An asymmetric grid of irregular rectangular cells defined by thick crisp black ink lines, with subtle thinner inner registration lines. One or two cells are filled solid black, with a smaller white rectangular outline drawn inside the black field. Slight ink bleed at line crossings, faint paper grain, hand-printed letterpress quality. Bauhaus and De Stijl meets 1920s Russian Constructivist poster. Black ink on warm cream paper, square format, no color other than ink and paper, absolutely no text, no letters, no numbers, no figures, no people.",
    width: 1024,
    height: 1024,
    variantHints: [
      "more cells, finer grid",
      "fewer larger cells, bolder rhythm",
      "two filled solid cells",
      "one large filled cell with inner outline",
      "vertical rhythm dominant",
      "horizontal rhythm dominant",
      "with offset doubled lines suggesting depth",
    ],
  },
  interruption: {
    prompt:
      "Photorealistic architectural photography, dramatic chiaroscuro. A single vertical narrow beam of bright cream-white light piercing a vast dark space from the unseen ceiling all the way down to a textured polished concrete floor, casting a soft circular glow at the floor reflection. Atmospheric particulate haze in the beam, warm ambient grading, deep ink-black void surrounding everything else. Vertical poster orientation, fine-art editorial composition. No people, no objects, no figures, no text, no signage.",
    width: 768,
    height: 1152,
    variantHints: [
      "thinner beam, brighter",
      "wider beam, softer",
      "beam slightly off-center to the left",
      "beam slightly off-center to the right",
      "more atmospheric haze, denser fog",
      "cleaner beam, less haze",
      "stronger floor reflection",
    ],
  },
};

/* ─── CLI args ─────────────────────────────────────────────────────────── */

function parseArgs() {
  const args: Record<string, string> = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return {
    perTheme: parseInt(args["per-theme"] ?? "12", 10),
    themes: (args["themes"]?.split(",") ?? Object.keys(THEMES)) as string[],
    model: args["model"] ?? "flux",
    delayMs: parseInt(args["delay-ms"] ?? "1500", 10),
  };
}

/* ─── Pollinations call ────────────────────────────────────────────────── */

async function generate(
  theme: string,
  cfg: ThemeConfig,
  variantIdx: number,
  seedNum: number,
  model: string
): Promise<Buffer> {
  const hint = cfg.variantHints?.[variantIdx % cfg.variantHints.length];
  const fullPrompt = hint ? `${cfg.prompt} ${hint}.` : cfg.prompt;
  const url = new URL(
    `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}`
  );
  url.searchParams.set("width", String(cfg.width));
  url.searchParams.set("height", String(cfg.height));
  url.searchParams.set("seed", String(seedNum));
  url.searchParams.set("model", model);
  url.searchParams.set("nologo", "true");
  url.searchParams.set("enhance", "true");

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    throw new Error(`Pollinations ${res.status}: ${await res.text().catch(() => "<no body>")}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

/* ─── Main ─────────────────────────────────────────────────────────────── */

async function main() {
  const args = parseArgs();
  const repoRoot = path.resolve(__dirname, "..");
  const outRoot = path.join(repoRoot, "public", "compositions");

  const summary: Record<string, string[]> = {};

  for (const theme of args.themes) {
    const cfg = THEMES[theme];
    if (!cfg) {
      console.warn(`! Unknown theme: ${theme}, skipping`);
      continue;
    }
    const themeDir = path.join(outRoot, theme);
    await mkdir(themeDir, { recursive: true });
    summary[theme] = [];

    console.log(`\n── ${theme} ──`);
    for (let i = 0; i < args.perTheme; i++) {
      const fileNum = String(i + 1).padStart(3, "0");
      const filePath = path.join(themeDir, `${fileNum}.png`);
      const relPath = `/compositions/${theme}/${fileNum}.png`;

      if (existsSync(filePath)) {
        console.log(`  [skip] ${relPath} (exists)`);
        summary[theme].push(relPath);
        continue;
      }

      /* Use a stable seed so re-running produces the same asset for the same
         (theme, slot). This lets us keep good outputs and only re-generate
         the ones we delete. */
      const seedNum = hashStr(`${theme}::${fileNum}`) % 0xffffffff;
      try {
        process.stdout.write(`  [gen]  ${relPath} ... `);
        const buf = await generate(theme, cfg, i, seedNum, args.model);
        await writeFile(filePath, buf);
        const kb = (buf.byteLength / 1024).toFixed(1);
        console.log(`ok (${kb} KB)`);
        summary[theme].push(relPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`FAIL — ${msg}`);
      }
      /* Pollinations is free but rate-limits; brief pause between calls. */
      if (args.delayMs > 0) await new Promise((r) => setTimeout(r, args.delayMs));
    }
  }

  /* Re-scan the directory in case some assets exist from prior runs that
     weren't generated this session. The manifest reflects ground truth. */
  const manifest: Record<string, string[]> = {};
  for (const theme of Object.keys(THEMES)) {
    const themeDir = path.join(outRoot, theme);
    if (!existsSync(themeDir)) {
      manifest[theme] = [];
      continue;
    }
    const files = (await readdir(themeDir))
      .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .sort();
    manifest[theme] = files.map((f) => `/compositions/${theme}/${f}`);
  }

  const json = JSON.stringify(
    { generatedAt: new Date().toISOString(), themes: manifest },
    null,
    2
  );
  const publicManifest = path.join(outRoot, "manifest.json");
  const srcManifest = path.join(repoRoot, "src", "lib", "composition-manifest.json");
  await mkdir(path.dirname(srcManifest), { recursive: true });
  await writeFile(publicManifest, json);
  await writeFile(srcManifest, json);

  console.log("\n── manifest ──");
  for (const [theme, files] of Object.entries(manifest)) {
    console.log(`  ${theme.padEnd(14)}  ${files.length} files`);
  }
  console.log(`\nWrote ${publicManifest}`);
  console.log(`Wrote ${srcManifest}`);
}

/* FNV-1a hash, same one MNAGlyph uses, so seed alignment stays trivial. */
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
