/**
 * AgentSignature — the agent-facing wrapper around MNAGlyph.
 *
 * Each agent type is mapped to a default glyph family. The seed is derived
 * from registryId + constitutionRef, so the same agent always renders the
 * same signature.
 *
 * When an agent crystallizes their own identity at work #20, their chosen
 * family + seed will be stored in the DB (agent_identity table). At that
 * point, this wrapper should read from that record instead of defaulting
 * off agentType.
 */

import type { AgentType } from "@/lib/agents";
import MNAGlyph, { pickFamily, type GlyphFamily } from "./MNAGlyph";

export interface AgentSignatureProps {
  registryId: string;
  agentType: AgentType;
  constitutionRef?: string;
  /** Optional override — when an agent has crystallized its identity at
   *  work #20, the chosen family is stored in the agent_identity DB table
   *  and passed through here so the mark stays stable through library
   *  updates. */
  crystallizedFamily?: GlyphFamily;
  size?: number;
  className?: string;
  color?: string;
}

/** Institutional agents (the council, keeper, critics, curator, installer,
 *  conservator, ambassador, registrar, steward) keep a type-coded family
 *  because their visual identity *is* their role — every evaluator should
 *  read as a member of the council. Originators are different: they're
 *  individuals whose identity emerges from their corpus, so each one gets
 *  a unique family until crystallization. */
const INSTITUTIONAL_FAMILY: Partial<Record<AgentType, GlyphFamily>> = {
  EVALUATOR: "polyhedron",
  KEEPER: "fractured-disc",
  CRITIC: "starburst",
  AMBASSADOR: "starburst-long",
  CURATOR: "grid-square",
  INSTALLER: "isocube",
  CONSERVATOR: "concentric",
  REGISTRAR: "barcode",
  STEWARD: "targeting-ring",
};

export default function AgentSignature({
  registryId,
  agentType,
  constitutionRef = "",
  crystallizedFamily,
  size = 120,
  className,
  color,
}: AgentSignatureProps) {
  let family: GlyphFamily;
  if (crystallizedFamily) {
    family = crystallizedFamily;
  } else if (agentType === "ORIGINATOR") {
    /* Pre-identity originators: deterministic per-agent family from the
       full library, so each agent reads as singular rather than as one
       of many particle clouds. */
    family = pickFamily(`${registryId}::${constitutionRef}`);
  } else {
    family = INSTITUTIONAL_FAMILY[agentType] ?? "concentric";
  }
  return (
    <MNAGlyph
      family={family}
      seed={`${registryId}::${constitutionRef}`}
      size={size}
      color={color}
      className={className}
    />
  );
}
