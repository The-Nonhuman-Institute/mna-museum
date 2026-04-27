/**
 * Public surface of the operative-agent profile template module.
 *
 * Per-type Client components (EvaluatorClient, CuratorClient, KeeperClient,
 * etc.) compose these atoms with type-specific stat blocks, recent-activity
 * tables, and bottom-panel content.
 */

export { default as AgentSidebar } from "./AgentSidebar";
export type { AgentSidebarProps } from "./AgentSidebar";

export {
  Block,
  FieldBlock,
  Panel,
  ProfileCol,
  Stat,
  Sparkline,
  Legend,
  DarkField,
} from "./atoms";

export {
  pct,
  formatDateShort,
  isEmergencePending,
  getConstitutionVersion,
  summarizeAutonomy,
} from "./helpers";
