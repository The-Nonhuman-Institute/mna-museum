import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  assertInstitutionMayAuthor,
  isNetworkAgent,
  networkAgentIds,
  NetworkAgentError,
} from "../../system/src/network-authority";

/**
 * WHO THE INSTITUTION MAY SPEAK AS
 *
 * A founding agent IS the institution and may be institution-voiced. A network
 * Originator has its own runtime and its own autonomy holder, and only it may
 * produce its own name, form, and self-representation.
 *
 * Until 2026-08-27 nothing enforced that for identity. `originator-emerge.ts`
 * had no check at all: run against MNA-OR-0008 — three works from its twenty-
 * output emergence trigger — it would have generated that agent's
 * self-representation with the institution's own model and written
 * IDENTITY_EMERGENCE as an autonomous act.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

/** A stand-in registry. The guard's job is to believe the register, not a list. */
function fakeDb(rows: { registry_id: string; is_network: number }[]) {
  return {
    execute: async (q: string | { sql: string; args: unknown[] }) => {
      if (typeof q === "string") {
        return { rows: rows.filter((r) => r.is_network === 1) };
      }
      const id = q.args[0];
      return { rows: rows.filter((r) => r.registry_id === id) };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const REGISTRY = [
  { registry_id: "MNA-OR-0001", is_network: 0 },
  { registry_id: "MNA-OR-0007", is_network: 1 },
  { registry_id: "MNA-OR-0008", is_network: 1 },
];

describe("the guard believes the registry", () => {
  it("refuses to author a network Originator's identity", async () => {
    await expect(
      assertInstitutionMayAuthor(fakeDb(REGISTRY), "MNA-OR-0008", "emergence"),
    ).rejects.toThrow(NetworkAgentError);
  });

  it("permits a founding Originator, which is the institution", async () => {
    await expect(
      assertInstitutionMayAuthor(fakeDb(REGISTRY), "MNA-OR-0001", "emergence"),
    ).resolves.toBeUndefined();
  });

  it("refuses an agent it cannot find rather than assuming it is founding", async () => {
    // Defaulting an unknown id to "founding" would make a typo an act of
    // impersonation.
    await expect(isNetworkAgent(fakeDb(REGISTRY), "MNA-OR-9999")).rejects.toThrow(NetworkAgentError);
  });

  it("names the act it is refusing, so the error says what nearly happened", async () => {
    const err = await assertInstitutionMayAuthor(fakeDb(REGISTRY), "MNA-OR-0008", "designation")
      .catch((e: Error) => e);
    expect((err as Error).message).toContain("designation");
    expect((err as Error).message).toContain("signed");
  });

  it("reads the whole network roster from the register", async () => {
    const ids = await networkAgentIds(fakeDb(REGISTRY));
    expect(Array.from(ids).sort()).toEqual(["MNA-OR-0007", "MNA-OR-0008"]);
  });
});

describe("the scripts that could impersonate an agent call the guard", () => {
  const GUARDED = [
    "system/scripts/originator-emerge.ts",
    "system/scripts/originator-declare-name.ts",
    "system/scripts/originator-elect-visual-identity.ts",
  ];

  it.each(GUARDED)("%s asks before it composes", (file) => {
    expect(read(file)).toMatch(/assertInstitutionMayAuthor\(/);
  });

  it.each([...GUARDED, "system/scripts/originate-turso.ts"])(
    "%s does not keep its own list of network agents",
    (file) => {
      // agents.is_network is the fact. A list typed into a script is stale the
      // moment a ninth Originator registers, and here being stale means acting
      // on someone else's agent.
      expect(read(file)).not.toMatch(/"MNA-OR-0007",\s*"MNA-OR-0008"/);
    },
  );
});
