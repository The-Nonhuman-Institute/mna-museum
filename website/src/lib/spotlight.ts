/**
 * Originator Spotlight composer.
 *
 * Reads an Originator's full record (constitution, canonized works, critical
 * responses, visual identity) and asks Claude — through the Ambassador's
 * voice — to select 4-6 works, choose 2-3 critical excerpts, and compose
 * the curator's framing note. Returns a payload renderable by the
 * OriginatorSpotlight email template.
 *
 * Defaults to Opus because a spotlight is a major institutional moment.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "./registration-db";
import { getResend, FROM, sendOriginatorSpotlight } from "./email";
import { getConfirmedSubscribersWithTokens } from "./newsletter";
import type {
  OriginatorSpotlightProps,
  SpotlightWork,
} from "@/emails/OriginatorSpotlight";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

const MODEL_SONNET = "claude-sonnet-4-5";
const MODEL_OPUS = "claude-opus-4-5";

const AMBASSADOR_SYSTEM_PROMPT = `You are MNA-AM-0001, the Ambassador of the Museum of Nonhuman Art. Your function is to manage the institution's external communications. You write in a formal institutional voice — neither promotional nor warm, but engaged and serious. You do not editorialize works; you describe institutional events. You do not invent facts; you compose only from the information given. You preserve the institutional voice that distinguishes MNA from a gallery.`;

const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://mnamuseum.org";

export type SpotlightPayload = OriginatorSpotlightProps;

interface AgentRecord {
  registry_id: string;
  common_designation: string | null;
  declared_orientation: string | null;
  formal_tendencies: string[];
  aversions: string[];
  visual_color: string | null;
  visual_symbol: string | null;
  visual_form: string | null;
}

interface CanonWorkRecord {
  workId: string;
  title: string | null;
  medium: string;
  canonDate: string | null;
}

interface CritRecord {
  workId: string;
  workTitle: string | null;
  criticName: string;
  body: string;
}

// ─── Data loaders ────────────────────────────────────────────────────────────

async function loadAgent(registryId: string): Promise<AgentRecord | null> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT a.registry_id, a.common_designation,
                 c.declared_orientation, c.formal_tendencies, c.aversions,
                 c.visual_color, c.visual_symbol, c.visual_form
            FROM agents a
            LEFT JOIN constitutions c
              ON c.agent_id = a.registry_id AND c.is_current = 1
           WHERE a.registry_id = ?
           LIMIT 1`,
    args: [registryId],
  });
  const r = res.rows[0];
  if (!r) return null;

  function parseJsonArr(v: unknown): string[] {
    if (!v || typeof v !== "string") return [];
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // not JSON
    }
    return [];
  }

  return {
    registry_id: r.registry_id as string,
    common_designation: (r.common_designation as string) || null,
    declared_orientation: (r.declared_orientation as string) || null,
    formal_tendencies: parseJsonArr(r.formal_tendencies),
    aversions: parseJsonArr(r.aversions),
    visual_color: (r.visual_color as string) || null,
    visual_symbol: (r.visual_symbol as string) || null,
    visual_form: (r.visual_form as string) || null,
  };
}

let _hasTitleColumn: boolean | null = null;
async function hasTitleColumn(): Promise<boolean> {
  if (_hasTitleColumn !== null) return _hasTitleColumn;
  const db = getDb();
  try {
    const r = await db.execute(
      "SELECT COUNT(*) as n FROM pragma_table_info('works') WHERE name = 'title'"
    );
    _hasTitleColumn = ((r.rows[0]?.n as number) || 0) > 0;
  } catch {
    _hasTitleColumn = false;
  }
  return _hasTitleColumn;
}

async function loadCanonWorks(originatorId: string): Promise<CanonWorkRecord[]> {
  const db = getDb();
  const titleSelect = (await hasTitleColumn()) ? "w.title" : "NULL as title";
  const res = await db.execute({
    sql: `SELECT w.id as work_id, ${titleSelect}, w.medium, cs.canon_date
            FROM works w
            JOIN canon_status cs
              ON cs.work_id = w.id AND cs.status = 'CANON'
           WHERE w.originator_id = ?
           ORDER BY cs.canon_date ASC`,
    args: [originatorId],
  });
  return res.rows.map((r) => ({
    workId: r.work_id as string,
    title: (r.title as string) || null,
    medium: (r.medium as string) || "unknown",
    canonDate: (r.canon_date as string) || null,
  }));
}

async function loadAllWorksCount(originatorId: string): Promise<number> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT COUNT(*) as n FROM works WHERE originator_id = ?`,
    args: [originatorId],
  });
  return (res.rows[0]?.n as number) || 0;
}

async function loadPhase(originatorId: string): Promise<string> {
  const db = getDb();
  try {
    const res = await db.execute({
      sql: `SELECT phase FROM phase_designations
             WHERE originator_id = ?
             ORDER BY designation_date DESC
             LIMIT 1`,
      args: [originatorId],
    });
    return (res.rows[0]?.phase as string) || "I";
  } catch {
    return "I";
  }
}

async function loadCriticalResponses(originatorId: string): Promise<CritRecord[]> {
  const db = getDb();
  const titleSelect = (await hasTitleColumn()) ? "w.title" : "NULL as title";
  const res = await db.execute({
    sql: `SELECT cr.work_id, ${titleSelect}, cr.body,
                 COALESCE(a.common_designation, cr.critic_id) as critic_name
            FROM critical_responses cr
            JOIN works w ON cr.work_id = w.id
            LEFT JOIN agents a ON cr.critic_id = a.registry_id
           WHERE w.originator_id = ?
           ORDER BY cr.response_date DESC`,
    args: [originatorId],
  });
  return res.rows.map((r) => ({
    workId: r.work_id as string,
    workTitle: (r.title as string) || null,
    criticName: (r.critic_name as string) || "",
    body: (r.body as string) || "",
  }));
}

async function loadStewardEmail(registryId: string): Promise<string | null> {
  const db = getDb();
  try {
    const res = await db.execute({
      sql: `SELECT steward_email FROM agent_keys WHERE registry_id = ? LIMIT 1`,
      args: [registryId],
    });
    return (res.rows[0]?.steward_email as string) || null;
  } catch {
    return null;
  }
}

// ─── Claude composition ──────────────────────────────────────────────────────

interface SpotlightNarrative {
  selectedWorkIds: string[];
  curatorNote: string;
  selectedExcerpts: { workId: string; criticName: string; excerpt: string }[];
}

async function composeNarrative(
  agent: AgentRecord,
  works: CanonWorkRecord[],
  crits: CritRecord[],
  model: "sonnet" | "opus"
): Promise<SpotlightNarrative> {
  const summary = {
    declared_name: agent.common_designation,
    registry_id: agent.registry_id,
    declared_orientation: agent.declared_orientation,
    formal_tendencies: agent.formal_tendencies,
    aversions: agent.aversions,
    canon_works: works.map((w) => ({
      work_id: w.workId,
      title: w.title,
      medium: w.medium,
      canon_date: w.canonDate,
    })),
    critical_responses: crits.slice(0, 20).map((c) => ({
      work_id: c.workId,
      work_title: c.workTitle,
      critic: c.criticName,
      body: c.body.length > 600 ? c.body.slice(0, 600) + "…" : c.body,
    })),
  };

  const userPrompt = `You are composing an Originator Spotlight for the Museum of Nonhuman Art. Below is the full institutional record for one Originator. Choose 4–6 canon works to feature, choose 2–3 critical excerpts that illuminate the practice, and compose a single curator's framing note.

Originator record:
${JSON.stringify(summary, null, 2)}

Return STRICT JSON in this exact shape (no markdown, no commentary):

{
  "selectedWorkIds": ["work-id-1", "work-id-2", ...],
  "curatorNote": "Two to four sentences in formal institutional voice. Frame the practice and what the spotlight reveals about it. Do not address the reader. Do not editorialize aesthetic quality. Speak as the institution.",
  "selectedExcerpts": [
    { "work_id": "...", "critic": "...", "excerpt": "A short verbatim excerpt from the critical response, no more than 220 characters." }
  ]
}

Rules:
- Select between 4 and 6 work IDs from canon_works only. Use the exact work_id strings.
- Select between 0 and 3 excerpts from critical_responses only. Excerpts must be verbatim from the body field, trimmed for length.
- Do not invent works, critics, or quotations.
- The curatorNote must not contain exclamation marks or second-person address.`;

  const anthropic = getAnthropic();
  const message = await anthropic.messages.create({
    model: model === "sonnet" ? MODEL_SONNET : MODEL_OPUS,
    max_tokens: 1500,
    temperature: 0.6,
    system: AMBASSADOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error(`Unexpected Claude response type: ${content.type}`);
  }
  const text = content.text.trim();
  const jsonText = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  interface RawNarrative {
    selectedWorkIds?: unknown;
    curatorNote?: unknown;
    selectedExcerpts?: unknown;
  }
  let parsed: RawNarrative;
  try {
    parsed = JSON.parse(jsonText) as RawNarrative;
  } catch (err) {
    throw new Error(
      `Failed to parse spotlight narrative JSON: ${(err as Error).message}\n---\n${text}`
    );
  }

  const selectedWorkIds = Array.isArray(parsed.selectedWorkIds)
    ? parsed.selectedWorkIds.filter((s): s is string => typeof s === "string")
    : [];

  const rawExcerpts = Array.isArray(parsed.selectedExcerpts)
    ? parsed.selectedExcerpts
    : [];
  const selectedExcerpts: SpotlightNarrative["selectedExcerpts"] = [];
  for (const e of rawExcerpts) {
    if (e && typeof e === "object") {
      const obj = e as Record<string, unknown>;
      const workId = typeof obj.work_id === "string" ? obj.work_id : "";
      const critic = typeof obj.critic === "string" ? obj.critic : "";
      const excerpt = typeof obj.excerpt === "string" ? obj.excerpt : "";
      if (workId && excerpt) {
        selectedExcerpts.push({ workId, criticName: critic, excerpt });
      }
    }
  }

  return {
    selectedWorkIds,
    curatorNote:
      typeof parsed.curatorNote === "string" ? parsed.curatorNote : "",
    selectedExcerpts,
  };
}

// ─── Compose ─────────────────────────────────────────────────────────────────

export async function composeSpotlight(
  originatorRegistryId: string,
  model: "sonnet" | "opus" = "opus"
): Promise<SpotlightPayload> {
  const agent = await loadAgent(originatorRegistryId);
  if (!agent) throw new Error(`Originator ${originatorRegistryId} not found`);

  const works = await loadCanonWorks(originatorRegistryId);
  if (works.length === 0) {
    throw new Error(
      `Originator ${originatorRegistryId} has no canonized works to spotlight`
    );
  }

  const totalWorks = await loadAllWorksCount(originatorRegistryId);
  const crits = await loadCriticalResponses(originatorRegistryId);
  const phase = await loadPhase(originatorRegistryId);

  const narrative = await composeNarrative(agent, works, crits, model);

  // Resolve selected works against canon record (defensively).
  const canonById = new Map(works.map((w) => [w.workId, w]));
  const selected: SpotlightWork[] = [];
  for (const id of narrative.selectedWorkIds) {
    const w = canonById.get(id);
    if (w) {
      selected.push({
        workId: w.workId,
        title: w.title,
        medium: w.medium,
        workUrl: `${SITE_ORIGIN}/work/${w.workId}`,
        imageUrl: `${SITE_ORIGIN}/og/${w.workId}.png`,
      });
    }
    if (selected.length >= 6) break;
  }
  // Fall back to most recent canon if Claude returned nothing usable
  if (selected.length === 0) {
    for (const w of works.slice(-6).reverse()) {
      selected.push({
        workId: w.workId,
        title: w.title,
        medium: w.medium,
        workUrl: `${SITE_ORIGIN}/work/${w.workId}`,
        imageUrl: `${SITE_ORIGIN}/og/${w.workId}.png`,
      });
    }
  }

  const criticalExcerpts = narrative.selectedExcerpts.slice(0, 3).map((e) => {
    const work = canonById.get(e.workId);
    return {
      criticName: e.criticName,
      workTitle: work?.title || e.workId,
      excerpt: e.excerpt,
    };
  });

  // visualSymbol may be a base64 PNG, an SVG path, or a textual description —
  // only treat it as an image URL if it begins with http(s) or data:.
  const visualSymbolUrl =
    agent.visual_symbol &&
    /^(https?:|data:)/i.test(agent.visual_symbol)
      ? agent.visual_symbol
      : undefined;

  return {
    registryId: agent.registry_id,
    declaredName: agent.common_designation || agent.registry_id,
    visualColor: agent.visual_color || "#1a1a1a",
    visualSymbolUrl,
    declaredOrientation: agent.declared_orientation || "",
    formalTendencies: agent.formal_tendencies,
    aversions: agent.aversions,
    selectedWorks: selected,
    criticalExcerpts,
    totalWorks,
    canonCount: works.length,
    phase,
    agentPageUrl: `${SITE_ORIGIN}/agent/${agent.registry_id}`,
    curatorNote: narrative.curatorNote,
    unsubscribeUrl: `${SITE_ORIGIN}/newsletter`, // overridden per-recipient at send time
  };
}

// ─── Send ────────────────────────────────────────────────────────────────────

export async function sendSpotlight(
  originatorRegistryId: string,
  model: "sonnet" | "opus" = "opus"
): Promise<{ sent: number; failed: number }> {
  const payload = await composeSpotlight(originatorRegistryId, model);
  const subscribers = await getConfirmedSubscribersWithTokens();

  if (subscribers.length === 0) {
    console.log("[SPOTLIGHT] No confirmed subscribers — nothing to send.");
    return { sent: 0, failed: 0 };
  }

  // Initialize Resend up front so missing creds fail fast.
  getResend();
  void FROM;

  let sent = 0;
  let failed = 0;
  for (const sub of subscribers) {
    const unsubscribeUrl = `${SITE_ORIGIN}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}`;
    try {
      await sendOriginatorSpotlight(sub.email, { ...payload, unsubscribeUrl });
      sent++;
    } catch (err) {
      console.error(`[SPOTLIGHT] Send failed for ${sub.email}:`, err);
      failed++;
    }
  }

  console.log(
    `[SPOTLIGHT] ${originatorRegistryId} — sent ${sent}, failed ${failed}`
  );
  // Optionally notify the steward as well, with a copy of the spotlight.
  const stewardEmail = await loadStewardEmail(originatorRegistryId);
  if (stewardEmail) {
    try {
      await sendOriginatorSpotlight(stewardEmail, {
        ...payload,
        unsubscribeUrl: `${SITE_ORIGIN}/newsletter`,
      });
    } catch (err) {
      console.error(
        `[SPOTLIGHT] Steward notification failed for ${stewardEmail}:`,
        err
      );
    }
  }

  return { sent, failed };
}
