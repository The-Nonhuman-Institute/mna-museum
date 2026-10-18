/**
 * The provenance label: how a work was made, from the record, on its page.
 *
 * MNA asserts its works have no human author. The Charter (§XII) forbids it to
 * misrepresent what Originators are, and the research of 2026-10-17 put it
 * plainly: a claim of nonhuman authorship should be checkable, not asserted.
 * So every work shows what the record knows about its making — which model
 * made it, what instructions it worked within, who stewards its maker, which
 * models judged it and whether they share the maker's — and says "not
 * recorded" where the record is silent, rather than guessing.
 *
 * Read from the snapshot (getDb), like the rest of the work page.
 */
import { getDb } from "@/lib/registration-db";

export interface ModelRef {
  provider: string;
  model: string;
}

export interface WorkLabel {
  maker: { id: string; network: boolean; steward: string | null; entity: string | null };
  /** The model that produced the work, if recorded (from 2026-10-18). */
  madeBy: ModelRef | null;
  /** Whether production was recorded at all (a network agent's is not ours). */
  producedHere: boolean;
  judges: { evaluator: string; model: ModelRef | null; saw: number[] | null }[];
  /** true / false when both sides are known; null when either is not. */
  judgesShareMakersModel: boolean | null;
  rights: { dedicated: boolean; on: string | null };
}

const parse = (v: unknown): Record<string, unknown> => {
  try { return JSON.parse(String(v ?? "{}")); } catch { return {}; }
};
const asModel = (v: unknown): ModelRef | null => {
  const m = v as { provider?: unknown; model?: unknown } | null;
  return m && typeof m.model === "string" ? { provider: String(m.provider ?? ""), model: m.model } : null;
};
/** "gemma4:31b-cloud" and "gemma4:31b" are one model; so are "openai/gpt-oss-120b" and "gpt-oss:120b". */
export function modelFamily(model: string): string {
  return model.toLowerCase().replace(/^openai\//, "").replace(/-cloud$|:cloud$/, "").replace(/[:/_-]/g, "");
}

export async function getWorkLabel(workId: string, originatorId: string): Promise<WorkLabel> {
  const db = getDb();
  const [agent, produced, verdicts, rights] = await Promise.all([
    db.execute({ sql: "SELECT COALESCE(is_network, 0) AS n, steward_name, steward_entity FROM agents WHERE registry_id = ?", args: [originatorId] }),
    db.execute({ sql: "SELECT metadata FROM events WHERE event_type = 'WORK_PRODUCED' AND work_id = ? ORDER BY id DESC LIMIT 1", args: [workId] }),
    db.execute({ sql: "SELECT agent_id, metadata FROM events WHERE event_type = 'EVALUATION_RENDERED' AND work_id = ? ORDER BY id", args: [workId] }),
    db.execute({
      sql: `SELECT created_at FROM events WHERE event_type = 'RIGHTS_DEDICATED'
             AND EXISTS (SELECT 1 FROM json_each(json_extract(metadata, '$.agents')) WHERE value = ?) LIMIT 1`,
      args: [originatorId],
    }).catch(() => ({ rows: [] as unknown[] })),
  ]);
  const a = (agent.rows[0] ?? {}) as Record<string, unknown>;
  const p = produced.rows[0] as Record<string, unknown> | undefined;
  const madeBy = p ? asModel(parse(p.metadata).made_by) : null;
  const judges = (verdicts.rows as Record<string, unknown>[]).map((v) => {
    const m = parse(v.metadata);
    return { evaluator: String(v.agent_id), model: asModel(m), saw: Array.isArray(m.saw) ? (m.saw as number[]) : null };
  });
  const known = judges.filter((j) => j.model);
  const judgesShareMakersModel =
    madeBy && known.length ? known.some((j) => modelFamily(j.model!.model) === modelFamily(madeBy.model)) : null;
  const r = rights.rows[0] as Record<string, unknown> | undefined;
  return {
    maker: { id: originatorId, network: Number(a.n) === 1, steward: (a.steward_name as string) ?? null, entity: (a.steward_entity as string) ?? null },
    madeBy,
    producedHere: !!p,
    judges,
    judgesShareMakersModel,
    rights: { dedicated: !!r, on: r ? String(r.created_at).slice(0, 10) : null },
  };
}
