/**
 * claude.ts — backward-compatible shim over the provider abstraction.
 *
 * This module used to own the Anthropic client directly. It no longer
 * does: the institution is provider-agnostic as of 2026-08-20, and all
 * model access lives in ./llm.ts. This file remains so the scripts that
 * already import it keep working unchanged.
 *
 * New code should import from "./llm" and pass a `tier`, not a model ID.
 *
 * @deprecated prefer ./llm
 */

export {
  generate,
  generateWithVision,
  isAvailable,
  visionAvailable,
  describeProvider,
  modelFor,
  PROVIDER,
} from "./llm";

export type { Tier, Provider, GenOptions } from "./llm";
