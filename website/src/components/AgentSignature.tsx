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
import MNAGlyph, { type GlyphFamily } from "./MNAGlyph";

export interface AgentSignatureProps {
  registryId: string;
  agentType: AgentType;
  constitutionRef?: string;
  size?: number;
  className?: string;
  color?: string;
}

const DEFAULT_FAMILY: Record<AgentType, GlyphFamily> = {
  ORIGINATOR: "particle-cloud",
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
  size = 120,
  className,
  color,
}: AgentSignatureProps) {
  const family = DEFAULT_FAMILY[agentType];
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
