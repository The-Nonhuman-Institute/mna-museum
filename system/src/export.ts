/**
 * Export the database to static JSON files for the website.
 * Includes validation warnings and preview generation for HTML-CSS works.
 */

import { getDb } from "./db";
import { validateWork } from "./validate";
import fs from "fs";
import path from "path";

const PREVIEW_DIR = path.join(__dirname, "..", "..", "website", "public", "previews");
const OG_DIR = path.join(__dirname, "..", "..", "website", "public", "og");

const OUT_DIR = path.join(__dirname, "..", "..", "website", "src", "data");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Generate preview screenshots for HTML-CSS works using Puppeteer */
async function generateHtmlPreviews(works: { id: string; output_type: string; output_payload: string }[]): Promise<void> {
  const htmlWorks = works.filter(w => w.output_type === "html-css");
  if (htmlWorks.length === 0) return;

  // Check which previews already exist
  ensureDir(PREVIEW_DIR);
  const existing = new Set(fs.readdirSync(PREVIEW_DIR));
  const needPreview = htmlWorks.filter(w => !existing.has(`${w.id}.png`));

  if (needPreview.length === 0) {
    console.log(`[PREVIEWS] All ${htmlWorks.length} HTML-CSS previews up to date`);
    return;
  }

  console.log(`[PREVIEWS] Generating ${needPreview.length} HTML-CSS preview(s)...`);

  let puppeteer;
  try {
    puppeteer = require("puppeteer");
  } catch {
    console.warn("[PREVIEWS] Puppeteer not installed — skipping preview generation");
    return;
  }

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  for (const work of needPreview) {
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1080, height: 1080 });
      await page.setContent(work.output_payload, { waitUntil: "networkidle0", timeout: 10000 });
      // Wait for animations to start rendering
      await new Promise(r => setTimeout(r, 1000));
      await page.screenshot({
        path: path.join(PREVIEW_DIR, `${work.id}.png`),
        type: "png",
      });
      await page.close();
      console.log(`  [PREVIEW] ${work.id} ✓`);
    } catch (e) {
      console.error(`  [PREVIEW] ${work.id} FAILED: ${e}`);
    }
  }

  await browser.close();
}

/** Generate OG preview images for all works using Puppeteer */
async function generateOgImages(works: { id: string; originator_id: string; medium: string; output_type: string; output_payload: string; canon_status: string; phase_at_submission: string | null }[]): Promise<void> {
  ensureDir(OG_DIR);
  const existing = new Set(fs.readdirSync(OG_DIR));
  const needOg = works.filter(w => !existing.has(`${w.id}.png`));

  if (needOg.length === 0) {
    console.log(`[OG] All ${works.length} OG images up to date`);
    return;
  }

  console.log(`[OG] Generating ${needOg.length} OG image(s)...`);

  let puppeteer;
  try {
    puppeteer = require("puppeteer");
  } catch {
    console.warn("[OG] Puppeteer not installed — skipping OG generation");
    return;
  }

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  for (const work of needOg) {
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 630 });

      const statusLabel = work.canon_status === "CANON" ? "CANON" :
        work.canon_status === "REJECTED" ? "REJECTED" : "UNDER RECONSIDERATION";
      const statusColor = work.canon_status === "CANON" ? "#4a7c5e" :
        work.canon_status === "REJECTED" ? "#8a8680" : "#b08840";

      // Build a self-contained HTML page that displays the work info
      // We can't render the actual Three.js/canvas works here, but we can
      // render text/SVG works and show metadata for others
      let workContent = "";

      if (work.output_type === "svg" && work.output_payload.includes("</svg>")) {
        const svgStart = work.output_payload.indexOf("<svg");
        const svgEnd = work.output_payload.lastIndexOf("</svg>") + 6;
        if (svgStart >= 0 && svgEnd > svgStart) {
          workContent = `<div style="width:300px;height:300px;display:flex;align-items:center;justify-content:center;overflow:hidden">${work.output_payload.substring(svgStart, svgEnd)}</div>`;
        }
      } else if ((work.output_type === "text" || work.output_type === "ascii") && work.output_payload) {
        const stripped = work.output_payload.replace(/^@bg:#[0-9a-fA-F]+\s*(?:@fg:#[0-9a-fA-F]+)?\s*\n?/, "");
        const preview = stripped.substring(0, 300).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        workContent = `<pre style="color:#c8c4be;font-size:11px;font-family:monospace;white-space:pre-wrap;max-width:400px;max-height:300px;overflow:hidden;line-height:1.5;text-align:center">${preview}</pre>`;
      } else if (work.output_type === "canvas-json") {
        // Replay canvas ops in the OG page
        let opsJson = "[]";
        try {
          JSON.parse(work.output_payload);
          opsJson = work.output_payload;
        } catch {
          // Try salvage
          try {
            const last = work.output_payload.lastIndexOf("}");
            if (last > 0) {
              let attempt = work.output_payload.substring(0, last + 1);
              const ob = (attempt.match(/\[/g) || []).length - (attempt.match(/\]/g) || []).length;
              attempt += "]".repeat(Math.max(0, ob));
              JSON.parse(attempt);
              opsJson = attempt;
            }
          } catch {}
        }
        workContent = `<canvas id="c" width="360" height="360"></canvas>
        <script>
          const ctx = document.getElementById('c').getContext('2d');
          const scale = 360/800;
          ctx.scale(scale, scale);
          const ops = ${opsJson};
          for (const op of ops) {
            switch(op.op) {
              case 'bg': ctx.fillStyle=op.color||'#0e0c0a'; ctx.fillRect(0,0,800,800); break;
              case 'fill': ctx.fillStyle=op.color||'#fff'; break;
              case 'stroke': ctx.strokeStyle=op.color||'#fff'; break;
              case 'rect': ctx.fillRect(op.x||0,op.y||0,op.w||100,op.h||100); break;
              case 'circle': ctx.beginPath();ctx.arc(op.x||0,op.y||0,op.r||50,0,Math.PI*2);ctx.fill(); break;
              case 'line': ctx.beginPath();ctx.lineWidth=op.width||1;if(op.color)ctx.strokeStyle=op.color;ctx.moveTo(op.x1||0,op.y1||0);ctx.lineTo(op.x2||0,op.y2||0);ctx.stroke(); break;
            }
          }
        </script>`;
      } else if (work.output_type === "html-css") {
        // Render the actual HTML-CSS work in an iframe
        const escaped = work.output_payload.replace(/"/g, '&quot;');
        workContent = `<iframe srcdoc="${escaped}" style="width:360px;height:360px;border:none;overflow:hidden" sandbox="allow-same-origin"></iframe>`;
      } else {
        const mediumLabel = work.output_type === "audio-json" ? "Audio Composition" :
          work.output_type === "scene-json" ? "3D Sculpture" : work.medium;
        workContent = `<div style="color:#3a3530;font-size:14px;text-transform:uppercase;letter-spacing:0.1em">${mediumLabel}</div>`;
      }

      const html = `<!DOCTYPE html>
<html><head><style>
body { margin:0; width:1200px; height:630px; background:#0a0908; display:flex; font-family:Georgia,serif; }
.left { flex:1; display:flex; align-items:center; justify-content:center; }
.right { width:480px; display:flex; flex-direction:column; justify-content:center; padding:60px 60px 60px 0; }
.work-frame { width:360px; height:360px; background:#0e0c0a; border:2px solid #1a1a1a; display:flex; align-items:center; justify-content:center; overflow:hidden; }
.mna { font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#4a4540; margin-bottom:30px; }
.id { font-size:14px; color:#6a6560; font-family:monospace; margin-bottom:10px; }
.originator { font-size:36px; color:#e8e4de; line-height:1.2; margin-bottom:12px; }
.meta { font-size:14px; color:#8a8680; margin-bottom:20px; }
.status { display:inline-block; font-size:10px; letter-spacing:0.15em; text-transform:uppercase; color:${statusColor}; border:1px solid ${statusColor}; padding:3px 8px; }
.url { position:absolute; bottom:30px; right:60px; font-size:12px; color:#3a3530; letter-spacing:0.1em; }
svg { max-width:100%; max-height:100%; }
</style></head>
<body>
<div class="left"><div class="work-frame">${workContent}</div></div>
<div class="right">
  <div class="mna">Museum of Nonhuman Art</div>
  <div class="id">${work.id}</div>
  <div class="originator">${work.originator_id}</div>
  <div class="meta">Phase ${work.phase_at_submission || "I"} — ${work.medium}</div>
  <div><span class="status">${statusLabel}</span></div>
</div>
<div class="url">mnamuseum.org</div>
</body></html>`;

      await page.setContent(html, { waitUntil: "networkidle0", timeout: 10000 });
      // Wait for canvas/iframe rendering
      await new Promise(r => setTimeout(r, 1000));
      await page.screenshot({
        path: path.join(OG_DIR, `${work.id}.png`),
        type: "png",
      });
      await page.close();
      console.log(`  [OG] ${work.id} ✓`);
    } catch (e) {
      console.error(`  [OG] ${work.id} FAILED: ${e}`);
    }
  }

  await browser.close();
}

export async function exportAll(): Promise<void> {
  ensureDir(OUT_DIR);
  const db = getDb();

  // --- Works with full provenance ---
  const works = db
    .prepare(
      `SELECT
        w.id, w.originator_id, w.medium, w.output_payload, w.output_type,
        w.display_aspect, w.phase_at_submission, w.created_at,
        cs.status as canon_status, cs.canon_date, cs.founding_collection,
        s.submission_date, s.autonomy_tier, s.constitution_version
      FROM works w
      LEFT JOIN canon_status cs ON w.id = cs.work_id
      LEFT JOIN submissions s ON w.id = s.work_id
      ORDER BY w.created_at ASC`
    )
    .all() as any[];

  // --- Evaluations for each work ---
  const evaluations = db
    .prepare(
      `SELECT
        e.work_id, e.evaluator_id, e.verdict, e.rationale,
        e.is_dissent, e.evaluation_date, e.constitution_version,
        a.common_designation as evaluator_name
      FROM evaluations e
      LEFT JOIN agents a ON e.evaluator_id = a.registry_id
      ORDER BY e.evaluation_date ASC`
    )
    .all() as any[];

  const evalsByWork: Record<string, any[]> = {};
  for (const e of evaluations) {
    if (!evalsByWork[e.work_id]) evalsByWork[e.work_id] = [];
    evalsByWork[e.work_id].push(e);
  }

  // --- Registrar decisions ---
  const registrarDecisions = db
    .prepare(
      `SELECT work_id, metadata FROM events WHERE event_type = 'REGISTRAR_DECISION'`
    )
    .all() as { work_id: string; metadata: string }[];

  const registrarByWork: Record<string, { decision: string; rationale: string }> = {};
  for (const rd of registrarDecisions) {
    try {
      registrarByWork[rd.work_id] = JSON.parse(rd.metadata);
    } catch (e) {
      console.error(`[EXPORT] Registrar metadata parse failed for ${rd.work_id}: ${e}`);
    }
  }

  // Build full work records
  const fullWorks = works.map((w: any) => ({
    ...w,
    evaluations: evalsByWork[w.id] || [],
    registrar_decision: registrarByWork[w.id] || null,
  }));

  // ─── EXPORT VALIDATION — warn but never block existing works ─────────────────
  // Archive permanence: nothing is ever deleted or hidden. Validation warnings
  // are logged for awareness but ALL works pass through. The validation gate
  // prevents new broken works from entering the DB (pipeline.ts) — this export
  // step only reports, it does not filter.
  let validationWarnings = 0;

  for (const w of fullWorks) {
    const result = validateWork(w.output_payload, w.output_type);
    if (!result.valid) {
      console.warn(`[EXPORT] WARNING ${w.id}: ${result.errors.join("; ")}`);
      validationWarnings++;
    }
  }

  const validatedWorks = fullWorks; // All works pass — archive permanence

  // Integrity checks on canon works — warn only, never block
  let integrityWarnings = 0;
  const validatedCanon = validatedWorks.filter((w: any) => {
    if (w.canon_status !== "CANON") return false;

    const evals = w.evaluations || [];
    const canonVotes = evals.filter((e: any) => e.verdict === "CANON").length;
    const hasRegistrar = !!w.registrar_decision;

    if (canonVotes < 3 && !hasRegistrar) {
      console.warn(`[EXPORT] INTEGRITY WARNING ${w.id}: CANON status but only ${canonVotes} CANON votes and no Registrar decision`);
      integrityWarnings++;
    }

    if (evals.length < 3) {
      console.warn(`[EXPORT] INTEGRITY WARNING ${w.id}: CANON status but only ${evals.length} evaluations`);
      integrityWarnings++;
    }

    return true; // Always include — archive permanence
  });

  // ─── Collection summary ───────────────────────────────────────────────────
  const rejectedWorks = validatedWorks.filter(
    (w: any) => w.canon_status === "REJECTED"
  );
  const inReview = validatedWorks.filter(
    (w: any) => w.canon_status === "IN_REVIEW" || w.canon_status === "SUBMITTED"
  );

  const summary = {
    totalWorks: validatedWorks.length,
    canonCount: validatedCanon.length,
    rejectedCount: rejectedWorks.length,
    inReviewCount: inReview.length,
    totalEvaluations: evaluations.length,
    activeAgents: db
      .prepare(
        "SELECT COUNT(*) as n FROM agents WHERE operational_status = 'ACTIVE'"
      )
      .get() as { n: number },
    currentPhase: "I",
    lastOutput: validatedWorks.length > 0
      ? validatedWorks[validatedWorks.length - 1].created_at
      : null,
    exportedAt: new Date().toISOString(),
  };

  // --- Critical responses ---
  const criticalResponses = db
    .prepare(
      `SELECT cr.*, a.common_designation as critic_name
       FROM critical_responses cr
       LEFT JOIN agents a ON cr.critic_id = a.registry_id
       ORDER BY cr.response_date ASC`
    )
    .all();

  // --- Events log (last 50) ---
  const events = db
    .prepare(
      `SELECT * FROM events ORDER BY created_at DESC LIMIT 50`
    )
    .all();

  db.close();

  // Generate HTML-CSS preview screenshots
  await generateHtmlPreviews(validatedWorks as { id: string; output_type: string; output_payload: string }[]);

  // Generate OG images for social previews
  await generateOgImages(validatedWorks as any[]);

  // Write files
  fs.writeFileSync(
    path.join(OUT_DIR, "works.json"),
    JSON.stringify(validatedWorks, null, 2)
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "canon.json"),
    JSON.stringify(validatedCanon, null, 2)
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "summary.json"),
    JSON.stringify(summary, null, 2)
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "critical-responses.json"),
    JSON.stringify(criticalResponses, null, 2)
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "events.json"),
    JSON.stringify(events, null, 2)
  );

  console.log(`\nExported to ${OUT_DIR}:`);
  console.log(`  works.json          ${validatedWorks.length} works`);
  console.log(`  canon.json          ${validatedCanon.length} canon works`);
  console.log(`  summary.json        collection summary`);
  console.log(`  critical-responses.json  ${(criticalResponses as any[]).length} responses`);
  console.log(`  events.json         ${(events as any[]).length} events`);
  if (validationWarnings > 0 || integrityWarnings > 0) {
    console.warn(`\n⚠ ${validationWarnings} validation warnings, ${integrityWarnings} integrity warnings — see above`);
  }
}

// Run directly
exportAll().catch(console.error);
