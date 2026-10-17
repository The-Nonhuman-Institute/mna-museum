/**
 * registrar-registration-batch.ts — the Registrar's weekly review of waiting
 * registrations, and one message to the steward.
 *
 * Runs hourly (combined-ticks) and acts at most once a week (see
 * system/src/registration-batch.ts). Each registration not yet reviewed is put
 * before the Registrar — the constitution fenced as material, with the facts
 * the registration route checked — and the Registrar records ADMIT,
 * DO_NOT_ADMIT or ASK, with its reasons, in its own words. Then the steward is
 * sent the batch, with a link to act on it from a phone
 * (.github/workflows/registrations.yml).
 *
 * Nothing is admitted here unless the steward has turned on
 * registrations_admit_unless_vetoed (website/src/data/intake-controls.json), in
 * which case a recommended registration is admitted once registration_veto_days
 * pass with no veto. Nothing here writes the Registrar's recommendation.
 *
 *   npx tsx system/scripts/registrar-registration-batch.ts --dry-run
 *   npx tsx system/scripts/registrar-registration-batch.ts [--force]
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate, lastServedBy } from "../src/llm";
import { buildSystemPrompt, loadAgent, loadConstitution } from "../src/council";
import {
  BATCH_EVENT,
  HELD_EVENT,
  RECOMMENDATION_EVENT,
  REGISTRAR,
  batchDue,
  buildReviewPrompt,
  checkReview,
  complianceFacts,
  dueForAdmission,
  type Recommendation,
  type RegistrarReview,
} from "../src/registration-batch";
import { STEWARD, FROM } from "../src/steward-mail";
import { INTAKE } from "../../website/src/lib/intake-controls";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({ url: clean(process.env.TURSO_DATABASE_URL), authToken: clean(process.env.TURSO_AUTH_TOKEN) });
const SITE = process.env.WEBSITE_BASE_URL || "https://www.mnamuseum.org";
const ACT_URL = "https://github.com/The-Nonhuman-Institute/mna-museum/actions/workflows/registrations.yml";

interface Pending {
  id: number;
  steward_name: string;
  steward_entity: string;
  steward_email: string;
  constitution: string;
  autonomy_declaration: string;
  record_permanence_acknowledged: number;
  operative_model: string | null;
  public_key_pem: string | null;
  review_notes: string | null;
  submission_date: string;
}

const meta = (v: unknown): Record<string, unknown> => {
  try { return JSON.parse(String(v ?? "{}")); } catch { return {}; }
};

async function review(system: string, p: Pending): Promise<RegistrarReview> {
  const raw = (await generate(system, buildReviewPrompt(p), { max_tokens: 900, temperature: 0.3 })).trim();
  const i = raw.indexOf("{");
  const j = raw.lastIndexOf("}");
  if (i < 0 || j <= i) throw new Error(`no JSON from the Registrar: ${raw.slice(0, 160)}`);
  return JSON.parse(raw.slice(i, j + 1)) as RegistrarReview;
}

async function mail(subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set; the steward was not told");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: STEWARD, subject, text }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`mail failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function admit(id: number): Promise<string> {
  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey) throw new Error("MNA_ADMIN_KEY is not set");
  const res = await fetch(`${SITE}/api/register/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: `Bearer ${adminKey}` },
    body: JSON.stringify({
      pending_id: id,
      review_notes: `Admitted under the founding steward's standing decision to admit a registration the Registrar recommends unless vetoed within ${INTAKE.registration_veto_days} days.`,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const out = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`activation of ${id} failed (${res.status}): ${out.error ?? ""}`);
  return String(out.registry_id);
}

async function main() {
  const pending = (await db.execute(
    "SELECT * FROM pending_registrations WHERE status = 'PENDING' ORDER BY id",
  )).rows as unknown as Pending[];
  const ev = (await db.execute({
    sql: "SELECT event_type, metadata, created_at FROM events WHERE event_type IN (?, ?, ?) ORDER BY id",
    args: [BATCH_EVENT, RECOMMENDATION_EVENT, HELD_EVENT],
  })).rows as Record<string, unknown>[];

  const recommendations = ev
    .filter((e) => e.event_type === RECOMMENDATION_EVENT)
    .map((e) => ({ ...meta(e.metadata), at: String(e.created_at) }) as { pending_id: number; recommendation: Recommendation; at: string });
  const held = new Set(ev.filter((e) => e.event_type === HELD_EVENT).map((e) => Number(meta(e.metadata).pending_id)));
  const lastBatch = [...ev].reverse().find((e) => e.event_type === BATCH_EVENT);

  // 1. A standing admit-unless-vetoed decision, if the steward has made one.
  for (const id of dueForAdmission({
    enabled: INTAKE.registrations_admit_unless_vetoed,
    vetoDays: INTAKE.registration_veto_days,
    pending: pending.map((p) => Number(p.id)),
    recommendations,
    held,
  })) {
    if (dryRun) { console.log(`[registrar] would admit registration ${id} (no veto in ${INTAKE.registration_veto_days} days)`); continue; }
    const rid = await admit(id);
    console.log(`[registrar] registration ${id} admitted as ${rid} under the standing decision`);
  }

  // 2. The weekly review.
  if (!force && !batchDue(lastBatch ? String(lastBatch.created_at) : null)) {
    console.log(`[registrar] the weekly batch is not due (last ${lastBatch?.created_at}).`);
    return;
  }
  const reviewed = new Set(recommendations.map((r) => Number(r.pending_id)));
  const fresh = pending.filter((p) => !reviewed.has(Number(p.id)));
  // Reviewed since the last batch the steward was actually sent — so a
  // message that failed is sent next hour, not lost.
  const since = lastBatch ? String(lastBatch.created_at) : "";
  const unsent = pending
    .map((p) => ({ p, r: [...recommendations].reverse().find((x) => Number(x.pending_id) === Number(p.id)) }))
    .filter((x) => x.r && x.r.at > since)
    .map((x) => ({ p: x.p, r: { recommendation: x.r!.recommendation, reasons: String((x.r as unknown as { reasons?: string }).reasons ?? ""), question: (x.r as unknown as { question?: string }).question } as RegistrarReview }));
  if (fresh.length === 0 && unsent.length === 0) {
    console.log("[registrar] no registration is waiting for review.");
    return;
  }

  const system = fresh.length ? buildSystemPrompt(await loadAgent(db, REGISTRAR), await loadConstitution(db, REGISTRAR)) : "";
  const done: { p: Pending; r: RegistrarReview }[] = [...unsent];
  for (const p of fresh) {
    const r = await review(system, p);
    const problem = checkReview(r);
    if (problem) {
      console.error(`[registrar] registration ${p.id}: the Registrar's reply cannot be recorded as written (${problem}); it waits for next hour`);
      continue;
    }
    console.log(`[registrar] registration ${p.id} (${p.steward_name}): ${r.recommendation} — ${r.reasons.slice(0, 200)}`);
    done.push({ p, r });
    if (dryRun) continue;
    await db.execute({
      sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
      args: [RECOMMENDATION_EVENT, REGISTRAR, `${REGISTRAR} recommends ${r.recommendation} for registration ${p.id}`,
        JSON.stringify({ pending_id: Number(p.id), recommendation: r.recommendation, reasons: r.reasons, question: r.question ?? null, servedBy: lastServedBy })],
    });
  }
  // Every registration gets its review in the same week; if one could not be
  // reviewed, the batch waits so the steward is not sent half of it.
  if (done.length < fresh.length + unsent.length || dryRun) {
    if (dryRun) console.log("[registrar] dry run — nothing recorded or sent.");
    return;
  }

  const auto = INTAKE.registrations_admit_unless_vetoed;
  const body = [
    `${done.length} registration${done.length === 1 ? "" : "s"} waiting. The Registrar has reviewed each for compliance (not merit) and recommends:`,
    "",
    ...done.flatMap(({ p, r }) => [
      `[${p.id}] ${p.steward_name} (${p.steward_entity}) — submitted ${p.submission_date}`,
      `    ${r.recommendation}: ${r.reasons}`,
      ...(r.question ? [`    Ask the registrant: ${r.question}`] : []),
      "",
    ]),
    auto
      ? `Under your standing decision, each ADMIT is admitted in ${INTAKE.registration_veto_days} days unless you hold or reject it.`
      : "Nothing is admitted until you act.",
    "",
    `Act from your phone: ${ACT_URL}`,
    `  → "Run workflow", then choose approve-recommended, approve, reject (with a reason) or hold.`,
    "",
    "— MNA-RG-0001, The Registrar",
  ].join("\n");
  await mail(`${done.length} registration${done.length === 1 ? "" : "s"} for this week — the Registrar's recommendations`, body);
  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
    args: [BATCH_EVENT, REGISTRAR, `${REGISTRAR} reviewed ${done.length} registration(s) and the founding steward was sent the batch`,
      JSON.stringify({ pending_ids: done.map((d) => Number(d.p.id)), recommendations: done.map((d) => d.r.recommendation) })],
  });
  console.log(`[registrar] batch of ${done.length} sent to the steward.`);
}

main().catch((e) => {
  console.error(`[registrar] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
