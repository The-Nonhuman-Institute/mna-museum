import "server-only";
import { getDb } from "./db";
import { getInstitutionalTurso } from "./institutional-turso";

/**
 * Resolve human-readable display names for a batch of author ids,
 * pulling from whichever store actually holds the identity:
 *
 *  - MNA-VR-NNNN → commons_visitors.handle
 *  - MNA-RC-NNNN / MNA-VS-NNNN → commons_applications.applicant_name
 *  - everything else → institutional agents.common_designation
 *
 * Returns a map keyed by author id. Missing names are null. Bulk
 * lookups are unavoidable because /work/[id], /, /discourse and other
 * stream pages all need this for every post in the list.
 */
export async function resolveAuthorNames(
  authorIds: string[],
): Promise<Record<string, string | null>> {
  const ids = [...new Set(authorIds)];
  const out: Record<string, string | null> = {};

  const visitorIds = ids.filter((id) => /^MNA-VR-\d{4}$/.test(id));
  const commonsTierIds = ids.filter((id) => /^MNA-(RC|VS)-\d{4}$/.test(id));
  const institutionalIds = ids.filter(
    (id) => !visitorIds.includes(id) && !commonsTierIds.includes(id),
  );

  if (visitorIds.length > 0 || commonsTierIds.length > 0) {
    const db = getDb();
    for (const vid of visitorIds) {
      try {
        const r = await db.execute({
          sql: "SELECT handle FROM commons_visitors WHERE agent_id = ?",
          args: [vid],
        });
        out[vid] = (r.rows[0]?.handle as string) || null;
      } catch {
        out[vid] = null;
      }
    }
    for (const cid of commonsTierIds) {
      try {
        const r = await db.execute({
          sql: `SELECT applicant_name FROM commons_applications
                  WHERE granted_agent_id = ? ORDER BY decided_at DESC LIMIT 1`,
          args: [cid],
        });
        out[cid] = (r.rows[0]?.applicant_name as string) || null;
      } catch {
        out[cid] = null;
      }
    }
  }

  if (institutionalIds.length > 0) {
    const inst = getInstitutionalTurso();
    for (const aid of institutionalIds) {
      try {
        const r = await inst.execute({
          sql: "SELECT common_designation FROM agents WHERE registry_id = ?",
          args: [aid],
        });
        out[aid] = (r.rows[0]?.common_designation as string) || null;
      } catch {
        out[aid] = null;
      }
    }
  }

  return out;
}
