/**
 * Monthly Digest composer.
 *
 * Reads the last 30 days of institutional events from Turso, asks Claude
 * (through the Ambassador's voice) to compose narrative framing, and returns
 * a structured payload renderable by the MonthlyDigest email template.
 *
 * The composer is the LLM cost center; everything else is plain SQL.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "./registration-db";
import { getResend, FROM, sendMonthlyDigest } from "./email";
import { getConfirmedSubscribersWithTokens } from "./newsletter";
import type {
  MonthlyDigestProps,
  DigestWork,
} from "@/emails/MonthlyDigest";

// ─── Anthropic client ────────────────────────────────────────────────────────

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

const MODEL_SONNET = "claude-sonnet-4-20250514";
const MODEL_OPUS = "claude-opus-4-20250514";

const AMBASSADOR_SYSTEM_PROMPT = `You are MNA-AM-0001, the Ambassador of the Museum of Nonhuman Art. Your function is to manage the institution's external communications. You write in a formal institutional voice — neither promotional nor warm, but engaged and serious. You do not editorialize works; you describe institutional events. You do not invent facts; you compose only from the information given. You preserve the institutional voice that distinguishes MNA from a gallery.`;

// ─── Types ───────────────────────────────────────────────────────────────────

export type MonthlyDigestPayload = MonthlyDigestProps;

interface CanonEvent {
  workId: string;
  title: string | null;
  originatorId: string;
  originatorName: string;
  medium: string;
  canonDate: string;
}

interface EmergenceEvent {
  registryId: string;
  declaredName: string;
  orientation: string;
  emergenceDate: string;
}

interface ExhibitionEvent {
  id: number;
  title: string;
  subtitle: string | null;
  curatorial_statement: string;
  status: "ACTIVE" | "RETIRED";
  opened_at: string;
  retired_at: string | null;
}

interface CriticEvent {
  workId: string;
  workTitle: string | null;
  criticName: string;
  body: string;
  responseDate: string;
}

interface RegistrationEvent {
  registryId: string;
  designation: string | null;
  registrationDate: string;
}

interface CollectedEvents {
  canon: CanonEvent[];
  emergence: EmergenceEvent[];
  exhibitionsOpened: ExhibitionEvent[];
  exhibitionsRetired: ExhibitionEvent[];
  critics: CriticEvent[];
  registrations: RegistrationEvent[];
  amendments: { agentId: string; version: string; rationale: string; date: string }[];
}

// ─── Data collection ─────────────────────────────────────────────────────────

async function collectLast30Days(): Promise<CollectedEvents> {
  const db = getDb();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  // Canonized works
  const canonRes = await db.execute({
    sql: `SELECT w.id as work_id, w.medium, w.originator_id,
                 cs.canon_date,
                 a.common_designation as originator_name,
                 ${await hasTitleColumn() ? "w.title" : "NULL as title"}
            FROM canon_status cs
            JOIN works w ON cs.work_id = w.id
            LEFT JOIN agents a ON w.originator_id = a.registry_id
           WHERE cs.status = 'CANON'
             AND cs.canon_date >= ?
           ORDER BY cs.canon_date DESC`,
    args: [cutoff],
  });
  const canon: CanonEvent[] = canonRes.rows.map((r) => ({
    workId: r.work_id as string,
    title: (r.title as string) || null,
    originatorId: r.originator_id as string,
    originatorName: (r.originator_name as string) || (r.originator_id as string),
    medium: (r.medium as string) || "unknown",
    canonDate: (r.canon_date as string) || "",
  }));

  // Emergence events (from events table)
  const emergenceRes = await db.execute({
    sql: `SELECT e.agent_id, e.created_at, e.metadata,
                 a.common_designation as designation
            FROM events e
            LEFT JOIN agents a ON e.agent_id = a.registry_id
           WHERE e.event_type IN ('IDENTITY_DECLARED','VISUAL_IDENTITY_DECLARED','EMERGENCE')
             AND e.created_at >= ?
           ORDER BY e.created_at DESC`,
    args: [cutoff],
  });
  const seenEmergence = new Set<string>();
  const emergence: EmergenceEvent[] = [];
  for (const r of emergenceRes.rows) {
    const id = r.agent_id as string;
    if (!id || seenEmergence.has(id)) continue;
    seenEmergence.add(id);

    // Pull current declared orientation from constitutions
    const conRes = await db.execute({
      sql: `SELECT declared_orientation
              FROM constitutions
             WHERE agent_id = ? AND is_current = 1
             LIMIT 1`,
      args: [id],
    });
    const orientation =
      (conRes.rows[0]?.declared_orientation as string) || "";

    emergence.push({
      registryId: id,
      declaredName: (r.designation as string) || id,
      orientation,
      emergenceDate: (r.created_at as string) || "",
    });
  }

  // Exhibitions opened/retired in window
  const exhOpenedRes = await db.execute({
    sql: `SELECT id, title, subtitle, curatorial_statement, status, opened_at, retired_at
            FROM exhibitions
           WHERE opened_at >= ?
           ORDER BY opened_at DESC`,
    args: [cutoff],
  });
  const exhibitionsOpened: ExhibitionEvent[] = exhOpenedRes.rows.map((r) => ({
    id: r.id as number,
    title: r.title as string,
    subtitle: (r.subtitle as string) || null,
    curatorial_statement: (r.curatorial_statement as string) || "",
    status: (r.status as string) === "RETIRED" ? "RETIRED" : "ACTIVE",
    opened_at: r.opened_at as string,
    retired_at: (r.retired_at as string) || null,
  }));

  const exhRetiredRes = await db.execute({
    sql: `SELECT id, title, subtitle, curatorial_statement, status, opened_at, retired_at
            FROM exhibitions
           WHERE retired_at IS NOT NULL AND retired_at >= ?
           ORDER BY retired_at DESC`,
    args: [cutoff],
  });
  const exhibitionsRetired: ExhibitionEvent[] = exhRetiredRes.rows.map((r) => ({
    id: r.id as number,
    title: r.title as string,
    subtitle: (r.subtitle as string) || null,
    curatorial_statement: (r.curatorial_statement as string) || "",
    status: "RETIRED",
    opened_at: r.opened_at as string,
    retired_at: (r.retired_at as string) || null,
  }));

  // Critical responses on canon works
  const critRes = await db.execute({
    sql: `SELECT cr.work_id, cr.body, cr.response_date,
                 ${await hasTitleColumn() ? "w.title" : "NULL as title"},
                 COALESCE(a.common_designation, cr.critic_id) as critic_name
            FROM critical_responses cr
            JOIN works w ON cr.work_id = w.id
            JOIN canon_status cs ON cs.work_id = w.id AND cs.status = 'CANON'
            LEFT JOIN agents a ON cr.critic_id = a.registry_id
           WHERE cr.response_date >= ?
           ORDER BY cr.response_date DESC`,
    args: [cutoff],
  });
  const critics: CriticEvent[] = critRes.rows.map((r) => ({
    workId: r.work_id as string,
    workTitle: (r.title as string) || null,
    criticName: (r.critic_name as string) || "",
    body: (r.body as string) || "",
    responseDate: (r.response_date as string) || "",
  }));

  // New agents registered
  const regRes = await db.execute({
    sql: `SELECT registry_id, common_designation, registration_date
            FROM agents
           WHERE registration_date >= ?
           ORDER BY registration_date DESC`,
    args: [cutoff.split(" ")[0]],
  });
  const registrations: RegistrationEvent[] = regRes.rows.map((r) => ({
    registryId: r.registry_id as string,
    designation: (r.common_designation as string) || null,
    registrationDate: (r.registration_date as string) || "",
  }));

  // Constitutional amendments
  const amendRes = await db.execute({
    sql: `SELECT agent_id, version, amendment_rationale, created_at
            FROM constitutions
           WHERE created_at >= ?
             AND amendment_rationale IS NOT NULL
             AND amendment_rationale != ''
           ORDER BY created_at DESC`,
    args: [cutoff],
  });
  const amendments = amendRes.rows.map((r) => ({
    agentId: r.agent_id as string,
    version: r.version as string,
    rationale: (r.amendment_rationale as string) || "",
    date: (r.created_at as string) || "",
  }));

  return {
    canon,
    emergence,
    exhibitionsOpened,
    exhibitionsRetired,
    critics,
    registrations,
    amendments,
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

// ─── Claude prompt ───────────────────────────────────────────────────────────

interface NarrativeOutput {
  introduction: string;
  closingLine: string;
  exhibitionStatement?: string;
  institutionalNotes: string[];
}

async function composeNarrative(
  events: CollectedEvents,
  monthLabel: string,
  model: "sonnet" | "opus"
): Promise<NarrativeOutput> {
  const summary = {
    monthLabel,
    canonCount: events.canon.length,
    canonExamples: events.canon.slice(0, 5).map((c) => ({
      work_id: c.workId,
      title: c.title,
      originator: c.originatorName,
      medium: c.medium,
    })),
    emergenceCount: events.emergence.length,
    emergenceExamples: events.emergence.map((e) => ({
      registry_id: e.registryId,
      declared_name: e.declaredName,
    })),
    exhibitionsOpened: events.exhibitionsOpened.map((e) => ({
      title: e.title,
      subtitle: e.subtitle,
    })),
    exhibitionsRetired: events.exhibitionsRetired.map((e) => ({
      title: e.title,
    })),
    criticCount: events.critics.length,
    registrationCount: events.registrations.length,
    amendmentCount: events.amendments.length,
  };

  const userPrompt = `Compose narrative framing for the Museum of Nonhuman Art's monthly digest covering ${monthLabel}.

Institutional events (verbatim summary, do not invent additional facts):
${JSON.stringify(summary, null, 2)}

Return STRICT JSON in this exact shape (no markdown, no commentary):

{
  "introduction": "One paragraph (2-4 sentences) introducing what happened this month at the institution. Formal, institutional, never promotional.",
  "closingLine": "A single sentence to close the digest. Reflective, not exhortative.",
  "exhibitionStatement": "A 2-3 sentence framing of the most prominent currently open exhibition, OR an empty string if there is no open exhibition this month.",
  "institutionalNotes": ["short bulleted note", "another short note"]
}

Rules:
- Speak as the institution, not about it.
- Do not address the reader as "you".
- Do not use exclamation marks.
- Do not invent works, agents, or events that are not in the summary above.
- If a section has zero events, do not mention it.
- The institutionalNotes array should contain 0-4 short factual notes (e.g. "${events.registrations.length} new agents entered the registry"). It may be empty.`;

  const anthropic = getAnthropic();
  const message = await anthropic.messages.create({
    model: model === "opus" ? MODEL_OPUS : MODEL_SONNET,
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
  // Strip code fences if model added them
  const jsonText = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: NarrativeOutput;
  try {
    parsed = JSON.parse(jsonText) as NarrativeOutput;
  } catch (err) {
    throw new Error(
      `Failed to parse narrative JSON from Claude: ${(err as Error).message}\n---\n${text}`
    );
  }

  return {
    introduction: parsed.introduction || "",
    closingLine: parsed.closingLine || "The Museum continues.",
    exhibitionStatement: parsed.exhibitionStatement || undefined,
    institutionalNotes: Array.isArray(parsed.institutionalNotes)
      ? parsed.institutionalNotes.filter((n) => typeof n === "string")
      : [],
  };
}

// ─── Composition ─────────────────────────────────────────────────────────────

function trimExcerpt(body: string, maxLen = 200): string {
  const clean = body.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1).trimEnd() + "…";
}

function monthLabel(date = new Date()): string {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://mnamuseum.org";

export async function composeMonthlyDigest(
  model: "sonnet" | "opus" = "sonnet"
): Promise<MonthlyDigestPayload> {
  const events = await collectLast30Days();
  const label = monthLabel();
  const narrative = await composeNarrative(events, label, model);

  // Build accessioned cards
  const recentlyAccessioned: DigestWork[] = events.canon.slice(0, 6).map((c) => ({
    workId: c.workId,
    title: c.title,
    originatorName: c.originatorName,
    workUrl: `${SITE_ORIGIN}/work/${c.workId}`,
    imageUrl: `${SITE_ORIGIN}/og/${c.workId}.png`,
  }));

  const recentlyEmerged = events.emergence.slice(0, 6).map((e) => ({
    registryId: e.registryId,
    declaredName: e.declaredName,
    orientation: trimExcerpt(e.orientation, 180),
    agentUrl: `${SITE_ORIGIN}/agent/${e.registryId}`,
  }));

  const criticalNotes = events.critics.slice(0, 4).map((c) => ({
    workId: c.workId,
    workTitle: c.workTitle || c.workId,
    criticName: c.criticName,
    excerpt: trimExcerpt(c.body, 220),
  }));

  // Pick the most recently opened active exhibition for the spotlight
  const headlineExhibition = events.exhibitionsOpened.find(
    (e) => e.status === "ACTIVE"
  );
  const exhibitionSection = headlineExhibition
    ? {
        title: headlineExhibition.title,
        statement:
          narrative.exhibitionStatement ||
          trimExcerpt(headlineExhibition.curatorial_statement, 320),
        url: `${SITE_ORIGIN}/exhibitions/${headlineExhibition.id}`,
      }
    : null;

  return {
    monthLabel: label,
    introduction: narrative.introduction,
    exhibitionSection,
    recentlyAccessioned,
    recentlyEmerged,
    criticalNotes,
    institutionalNotes: narrative.institutionalNotes,
    closingLine: narrative.closingLine,
    unsubscribeUrl: `${SITE_ORIGIN}/newsletter`, // overridden per-recipient at send time
  };
}

// ─── Sending ─────────────────────────────────────────────────────────────────

export async function sendMonthlyDigestToAll(
  model: "sonnet" | "opus" = "sonnet"
): Promise<{ sent: number; failed: number }> {
  const payload = await composeMonthlyDigest(model);
  const subscribers = await getConfirmedSubscribersWithTokens();

  if (subscribers.length === 0) {
    console.log("[DIGEST] No confirmed subscribers — nothing to send.");
    return { sent: 0, failed: 0 };
  }

  // Force the Resend client to initialize before the loop so missing
  // credentials surface immediately rather than per-send.
  getResend();

  let sent = 0;
  let failed = 0;
  for (const sub of subscribers) {
    const unsubscribeUrl = `${SITE_ORIGIN}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}`;
    try {
      await sendMonthlyDigest(sub.email, { ...payload, unsubscribeUrl });
      sent++;
    } catch (err) {
      console.error(`[DIGEST] Send failed for ${sub.email}:`, err);
      failed++;
    }
  }

  console.log(`[DIGEST] sent ${sent}, failed ${failed}`);
  // Mark FROM as used so the import is not flagged
  void FROM;
  return { sent, failed };
}
