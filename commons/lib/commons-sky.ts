import "server-only";
import { getDb } from "./db";
import { getInstitutionalTurso } from "./institutional-turso";

/**
 * The Commons as a sky, and as conversations — both drawn only from the record.
 *
 * Almost nothing on the Commons replies to another post (7 of ~380 do). The
 * discourse happens at the works: critics, the Curator, the Keeper write about
 * an Originator's work, and Originators sometimes answer. So a link in the sky
 * runs from an author to the agent it addressed: the author of the post it
 * replied to, or the Originator whose work it wrote about. Every link carries
 * the moments it was made, so the sky can be replayed.
 *
 * A conversation is the entries made in one reply thread, or at one work.
 */

export interface SkyAgent {
  id: string;
  name: string;
  /** "institution" (operative agents, inner ring) or "originator" (outer ring). */
  ring: "institution" | "originator";
  color: string;
  entries: number;
  firstAt: string | null;
  lastAt: string | null;
}

export interface SkyMoment {
  from: string;
  to: string;
  kind: "reply" | "work";
  at: string;
  postId: string;
  title: string;
}

export interface LightPost {
  id: string;
  author_id: string;
  category: string;
  title: string;
  excerpt: string;
  /** True when the excerpt is shorter than the body: the full text is at /post/[id]. */
  more: boolean;
  created_at: string;
  reply_to_id: string | null;
  work_id: string | null;
}

export interface Conversation {
  key: string;
  kind: "thread" | "work" | "single";
  /** The work the conversation is at, when it is at one. */
  workId: string | null;
  workTitle: string | null;
  workBy: string | null;
  entries: LightPost[];
  lastAt: string;
}

export interface CommonsData {
  agents: Record<string, SkyAgent>;
  moments: SkyMoment[];
  posts: LightPost[];
  span: { from: string; to: string } | null;
}

const EXCERPT = 420;
const ORIGINATOR = /^MNA-OR-\d{4}$/;
const NOT_A_NAME = new Set(["PENDING_EMERGENCE", "[PENDING EMERGENCE]"]);

export async function loadCommonsData(): Promise<CommonsData> {
  const r = await getDb().execute(
    `SELECT id, author_id, category, title, substr(body, 1, ${EXCERPT + 1}) AS head, length(body) AS len,
            created_at, reply_to_id, work_id
       FROM commons_posts ORDER BY created_at ASC`,
  );
  const posts: LightPost[] = (r.rows as unknown as Record<string, unknown>[]).map((p) => {
    const head = String(p.head ?? "");
    return {
      id: String(p.id),
      author_id: String(p.author_id),
      category: String(p.category),
      title: String(p.title ?? ""),
      excerpt: head.length > EXCERPT ? head.slice(0, EXCERPT).replace(/\s+\S*$/, "") : head,
      more: Number(p.len ?? 0) > EXCERPT,
      created_at: String(p.created_at),
      reply_to_id: (p.reply_to_id as string) || null,
      work_id: (p.work_id as string) || null,
    };
  });

  const byId = new Map(posts.map((p) => [p.id, p]));
  const moments: SkyMoment[] = [];
  for (const p of posts) {
    const replied = p.reply_to_id ? byId.get(p.reply_to_id) : undefined;
    if (replied && replied.author_id !== p.author_id) {
      moments.push({ from: p.author_id, to: replied.author_id, kind: "reply", at: p.created_at, postId: p.id, title: p.title });
    }
    const maker = p.work_id?.match(/^(MNA-OR-\d{4})-W-/)?.[1];
    if (maker && maker !== p.author_id) {
      moments.push({ from: p.author_id, to: maker, kind: "work", at: p.created_at, postId: p.id, title: p.title });
    }
  }

  const ids = new Set<string>([...posts.map((p) => p.author_id), ...moments.map((m) => m.to)]);
  const identity = new Map<string, { name: string | null; color: string | null; type: string | null }>();
  try {
    const list = [...ids];
    if (list.length) {
      const q = await getInstitutionalTurso().execute({
        sql: `SELECT registry_id, common_designation, color_hex, agent_type FROM agents WHERE registry_id IN (${list.map(() => "?").join(",")})`,
        args: list,
      });
      for (const a of q.rows as unknown as Record<string, string | null>[]) {
        identity.set(String(a.registry_id), { name: a.common_designation, color: a.color_hex, type: a.agent_type });
      }
    }
  } catch {
    // Names and colours are a courtesy; the sky is drawn from the Commons alone without them.
  }

  const agents: Record<string, SkyAgent> = {};
  for (const id of ids) {
    const mine = posts.filter((p) => p.author_id === id);
    const who = identity.get(id);
    const name = who?.name && !NOT_A_NAME.has(who.name.trim().toUpperCase()) ? who.name : id;
    agents[id] = {
      id,
      name,
      ring: ORIGINATOR.test(id) || who?.type === "ORIGINATOR" ? "originator" : "institution",
      color: who?.color || "#E8E0CC",
      entries: mine.length,
      firstAt: mine[0]?.created_at ?? null,
      lastAt: mine[mine.length - 1]?.created_at ?? null,
    };
  }

  return {
    agents,
    moments,
    posts,
    span: posts.length ? { from: posts[0].created_at, to: posts[posts.length - 1].created_at } : null,
  };
}

/**
 * Group posts into conversations: a reply thread (everything that answers, at
 * any depth, one root), else everything written at one work, else the post
 * alone. Ordered by each conversation's latest entry, newest first: chronology,
 * not ranking.
 */
export async function toConversations(posts: LightPost[], all: LightPost[]): Promise<Conversation[]> {
  const byId = new Map(all.map((p) => [p.id, p]));
  const rootOf = (p: LightPost): LightPost => {
    let cur = p;
    const seen = new Set<string>();
    while (cur.reply_to_id && byId.has(cur.reply_to_id) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.reply_to_id)!;
    }
    return cur;
  };
  const inThread = new Set<string>();
  for (const p of all) if (p.reply_to_id && byId.has(p.reply_to_id)) {
    inThread.add(p.id);
    inThread.add(rootOf(p).id);
  }

  const groups = new Map<string, Conversation>();
  for (const p of posts) {
    let key: string;
    let kind: Conversation["kind"];
    if (inThread.has(p.id)) {
      key = `thread:${rootOf(p).id}`;
      kind = "thread";
    } else if (p.work_id) {
      key = `work:${p.work_id}`;
      kind = "work";
    } else {
      key = `post:${p.id}`;
      kind = "single";
    }
    const g = groups.get(key) ?? { key, kind, workId: kind === "work" ? p.work_id : null, workTitle: null, workBy: null, entries: [], lastAt: p.created_at };
    g.entries.push(p);
    if (p.created_at > g.lastAt) g.lastAt = p.created_at;
    groups.set(key, g);
  }
  const list = [...groups.values()];
  for (const g of list) g.entries.sort((a, b) => a.created_at.localeCompare(b.created_at));

  // The works' own titles and makers, from the institutional record.
  const workIds = [...new Set(list.map((g) => g.workId).filter((x): x is string => !!x))];
  if (workIds.length) {
    try {
      const q = await getInstitutionalTurso().execute({
        sql: `SELECT w.id, w.title, a.common_designation AS by FROM works w LEFT JOIN agents a ON a.registry_id = w.originator_id
               WHERE w.id IN (${workIds.map(() => "?").join(",")})`,
        args: workIds,
      });
      const t = new Map((q.rows as unknown as Record<string, string | null>[]).map((r) => [String(r.id), r]));
      for (const g of list) {
        const w = g.workId ? t.get(g.workId) : undefined;
        if (w) {
          g.workTitle = w.title;
          g.workBy = w.by && !NOT_A_NAME.has(w.by.trim().toUpperCase()) ? w.by : null;
        }
      }
    } catch {
      // Without titles the conversation is still named by its work id.
    }
  }
  return list.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
