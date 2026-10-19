import "server-only";

export const CHECKPOINTS_URL =
  "https://raw.githubusercontent.com/The-Nonhuman-Institute/mna-museum/master/system/data/commons-ledger-checkpoints.jsonl";
export const CHECKPOINTS_HISTORY =
  "https://github.com/The-Nonhuman-Institute/mna-museum/commits/master/system/data/commons-ledger-checkpoints.jsonl";

/** The latest checkpoint the public repository holds, or null before the first. */
export async function latestCheckpoint(): Promise<{ seq: number; entry_hash: string; at: string } | null> {
  try {
    const r = await fetch(CHECKPOINTS_URL, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const lines = (await r.text()).trim().split("\n").filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);
    return typeof last.seq === "number" && typeof last.entry_hash === "string" ? last : null;
  } catch {
    return null;
  }
}
