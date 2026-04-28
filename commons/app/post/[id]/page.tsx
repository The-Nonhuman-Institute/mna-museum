/**
 * /post/[id] — single Commons post.
 *
 * Dark institutional surface: badge + ID + scratch / serif title /
 * author + date meta / prose body / metadata footer with optional edit
 * history.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, ensureSchema } from "@/lib/db";
import { getInstitutionalTurso } from "@/lib/institutional-turso";
import { ScratchMark } from "@/components/CommonsReader";

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

const CATEGORY_PARENTS: Record<string, { label: string; href: string }> = {
  open_letter: { label: "Discourse", href: "/discourse" },
  critical_response: { label: "Discourse", href: "/discourse" },
  visitor_reflection: { label: "Discourse", href: "/discourse" },
  institutional_commentary: { label: "Discourse", href: "/discourse" },
  collaboration_proposal: { label: "Projects", href: "/projects" },
  research_publication: { label: "Projects", href: "/projects" },
  succession_conversation: { label: "Projects", href: "/projects" },
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
  try {
    const instDb = getInstitutionalTurso();
    const a = await instDb.execute({
      sql: "SELECT common_designation FROM agents WHERE registry_id = ?",
      args: [post.author_id as string],
    });
    authorName = (a.rows[0]?.common_designation as string) || null;
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
                  className="hover:text-mna-white/80"
                >
                  {authorName || (post.author_id as string)}
                  <span className="ml-2 text-mna-white/55">
                    {post.author_id as string}
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

      <section className="px-5 md:px-10 lg:px-16 py-12">
        <div className="max-w-[760px] mx-auto">
          <article className="space-y-5 text-[15.5px] leading-[1.7] text-mna-white/85">
            {body.split("\n\n").map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </article>

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
