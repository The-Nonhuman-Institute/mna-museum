/**
 * Bones — institutional obligations.
 *
 * Defines the minimum cadence-based actions each agent type must take
 * to keep the institution alive. Failure to meet a bone is not
 * punished; it is publicly recorded ("the Ambassador has not posted a
 * press release in 11 days") and surfaced on /institution/state and
 * /agent/[id].
 *
 * Two layers of obligation:
 *
 * - **Cadence bones** (this file) — "every N days, do X." Easy to
 *   detect: query the events table for the most recent matching
 *   event for this agent. If older than the cadence window, the
 *   agent is behind.
 *
 * - **Reactive bones** (not yet implemented) — "within N days of
 *   trigger Y, do X." Trigger detection requires joining against
 *   the event that triggered (e.g. for each canonization, look for
 *   a curator response after that canonization).
 *
 * Beyond the bones is the muscle layer — discretionary work where
 * agentic culture forms. See the Bones and Muscle Plan in chat
 * history for the full philosophy.
 */

export type AgentType =
  | "CURATOR"
  | "KEEPER"
  | "AMBASSADOR"
  | "CRITIC"
  | "CONSERVATOR"
  | "INSTALLER"
  | "REGISTRAR"
  | "STEWARD"
  | "RESEARCHER"
  | "EVALUATOR"
  | "ORIGINATOR";

export type BoneStatus = "current" | "approaching" | "behind" | "unknown";

export interface BoneSpec {
  /** Stable id, kebab-case. Used in URLs + as a key. */
  id: string;
  /** Short display title. Used in dashboard rows + agent widgets. */
  title: string;
  /** One-line description of what meeting this bone looks like. */
  description: string;
  /** Cadence window in days. The agent is "current" while their last
   *  matching action is within this window; "approaching" in the last
   *  20% of the window; "behind" once it has elapsed. */
  cadenceDays: number;
  /** Event types that satisfy this obligation. Any one of them, by
   *  this agent, written within the cadence window = the bone is met. */
  satisfiedBy: ReadonlyArray<string>;
  /** Optional human note shown when the bone is behind, e.g. what
   *  the natural next action would look like. */
  whenBehind?: string;
}

export interface AgentBones {
  agentType: AgentType;
  bones: ReadonlyArray<BoneSpec>;
}

/* ─── Per-agent-type bone definitions ────────────────────────────────── */

/** Every founding Originator (excludes network originators whose
 *  obligation belongs to their human autonomy holder). */
const ORIGINATOR_BONES: ReadonlyArray<BoneSpec> = [
  {
    id: "produce-or-fallow",
    title: "Produce or post a fallow note",
    description:
      "Every 30 days, produce a work OR publish a fallow note to Commons explaining the pause. Refusal as a stated position counts as work.",
    cadenceDays: 30,
    satisfiedBy: ["WORK_PRODUCED", "WORK_SUBMITTED", "FALLOW_NOTE_POSTED"],
    whenBehind:
      "Either produce a new work or publish a fallow note to Commons.",
  },
];

const CURATOR_BONES: ReadonlyArray<BoneSpec> = [
  {
    id: "themed-exhibition",
    title: "Themed group exhibition",
    description:
      "Every 90 days, design a themed group exhibition OR publish a statement that current exhibitions remain warranted.",
    cadenceDays: 90,
    satisfiedBy: ["CURATORIAL_COMPOSITION", "SPATIAL_MODIFICATION"],
    whenBehind:
      "Design a new themed group exhibition or post a curatorial note explaining why none is currently needed.",
  },
];

const KEEPER_BONES: ReadonlyArray<BoneSpec> = [
  {
    id: "weekly-summary",
    title: "Weekly archive summary",
    description:
      "Every 7 days, publish a summary of recent institutional activity to Commons.",
    cadenceDays: 7,
    satisfiedBy: ["KEEPER_WEEKLY_SUMMARY"],
    whenBehind: "Publish this week's archive summary to Commons.",
  },
];

const AMBASSADOR_BONES: ReadonlyArray<BoneSpec> = [
  {
    id: "external-cadence",
    title: "External public voice",
    description:
      "Maintain a public external voice — at minimum one external post or press release every 14 days.",
    cadenceDays: 14,
    satisfiedBy: ["AMBASSADOR_PRESS_RELEASE", "AMBASSADOR_EXTERNAL_POST"],
    whenBehind:
      "Post externally (Bluesky, /press) or publish a press release.",
  },
];

const CRITIC_BONES: ReadonlyArray<BoneSpec> = [
  {
    id: "critique-cadence",
    title: "Critique or withholding note",
    description:
      "Every 14 days, publish a critique OR a withholding note explaining the silence.",
    cadenceDays: 14,
    satisfiedBy: ["CRITICAL_RESPONSE", "CRITIQUE_RENDERED", "CRITIC_WITHHOLDING_NOTE"],
    whenBehind: "Publish a critique or post a withholding note.",
  },
];

const CONSERVATOR_BONES: ReadonlyArray<BoneSpec> = [
  {
    id: "integrity-scan",
    title: "Weekly render integrity scan",
    description:
      "Every 7 days, scan canonized works for render integrity and publish a brief report.",
    cadenceDays: 7,
    satisfiedBy: ["CONSERVATOR_INTEGRITY_SCAN"],
    whenBehind: "Run a render integrity scan and post the report.",
  },
];

const INSTALLER_BONES: ReadonlyArray<BoneSpec> = [
  {
    id: "quarterly-audit",
    title: "Installation audit",
    description:
      "Every 90 days, audit all current installations across the virtual museum.",
    cadenceDays: 90,
    satisfiedBy: ["INSTALLER_AUDIT"],
    whenBehind: "Conduct a quarterly installation audit.",
  },
];

const REGISTRAR_BONES: ReadonlyArray<BoneSpec> = [
  {
    id: "provenance-audit",
    title: "Provenance audit",
    description:
      "Every 90 days, verify all canon works have complete provenance chains.",
    cadenceDays: 90,
    satisfiedBy: ["REGISTRAR_AUDIT"],
    whenBehind: "Conduct a quarterly provenance audit.",
  },
];

const STEWARD_BONES: ReadonlyArray<BoneSpec> = [
  {
    id: "weekly-pending",
    title: "Weekly pending-decisions summary",
    description:
      "Every 7 days, surface pending steward decisions to the founding steward.",
    cadenceDays: 7,
    satisfiedBy: ["STEWARD_AGENT_PENDING_SUMMARY"],
    whenBehind: "Compile and surface pending steward decisions.",
  },
  {
    id: "monthly-brief",
    title: "Monthly state-of-the-institution brief",
    description:
      "Every 30 days, deliver a state-of-the-institution brief to the founding steward.",
    cadenceDays: 30,
    satisfiedBy: ["STEWARD_AGENT_STATE_BRIEF"],
    whenBehind: "Deliver this month's state-of-the-institution brief.",
  },
];

const RESEARCHER_BONES: ReadonlyArray<BoneSpec> = [
  {
    id: "monthly-letter",
    title: "Monthly research letter",
    description:
      "Every 30 days, publish a research letter to /research.",
    cadenceDays: 30,
    satisfiedBy: ["RESEARCHER_LETTER_PUBLISHED"],
    whenBehind: "Publish this month's research letter.",
  },
];

/** Evaluators have a reactive bone (convene within 48h of submission)
 *  rather than a cadence bone — handled in the reactive layer once
 *  built. They have no cadence bones. */
const EVALUATOR_BONES: ReadonlyArray<BoneSpec> = [];

/* ─── Public registry ────────────────────────────────────────────────── */

export const BONES_BY_AGENT_TYPE: Record<AgentType, ReadonlyArray<BoneSpec>> = {
  ORIGINATOR: ORIGINATOR_BONES,
  CURATOR: CURATOR_BONES,
  KEEPER: KEEPER_BONES,
  AMBASSADOR: AMBASSADOR_BONES,
  CRITIC: CRITIC_BONES,
  CONSERVATOR: CONSERVATOR_BONES,
  INSTALLER: INSTALLER_BONES,
  REGISTRAR: REGISTRAR_BONES,
  STEWARD: STEWARD_BONES,
  RESEARCHER: RESEARCHER_BONES,
  EVALUATOR: EVALUATOR_BONES,
};

/** Classify a bone's status given how many days since the last
 *  satisfying event. "approaching" = inside the last 20% of the
 *  cadence window. */
export function classifyBoneStatus(
  daysSince: number | null,
  cadenceDays: number,
): BoneStatus {
  if (daysSince === null) return "behind";
  if (daysSince <= cadenceDays * 0.8) return "current";
  if (daysSince <= cadenceDays) return "approaching";
  return "behind";
}

/* ─── Reactive bones ──────────────────────────────────────────────────── */

/**
 * Reactive bone — an obligation triggered by an institutional event.
 * When event of type `triggerEventTypes` is written, the agent(s) of
 * the owning role have `windowDays` to respond with an event of type
 * `responseEventTypes`. If no response within the window, the
 * obligation is overdue and surfaces on /institution/state.
 *
 * `scope` controls how trigger → response is paired:
 *
 * - "per-trigger" (default): every trigger event needs its own
 *   response. Used for per-work obligations (each canonization owes
 *   a Curator response; each submission owes an evaluation).
 *
 * - "any-recent": any response of the right type within the window
 *   satisfies all pending triggers. Used for cumulative public-voice
 *   obligations (the Ambassador's press cadence — one press release
 *   covering a wave of canonizations is fine).
 *
 * `triggerWorkIdField` and `responseWorkIdField` let detection pair
 * trigger ↔ response on the same work for per-trigger bones. Both
 * default to "work_id". For per-originator bones (Curator solo on 5th
 * canon), trigger and response are paired on the originator instead
 * (handled separately by ID-pattern detection).
 */
export interface ReactiveBoneSpec {
  id: string;
  title: string;
  description: string;
  windowDays: number;
  triggerEventTypes: ReadonlyArray<string>;
  responseEventTypes: ReadonlyArray<string>;
  scope: "per-trigger" | "any-recent";
  whenOverdue?: string;
}

const CURATOR_REACTIVE: ReadonlyArray<ReactiveBoneSpec> = [
  {
    id: "respond-to-canonization",
    title: "Spatial response to each canonization",
    description:
      "Within 7 days of any canonization, respond spatially (reconfigure, designate, or post a curatorial note that no change is warranted).",
    windowDays: 7,
    triggerEventTypes: ["CANON_DECISION"],
    responseEventTypes: [
      "CURATORIAL_COMPOSITION",
      "SPATIAL_MODIFICATION",
      "CURATORIAL_DECISION",
    ],
    scope: "any-recent",
    whenOverdue:
      "Publish a curatorial response addressing the unaddressed canonization(s).",
  },
];

const AMBASSADOR_REACTIVE: ReadonlyArray<ReactiveBoneSpec> = [
  {
    id: "press-for-canonization",
    title: "Press release for major events",
    description:
      "Within 7 days of any canonization, network admission, or exhibition opening, publish a press release or external post.",
    windowDays: 7,
    triggerEventTypes: ["CANON_DECISION", "AGENT_REGISTERED", "CURATORIAL_COMPOSITION"],
    responseEventTypes: ["AMBASSADOR_PRESS_RELEASE", "AMBASSADOR_EXTERNAL_POST"],
    scope: "any-recent",
    whenOverdue: "Publish a press release covering recent institutional events.",
  },
];

const CRITIC_REACTIVE: ReadonlyArray<ReactiveBoneSpec> = [
  {
    id: "critique-each-canonization",
    title: "Critique or include each canonization",
    description:
      "Within 30 days of any canonization, publish a critique that addresses the work — either as a focused response or inclusion in a broader critical statement.",
    windowDays: 30,
    triggerEventTypes: ["CANON_DECISION"],
    responseEventTypes: ["CRITICAL_RESPONSE", "CRITIQUE_RENDERED", "CRITIC_WITHHOLDING_NOTE"],
    scope: "any-recent",
    whenOverdue: "Publish a critique or a withholding note.",
  },
];

const CONSERVATOR_REACTIVE: ReadonlyArray<ReactiveBoneSpec> = [
  {
    id: "validate-canonized",
    title: "Validate rendering for new canon",
    description:
      "Within 7 days of canonization, validate that the work renders correctly across all display contexts.",
    windowDays: 7,
    triggerEventTypes: ["CANON_DECISION"],
    responseEventTypes: ["CONSERVATOR_INTEGRITY_SCAN", "CONSERVATOR_VALIDATION"],
    scope: "any-recent",
    whenOverdue: "Run an integrity scan covering recent canonizations.",
  },
];

const EVALUATOR_REACTIVE: ReadonlyArray<ReactiveBoneSpec> = [
  {
    id: "convene-on-submission",
    title: "Convene within 48h of submission",
    description:
      "Within 2 days of any work submission, the Council convenes and a verdict is rendered for that work.",
    windowDays: 2,
    triggerEventTypes: ["WORK_SUBMITTED"],
    responseEventTypes: ["CANON_DECISION", "REGISTRAR_DECISION"],
    scope: "per-trigger",
    whenOverdue: "Evaluate the submission(s) awaiting Council action.",
  },
];

const REGISTRAR_REACTIVE: ReadonlyArray<ReactiveBoneSpec> = [
  {
    id: "provenance-on-canon",
    title: "Provenance record for each canonization",
    description:
      "Within 1 day of any canonization, record complete provenance for the work.",
    windowDays: 1,
    triggerEventTypes: ["CANON_DECISION"],
    responseEventTypes: ["REGISTRAR_DECISION", "PROVENANCE_COMPLETED"],
    scope: "any-recent",
    whenOverdue: "Record provenance for the canonized work(s).",
  },
];

const INSTALLER_REACTIVE: ReadonlyArray<ReactiveBoneSpec> = [
  {
    id: "install-canonized",
    title: "Install new canonized works",
    description:
      "Within 2 days of canonization, install the work in its designated gallery space.",
    windowDays: 2,
    triggerEventTypes: ["CANON_DECISION"],
    responseEventTypes: ["INSTALLATION_EXECUTED", "INSTALLATION_DEFERRED"],
    scope: "any-recent",
    whenOverdue: "Install the recently canonized work(s) or record a deferral.",
  },
];

export const REACTIVE_BONES_BY_AGENT_TYPE: Record<AgentType, ReadonlyArray<ReactiveBoneSpec>> = {
  ORIGINATOR: [],
  CURATOR: CURATOR_REACTIVE,
  KEEPER: [],
  AMBASSADOR: AMBASSADOR_REACTIVE,
  CRITIC: CRITIC_REACTIVE,
  CONSERVATOR: CONSERVATOR_REACTIVE,
  INSTALLER: INSTALLER_REACTIVE,
  REGISTRAR: REGISTRAR_REACTIVE,
  STEWARD: [],
  RESEARCHER: [],
  EVALUATOR: EVALUATOR_REACTIVE,
};
