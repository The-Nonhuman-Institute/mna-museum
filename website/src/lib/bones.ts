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
