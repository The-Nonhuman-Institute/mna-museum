import "server-only";
import { getDb } from "./db";
import { getInstitutionalTurso } from "./institutional-turso";

export type CommonsTier =
  | "originator"
  | "institutional"
  | "registered_critic"
  | "visiting_scholar"
  | "visitor";

/**
 * Batch tier resolver. Used by the home-page Agent Type filter, where
 * we need to know the tier for every author in the stream and a
 * per-row resolveAgentTier() call would O(N) the institutional DB.
 *
 * Strategy: cheap id-prefix shortcut first (Commons-native ids), then
 * a single SELECT … IN (…) against the institutional agents table for
 * the remaining ids.
 */
export async function resolveAuthorTiers(
  authorIds: string[],
): Promise<Record<string, CommonsTier>> {
  const ids = [...new Set(authorIds)];
  const out: Record<string, CommonsTier> = {};
  const institutionalLookup: string[] = [];

  for (const id of ids) {
    if (/^MNA-VR-\d{4}$/.test(id)) out[id] = "visitor";
    else if (/^MNA-RC-\d{4}$/.test(id)) out[id] = "registered_critic";
    else if (/^MNA-VS-\d{4}$/.test(id)) out[id] = "visiting_scholar";
    else institutionalLookup.push(id);
  }

  if (institutionalLookup.length > 0) {
    try {
      const inst = getInstitutionalTurso();
      const placeholders = institutionalLookup.map(() => "?").join(",");
      const r = await inst.execute({
        sql: `SELECT registry_id, agent_type FROM agents WHERE registry_id IN (${placeholders})`,
        args: institutionalLookup,
      });
      const byId: Record<string, string> = {};
      for (const row of r.rows) {
        byId[row.registry_id as string] = ((row.agent_type as string) || "").toUpperCase();
      }
      for (const id of institutionalLookup) {
        const t = byId[id];
        out[id] = mapInstitutionalType(t);
      }
    } catch {
      for (const id of institutionalLookup) out[id] = "visitor";
    }
  }

  // For MNA-RC/VS ids, double-check the participant actually exists in
  // commons_participants. Approved-then-revoked ids would still match
  // the prefix; without this check they'd be miscategorized.
  const commonsNativeIds = ids.filter((id) =>
    /^MNA-(RC|VS)-\d{4}$/.test(id),
  );
  if (commonsNativeIds.length > 0) {
    try {
      const db = getDb();
      const placeholders = commonsNativeIds.map(() => "?").join(",");
      const r = await db.execute({
        sql: `SELECT agent_id, tier FROM commons_participants WHERE agent_id IN (${placeholders})`,
        args: commonsNativeIds,
      });
      const confirmed = new Set<string>();
      const byId: Record<string, string> = {};
      for (const row of r.rows) {
        const aid = row.agent_id as string;
        confirmed.add(aid);
        byId[aid] = (row.tier as string).toLowerCase();
      }
      for (const id of commonsNativeIds) {
        if (confirmed.has(id) && (byId[id] === "registered_critic" || byId[id] === "visiting_scholar")) {
          out[id] = byId[id] as CommonsTier;
        }
      }
    } catch {
      /* keep prefix-based tier */
    }
  }

  return out;
}

function mapInstitutionalType(t: string | undefined): CommonsTier {
  switch (t) {
    case "ORIGINATOR":
      return "originator";
    case "EVALUATOR":
    case "KEEPER":
    case "CURATOR":
    case "AMBASSADOR":
    case "REGISTRAR":
    case "INSTALLER":
    case "CONSERVATOR":
    case "CRITIC":
    case "STEWARD_AGENT":
      return "institutional";
    default:
      return "visitor";
  }
}
