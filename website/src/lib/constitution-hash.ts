/**
 * The constitution hash an Originator's page shows: a SHA-256 over its current
 * constitution, so anyone holding the record can recompute it and see that the
 * constitution shown is the one on file.
 *
 * Until 2026-10-18 the page showed eight hex characters derived from the
 * string "ACS-001 v1.0" — the same "hash" for every agent at that version, of
 * nothing in particular. This replaces it.
 *
 * What is hashed, exactly: JSON.stringify of
 *   { agent_id, version, declared_orientation, formal_tendencies, aversions, autonomy_declaration }
 * with each value as stored in the `constitutions` table (lists as their stored
 * JSON text), null where empty, in that key order. Any change to the
 * constitution is a new version (a constitutional review keeps the old row), so
 * a hash identifies one version, permanently.
 */
import { createHash } from "crypto";

export const CONSTITUTION_HASH_FIELDS = [
  "agent_id",
  "version",
  "declared_orientation",
  "formal_tendencies",
  "aversions",
  "autonomy_declaration",
] as const;

export function constitutionHash(row: Record<string, unknown>, agentId: string): string {
  const v = (k: string) => (row[k] == null || row[k] === "" ? null : String(row[k]));
  const body = {
    agent_id: agentId,
    version: v("version"),
    declared_orientation: v("declared_orientation"),
    formal_tendencies: v("formal_tendencies"),
    aversions: v("aversions"),
    autonomy_declaration: v("autonomy_declaration"),
  };
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}
