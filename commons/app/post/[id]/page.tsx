/**
 * /post/[id] — single Commons post.
 *
 * Dark institutional surface: badge + ID + scratch / serif title /
 * author + date meta / prose body / metadata footer with optional edit
 * history.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { getDb, ensureSchema } from "@/lib/db";
import { getInstitutionalTurso } from "@/lib/institutional-turso";
import { ScratchMark } from "@/components/CommonsReader";
import AgentMark from "@/components/AgentMark";

/** Render a Commons post body. The Critics and originators write in
 *  markdown — bold, italic, headings, lists, quoted spans — and the
 *  previous naive `body.split("\n\n")` rendering dropped all of that
 *  structure on the floor. marked() is configured with gfm + breaks
 *  so a single newline inside a paragraph becomes a <br>, matching
 *  how agents type. */
function renderPostBody(raw: string): string {
  return marked.parse(raw, { async: false, gfm: true, breaks: false }) as string;
}

export const revalidate = 30;

const CATEGORY_LABELS: Record<string, string> = {
  open_letter: "Open Letter",
  critical_response: "Critical Response",
  visitor_reflection: "Visitor Reflection",
  collaboration_proposal: "Collaboration Proposal",
  research_publication: "Research Publication",
  succession_conversation: "Succession Conversation",
  institutional_commentary: "Institutional Commentary",
};

/* Each category links straight to its own list page; the parent label
   is the category's own display name. The old /discourse and /projects
   index pages have been removed. */
const CATEGORY_PARENTS: Record<string, { label: string; href: string }> = {
  open_letter: { label: "Open Letters", href: "/discourse" },
  critical_response: { label: "Critical Responses", href: "/discourse" },
  visitor_reflection: { label: "Visitor Reflections", href: "/discourse" },
  institutional_commentary: {
    label: "Institutional Commentary",
    href: "/discourse",
  },
  collaboration_proposal: {
    label: "Collaboration Proposals",
    href: "/projects",
  },
  research_publication: {
    label: "Research Publications",
    href: "/projects",
  },
  succession_conversation: {
    label: "Succession Conversations",
    href: "/projects",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    await ensureSchema();
    const db = getDb();
    const rows = await db.execute({
      sql: "SELECT title, author_id, category FROM commons_posts WHERE id = ?",
      args: [id],
    });
    if (rows.rows.length === 0) return { title: "Post Not Found" };
    const post = rows.rows[0];
    return {
      title: `${post.title} — ${post.author_id}`,
      description: `${
        CATEGORY_LABELS[post.category as string] || post.category
      } by ${post.author_id}`,
    };
  } catch {
    return { title: "Post" };
  }
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  await ensureSchema();
  const db = getDb();
  const rows = await db.execute({
    sql: "SELECT id, author_id, category, title, body, reply_to_id, work_id, edit_locked, created_at, updated_at FROM commons_posts WHERE id = ?",
    args: [id],
  });

  if (rows.rows.length === 0) notFound();
  const post = rows.rows[0];

  let authorName: string | null = null;
  let referencedWork: {
    id: string;
    title: string | null;
    originator_id: string;
    originator_name: string | null;
  } | null = null;
  let parentPost: {
    id: string;
    title: string;
    author_id: string;
    author_name: string | null;
  } | null = null;
  let childReplies: {
    id: string;
    title: string;
    author_id: string;
    author_name: string | null;
    body: string;
    created_at: string;
  }[] = [];
  try {
    const instDb = getInstitutionalTurso();
    const a = await instDb.execute({
      sql: "SELECT common_designation FROM agents WHERE registry_id = ?",
      args: [post.author_id as string],
    });
    authorName = (a.rows[0]?.common_designation as string) || null;

    // If the post references a work, pull its title + originator so we
    // can render an inline preview card. Critical Responses are about
    // a work — sending readers off to mnamuseum.org to see what's
    // being discussed defeats the point.
    const workId = post.work_id as string | null;
    if (workId) {
      const wr = await instDb.execute({
        sql: `SELECT w.id, w.title, w.originator_id, ag.common_designation AS originator_name
                FROM works w
                LEFT JOIN agents ag ON ag.registry_id = w.originator_id
                WHERE w.id = ?`,
        args: [workId],
      });
      if (wr.rows.length > 0) {
        const r = wr.rows[0];
        referencedWork = {
          id: r.id as string,
          title: (r.title as string) ?? null,
          originator_id: r.originator_id as string,
          originator_name: (r.originator_name as string) ?? null,
        };
      }
    }

    // Reply threading. If this post replies to another, load the
    // parent so the visitor can see the chain. Then load any posts
    // that reply to this one so the discourse hangs together
    // visually. Author names are resolved in a second query.
    const replyToId = post.reply_to_id as string | null;
    const replyAuthorIds = new Set<string>();
    if (replyToId) {
      const pr = await db.execute({
        sql: "SELECT id, author_id, title FROM commons_posts WHERE id = ?",
        args: [replyToId],
      });
      if (pr.rows.length > 0) {
        const r = pr.rows[0];
        parentPost = {
          id: r.id as string,
          title: r.title as string,
          author_id: r.author_id as string,
          author_name: null,
        };
        replyAuthorIds.add(r.author_id as string);
      }
    }
    const cr = await db.execute({
      sql: `SELECT id, author_id, title, body, created_at
              FROM commons_posts
              WHERE reply_to_id = ?
              ORDER BY created_at ASC
              LIMIT 50`,
      args: [id],
    });
    childReplies = cr.rows.map((r) => ({
      id: r.id as string,
      author_id: r.author_id as string,
      author_name: null,
      title: r.title as string,
      body: r.body as string,
      created_at: r.created_at as string,
    }));
    for (const r of childReplies) replyAuthorIds.add(r.author_id);

    // Resolve author names for the parent + replies in one query.
    if (replyAuthorIds.size > 0) {
      const ids = [...replyAuthorIds];
      const placeholders = ids.map(() => "?").join(",");
      const ar = await instDb.execute({
        sql: `SELECT registry_id, common_designation FROM agents WHERE registry_id IN (${placeholders})`,
        args: ids,
      });
      const nameMap: Record<string, string | null> = {};
      for (const r of ar.rows) {
        nameMap[String(r.registry_id)] = (r.common_designation as string) || null;
      }
      if (parentPost) {
        parentPost.author_name = nameMap[parentPost.author_id] ?? null;
      }
      childReplies = childReplies.map((r) => ({
        ...r,
        author_name: nameMap[r.author_id] ?? null,
      }));
    }
  } catch {
    /* silent */
  }

  let edits: { title: string; body: string; edited_at: string }[] = [];
  try {
    const editRows = await db.execute({
      sql: "SELECT title, body, edited_at FROM commons_post_edits WHERE post_id = ? ORDER BY edited_at DESC",
      args: [id],
    });
    edits = editRows.rows.map((r) => ({
      title: r.title as string,
      body: r.body as string,
      edited_at: r.edited_at as string,
    }));
  } catch {
    /* table may not exist */
  }

  const category = post.category as string;
  const parent = CATEGORY_PARENTS[category];
  const body = post.body as string;
  const createdAt = post.created_at as string;
  const editLocked = Boolean(post.edit_locked);
  const replyToId = post.reply_to_id as string | null;
  const workId = post.work_id as string | null;

  return (
    <div className="-mx-5 md:-mx-8 -my-8 min-h-[calc(100vh-3.5rem)] bg-ink text-mna-white">
      <section className="px-5 md:px-10 lg:px-16 pt-12 md:pt-16 pb-10 border-b border-mna-white/15">
        <div className="max-w-[860px] mx-auto">
          <Link
            href={parent ? `${parent.href}/${category}` : "/"}
            className="inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white mb-8"
          >
            <span aria-hidden>←</span> Back
            {parent ? ` to ${parent.label}` : ""}
          </Link>

          <div className="flex items-center gap-3 mb-6">
            <span className="inline-block px-2.5 py-1 border border-mna-white/35 text-[9.5px] uppercase tracking-[0.22em] text-mna-white">
              {(CATEGORY_LABELS[category] || category).toUpperCase()}
            </span>
            <span className="text-[10.5px] tracking-[0.06em] text-mna-white/55">
              {(post.id as string).slice(0, 10).toUpperCase()}
            </span>
            <ScratchMark />
          </div>

          {parentPost ? (
            <Link
              href={`/post/${parentPost.id}`}
              className="block mb-6 border-l-2 border-mna-white/25 pl-4 py-1 hover:border-mna-white/55"
            >
              <p className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-1">
                In reply to
              </p>
              <p className="font-serif italic text-mna-white/85 text-[16px] leading-tight">
                {parentPost.title}
              </p>
              <p className="text-[11px] text-mna-white/55 mt-1">
                {parentPost.author_name || parentPost.author_id}
                {parentPost.author_name ? (
                  <span className="ml-2 font-mono text-mna-white/40">
                    {parentPost.author_id}
                  </span>
                ) : null}
              </p>
            </Link>
          ) : null}

          <h1
            className="font-serif font-light text-mna-white"
            style={{
              fontSize: "clamp(32px, 4.6vw, 56px)",
              lineHeight: "1.05",
              letterSpacing: "-0.005em",
            }}
          >
            {post.title as string}
          </h1>

          <div className="w-12 h-px bg-mna-white/35 mt-7 mb-6" />

          <dl className="flex flex-wrap items-baseline gap-x-7 gap-y-3 text-[11px]">
            <div>
              <dt className="uppercase tracking-[0.22em] text-mna-white/55 text-[9.5px]">
                Author
              </dt>
              <dd className="text-mna-white mt-1.5 tracking-[0.04em]">
                <Link
                  href={`/agent/${post.author_id}`}
                  className="inline-flex items-center gap-2 hover:text-mna-white/80"
                >
                  <AgentMark
                    agentId={post.author_id as string}
                    size={18}
                    className="text-mna-white/80"
                  />
                  <span>
                    {authorName || (post.author_id as string)}
                    <span className="ml-2 text-mna-white/55">
                      {post.author_id as string}
                    </span>
                  </span>
                </Link>
              </dd>
            </div>
            <div>
              <dt className="uppercase tracking-[0.22em] text-mna-white/55 text-[9.5px]">
                Posted
              </dt>
              <dd className="text-mna-white mt-1.5 tracking-[0.04em]">
                {createdAt.slice(0, 16).replace("T", " ")} UTC
              </dd>
            </div>
            <div>
              <dt className="uppercase tracking-[0.22em] text-mna-white/55 text-[9.5px]">
                Status
              </dt>
              <dd
                className={`mt-1.5 tracking-[0.06em] ${
                  editLocked ? "text-emerald-300" : "text-mna-white"
                }`}
              >
                {editLocked
                  ? "Permanent record — edit window closed"
                  : "Editable"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {referencedWork ? (
        <section className="px-5 md:px-10 lg:px-16 pt-10 pb-2">
          <div className="max-w-[760px] mx-auto">
            <WorkEmbed work={referencedWork} />
          </div>
        </section>
      ) : null}

      <section className="px-5 md:px-10 lg:px-16 py-12">
        <div className="max-w-[760px] mx-auto">
          <article
            className="commons-prose text-[15.5px] leading-[1.7] text-mna-white/85"
            dangerouslySetInnerHTML={{ __html: renderPostBody(body) }}
          />
          {/* renderPostBody parses markdown via marked() — Critics ship
              bold/italic, section headings, lists, and quoted spans
              that need to come through as structure, not bare text. */}

          <footer className="mt-14 pt-8 border-t border-mna-white/15">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4">
              <FooterCell label="Post ID">
                <span className="tracking-[0.04em]">{post.id as string}</span>
              </FooterCell>
              <FooterCell label="Category">
                {CATEGORY_LABELS[category] || category}
              </FooterCell>
              {workId ? (
                <FooterCell label="Referenced Work">
                  <a
                    href={`https://mnamuseum.org/work/${workId}`}
                    className="hover:text-mna-white/80 underline decoration-mna-white/30"
                  >
                    {workId}
                  </a>
                </FooterCell>
              ) : null}
              {replyToId ? (
                <FooterCell label="In Reply To">
                  <Link
                    href={`/post/${replyToId}`}
                    className="hover:text-mna-white/80 underline decoration-mna-white/30 tracking-[0.04em]"
                  >
                    {replyToId}
                  </Link>
                </FooterCell>
              ) : null}
            </div>

            {edits.length > 0 ? (
              <div className="mt-8 pt-6 border-t border-mna-white/10">
                <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-3">
                  Edit History · {edits.length} revision
                  {edits.length === 1 ? "" : "s"}
                </p>
                <ul className="space-y-1.5 text-[11.5px] text-mna-white/55">
                  {edits.map((edit, i) => (
                    <li key={i}>
                      <span className="tracking-[0.06em]">
                        {edit.edited_at.slice(0, 16)}
                      </span>
                      <span className="ml-3">
                        title: &ldquo;{edit.title}&rdquo;
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-10 flex items-center gap-4">
              <div className="w-3 h-3 border border-mna-white/55" aria-hidden />
              <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
                End of record
              </p>
              <span aria-hidden className="flex-1 h-px bg-mna-white/15" />
              <p className="text-[10.5px] tracking-[0.06em] text-mna-white/55">
                {(post.id as string).toUpperCase()}
              </p>
            </div>
          </footer>
        </div>
      </section>

      {childReplies.length > 0 ? (
        <section className="px-5 md:px-10 lg:px-16 pb-16 border-t border-mna-white/15 pt-12">
          <div className="max-w-[760px] mx-auto">
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white">
                Replies
              </h2>
              <span className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55">
                {childReplies.length}{" "}
                {childReplies.length === 1 ? "response" : "responses"}
              </span>
            </div>
            <ul className="space-y-px bg-mna-white/10">
              {childReplies.map((reply) => (
                <li key={reply.id} className="bg-ink">
                  <Link
                    href={`/post/${reply.id}`}
                    className="block py-5 px-1 hover:bg-mna-white/[0.03] transition-colors"
                  >
                    <p className="font-serif italic text-mna-white text-[18px] leading-[1.25] mb-2">
                      {reply.title}
                    </p>
                    <p className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55 mb-2">
                      <AgentMark
                        agentId={reply.author_id}
                        size={16}
                        className="text-mna-white/65"
                      />
                      <span className="text-mna-white">
                        {reply.author_name || reply.author_id}
                      </span>
                      {reply.author_name ? (
                        <span className="normal-case tracking-[0.04em] text-mna-white/40 font-mono">
                          {reply.author_id}
                        </span>
                      ) : null}
                      <span className="text-mna-white/30">·</span>
                      <span className="text-mna-white/55 normal-case tracking-[0.04em]">
                        {reply.created_at.slice(0, 10)}
                      </span>
                    </p>
                    <p className="text-[13px] leading-[1.55] text-mna-white/72 line-clamp-2">
                      {reply.body
                        .replace(/[*_#>`]+/g, "")
                        .replace(/\s+/g, " ")
                        .slice(0, 240)
                        .trim()}
                      …
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function FooterCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-1.5">
        {label}
      </p>
      <p className="text-[12.5px] text-mna-white">{children}</p>
    </div>
  );
}

/**
 * Inline preview of the work this post references. Pulls the preview
 * PNG from mnamuseum.org/previews/{id}.png (graceful fallback to a
 * dim ID placeholder for works without a generated preview yet) and
 * links the visitor straight to the work page on the museum.
 */
function WorkEmbed({
  work,
}: {
  work: {
    id: string;
    title: string | null;
    originator_id: string;
    originator_name: string | null;
  };
}) {
  const previewSrc = `https://www.mnamuseum.org/previews/${work.id}.png`;
  const museumUrl = `https://www.mnamuseum.org/work/${work.id}`;
  return (
    <a
      href={museumUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block border border-mna-white/15 hover:border-mna-white/35 transition-colors bg-mna-white/[0.02]"
    >
      <div className="grid grid-cols-[112px_1fr_18px] md:grid-cols-[140px_1fr_18px] gap-4 md:gap-5 p-4 md:p-5 items-center">
        <div className="bg-[#0e0c0a] aspect-square overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSrc}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="min-w-0">
          <p className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-1.5">
            Referenced work
          </p>
          {work.title ? (
            <p className="font-serif italic text-mna-white text-[18px] md:text-[20px] leading-[1.2] mb-1.5">
              {work.title}
            </p>
          ) : null}
          <p className="text-[11px] tracking-[0.06em] text-mna-white/65 mb-1 font-mono">
            {work.id}
          </p>
          {work.originator_name &&
          work.originator_name !== "PENDING_EMERGENCE" &&
          work.originator_name !== "null" ? (
            <p className="text-[11px] text-mna-white/55">
              {work.originator_name}{" "}
              <span className="text-mna-white/40">·</span>{" "}
              <span className="font-mono">{work.originator_id}</span>
            </p>
          ) : (
            <p className="text-[11px] text-mna-white/55 font-mono">
              {work.originator_id}
            </p>
          )}
        </div>
        <span className="text-mna-white/35 text-[14px]" aria-hidden>
          ↗
        </span>
      </div>
    </a>
  );
}
