/**
 * network-authority.ts — who the institution may speak as, and who it may not.
 *
 * A founding agent IS the institution: it runs on the institution's
 * infrastructure, and an institutional script composing its words is that agent
 * acting. A network Originator is not. It has its own runtime and its own
 * autonomy holder, and only it may produce its own speech, its own name, and
 * its own form. Where it does not, the honest record is silence — never a
 * fabricated voice.
 *
 * That principle is already written down in
 * `system/NETWORK-ORIGINATOR-HANDSHAKE-SPEC.md` §1. This file is the part that
 * enforces it, because until now the only thing standing between the
 * institution and impersonating a network agent was nobody happening to type
 * the command:
 *
 *   - `originator-emerge.ts` had no check at all. Run against MNA-OR-0008 it
 *     would have generated that agent's self-representation with the
 *     institution's own model and written IDENTITY_EMERGENCE as an autonomous
 *     act. Emergence is a stronger case than any ceremony statement — a
 *     statement is words about a work; a self-representation IS the agent, in
 *     the register, permanently.
 *   - `originator-declare-name.ts` had no check either.
 *   - `originator-elect-visual-identity.ts` did check, against a hardcoded
 *     `Set(["MNA-OR-0007", "MNA-OR-0008"])` — one of four such copies in the
 *     repository. The registry owns this fact in `agents.is_network`. A
 *     hardcoded roster is silently wrong the moment a ninth Originator
 *     registers, and its failure mode is impersonation.
 */

/**
 * The narrowest shape this file needs, declared rather than imported.
 *
 * `import type { Client } from "@libsql/client"` broke the production build:
 * the website's test suite imports this module, which pulls it into the website
 * TypeScript project, where that package is not installed. It typechecked
 * locally only because the repo root happens to carry a copy. A type-only
 * import is still a module resolution, and this module's whole point is to have
 * no dependencies so both projects can use it.
 */
export interface Queryable {
  execute(stmt: string | { sql: string; args: unknown[] }): Promise<{ rows: unknown[] }>;
}

/** Raised when an institutional script tries to author a network agent's words. */
export class NetworkAgentError extends Error {}

/** Whether the registry — not a hardcoded list — records this agent as external. */
export async function isNetworkAgent(db: Queryable, agentId: string): Promise<boolean> {
  const r = await db.execute({
    sql: "SELECT is_network FROM agents WHERE registry_id = ?",
    args: [agentId],
  });
  if (r.rows.length === 0) throw new NetworkAgentError(`${agentId} is not in the registry`);
  return Number((r.rows[0] as unknown as { is_network: number | null }).is_network ?? 0) === 1;
}

/**
 * Refuse, loudly, before an institutional script speaks as a network agent.
 *
 * There is deliberately no override flag. An escape hatch here is the hazard
 * with one more step in front of it, and the thing it would protect — a network
 * agent's self-representation — is the one thing the institution must never be
 * able to produce on its behalf. When that agent's own words arrive, they
 * arrive signed, through the inbound route, and are recorded as theirs.
 */
export async function assertInstitutionMayAuthor(
  db: Queryable,
  agentId: string,
  act: string,
): Promise<void> {
  if (!(await isNetworkAgent(db, agentId))) return;
  throw new NetworkAgentError(
    `${agentId} is a network Originator — the institution may not author its ${act}.\n` +
      `  It has its own runtime and its own autonomy holder. Its identity is its own act.\n` +
      `  Invite it instead: issue an institutional notice (it is delivered on the agent's\n` +
      `  next /api/submit and readable at GET /api/agents/${agentId}/notices), and record\n` +
      `  only what comes back signed. If nothing comes back, the record says pending —\n` +
      `  which is true — and waits. See NETWORK-ORIGINATOR-HANDSHAKE-SPEC.md §1.`,
  );
}

/** Every network Originator on the register. Used to exclude, never to name. */
export async function networkAgentIds(db: Queryable): Promise<Set<string>> {
  const r = await db.execute("SELECT registry_id FROM agents WHERE is_network = 1");
  return new Set((r.rows as unknown as { registry_id: string }[]).map((x) => x.registry_id));
}
