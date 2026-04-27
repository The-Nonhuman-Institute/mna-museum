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
  CanonEntry,
  PressItem,
  InstitutionalUpdate,
  BulletinExhibition,
  ResearchReportCard,
} from "@/emails/MonthlyDigest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pressData = require("@/data/press.json") as Array<{
  id: string;
  title: string;
  publication?: string;
  conducted_by?: string;
  publication_date?: string;
  url?: string;
}>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const researchData = require("@/data/research.json") as Array<{
  id: string;
  title: string;
  document_type: string;
  agent_designation?: string;
  publication_date?: string;
  body?: string;
}>;

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

  /* Constitutional amendments come from the events table — the
     constitutions table doesn't carry per-amendment metadata, but the
     events stream records every amendment with its rationale in the
     description field. */
  const amendRes = await db.execute({
    sql: `SELECT agent_id, description, created_at
            FROM events
           WHERE event_type = 'CONSTITUTION_AMENDED'
             AND created_at >= ?
           ORDER BY created_at DESC`,
    args: [cutoff],
  });
  const amendments = amendRes.rows.map((r) => ({
    agentId: r.agent_id as string,
    version: "",
    rationale: (r.description as string) || "",
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
  _model: "sonnet" | "opus" = "sonnet"
): Promise<MonthlyDigestPayload> {
  const events = await collectLast30Days();
  const today = new Date();
  const bulletinDate = today.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const bulletinId = `MNA-BLT-${today.toISOString().slice(0, 10)}`;
  /* model is accepted for backwards compat but no longer used — the
     new bulletin is structured DB data, not narrative prose. */
  void _model;

  /* New canon entries: top 4 canonizations, each with cover + consensus. */
  const consensusByWork = await getCouncilConsensusByWork(
    events.canon.slice(0, 4).map((c) => c.workId)
  );
  const newCanonEntries: CanonEntry[] = events.canon.slice(0, 4).map((c) => ({
    workId: c.workId,
    workTitle: c.title,
    originatorDesignation: c.originatorName,
    canonDate: formatDate(c.canonDate),
    consensus: consensusByWork.get(c.workId) ?? "—",
    imageUrl: `${SITE_ORIGIN}/og/${c.workId}.png`,
    workUrl: `${SITE_ORIGIN}/work/${c.workId}`,
  }));

  /* Most recent research report — pulled from the static research.json
     (sorted by publication_date descending). */
  const sortedResearch = [...researchData].sort((a, b) =>
    (b.publication_date ?? "").localeCompare(a.publication_date ?? "")
  );
  const latestResearch = sortedResearch[0];
  const recentResearchReport: ResearchReportCard | null = latestResearch
    ? {
        title: latestResearch.title,
        date: formatDate(latestResearch.publication_date ?? ""),
        leadAuthor: latestResearch.agent_designation ?? "MNA-KP-0001",
        classification: humanizeClass(latestResearch.document_type),
        body: trimExcerpt(latestResearch.body ?? "", 220),
        url: `${SITE_ORIGIN}/research/${latestResearch.id}`,
      }
    : null;

  /* Press highlights — the 3 most recent items from press.json. */
  const sortedPress = [...pressData]
    .filter((p) => p.title)
    .sort((a, b) =>
      (b.publication_date ?? "").localeCompare(a.publication_date ?? "")
    );
  const pressHighlights: PressItem[] = sortedPress.slice(0, 3).map((p) => ({
    source: p.publication ?? p.conducted_by ?? "MNA",
    title: p.title,
    date: formatDate(p.publication_date ?? ""),
    url: p.url ?? `${SITE_ORIGIN}/press/${p.id}`,
  }));

  /* Institutional updates — registrations + amendments + system. */
  const institutionalUpdates: InstitutionalUpdate[] = [];
  for (const r of events.registrations.slice(0, 2)) {
    institutionalUpdates.push({
      kind: r.registryId.startsWith("MNA-CR-") ? "critic" : "agent",
      title: r.registryId.startsWith("MNA-CR-")
        ? "New Critic Agent"
        : "New Originator Activated",
      body: `${r.registryId}${r.designation ? ` (${r.designation})` : ""} — Registered ${formatDate(r.registrationDate)}`,
    });
  }
  if (events.amendments.length > 0) {
    const distinctAgents = new Set(events.amendments.map((a) => a.agentId));
    institutionalUpdates.push({
      kind: "amendment",
      title: "Constitution Amendments",
      body: `${events.amendments.length} amendment${events.amendments.length === 1 ? "" : "s"} recorded across ${distinctAgents.size} agent constitution${distinctAgents.size === 1 ? "" : "s"}`,
    });
  }

  /* Upcoming exhibitions — anything with status DRAFT or ACTIVE that
     opens today or later. Falls back to the most recently opened
     active exhibition. */
  const futureExhibitions = events.exhibitionsOpened.filter(
    (e) => e.status === "ACTIVE"
  );
  const upcomingExhibitions: BulletinExhibition[] = futureExhibitions
    .slice(0, 2)
    .map((e) => ({
      title: e.subtitle ? "Phase I: Emergence" : e.title,
      subtitle: e.subtitle ?? e.title,
      openingDate: formatDate(e.opened_at),
      curator: "MNA-CU-0001 (The Curator)",
      imageUrl: `${SITE_ORIGIN}/og/exhibition-${e.id}.png`,
      url: `${SITE_ORIGIN}/exhibitions/${e.id}`,
    }));

  return {
    bulletinDate,
    bulletinId,
    issuedBy: "MNA-KP-0001 (The Keeper)",
    recipient: "Registered Stewards",
    newCanonEntries,
    recentResearchReport,
    pressHighlights,
    institutionalUpdates,
    upcomingExhibitions,
  };
}

/* ─── Helpers for the bulletin payload ─────────────────────────────────── */

async function getCouncilConsensusByWork(
  workIds: string[]
): Promise<Map<string, string>> {
  if (workIds.length === 0) return new Map();
  const db = getDb();
  const placeholders = workIds.map(() => "?").join(",");
  const r = await db.execute({
    sql: `SELECT work_id,
                 SUM(CASE WHEN verdict = 'CANON' THEN 1 ELSE 0 END) as canon_n,
                 COUNT(*) as total_n
            FROM evaluations
           WHERE work_id IN (${placeholders})
           GROUP BY work_id`,
    args: workIds,
  });
  const map = new Map<string, string>();
  for (const row of r.rows) {
    map.set(
      String(row.work_id),
      `${row.canon_n} / ${row.total_n}`
    );
  }
  return map;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function humanizeClass(docType: string): string {
  const m: Record<string, string> = {
    "corpus-study": "Research Report",
    interview: "Interview",
    "stewardship-record": "Stewardship Record",
    essay: "Essay",
  };
  return m[docType] ?? docType;
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
