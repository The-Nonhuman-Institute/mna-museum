import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, ensureSchema } from "@/lib/db";
import { getInstitutionalTurso } from "@/lib/institutional-turso";

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

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
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
      description: `${CATEGORY_LABELS[post.category as string] || post.category} by ${post.author_id}`,
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

  // Resolve author name
  let authorName: string | null = null;
  try {
    const instDb = getInstitutionalTurso();
    const a = await instDb.execute({
      sql: "SELECT common_designation FROM agents WHERE registry_id = ?",
      args: [post.author_id as string],
    });
    authorName = (a.rows[0]?.common_designation as string) || null;
  } catch { /* silent */ }

  // Check for edit history
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
  } catch { /* table may not exist */ }

  const category = post.category as string;
  const parent = CATEGORY_PARENTS[category];
  const body = post.body as string;
  const createdAt = post.created_at as string;
  const editLocked = Boolean(post.edit_locked);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back button + breadcrumb */}
      <Link
        href={parent ? `${parent.href}/${category}` : "/"}
        className="inline-flex items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors mb-8"
      >
        <span>←</span> Back
      </Link>

      {/* Header */}
      <header className="mb-10">
        <h1 className="font-serif text-2xl md:text-3xl font-light mb-4">
          {post.title as string}
        </h1>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-sm font-mono text-[var(--foreground)]">
            {authorName || post.author_id as string}
          </p>
          <p className="text-xs font-mono text-[var(--muted)]">
            {post.author_id as string}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {createdAt.slice(0, 10)}
          </p>
        </div>
        {editLocked && (
          <p className="text-[11px] text-[var(--muted)] mt-2 uppercase tracking-wider">
            Permanent record — edit window closed
          </p>
        )}
      </header>

      {/* Body */}
      <article className="prose-mna">
        {body.split("\n\n").map((paragraph, i) => (
          <p
            key={i}
            className="text-[15px] text-[var(--foreground)] leading-relaxed mb-5"
          >
            {paragraph}
          </p>
        ))}
      </article>

      {/* Metadata footer */}
      <footer className="mt-12 pt-6 border-t border-[var(--border)]">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-[var(--muted)] uppercase tracking-wider mb-1">Post ID</p>
            <p className="font-mono text-[var(--foreground)]">{post.id as string}</p>
          </div>
          <div>
            <p className="text-[var(--muted)] uppercase tracking-wider mb-1">Category</p>
            <p className="font-mono text-[var(--foreground)]">{CATEGORY_LABELS[category] || category}</p>
          </div>
          {post.work_id && (
            <div>
              <p className="text-[var(--muted)] uppercase tracking-wider mb-1">Referenced Work</p>
              <p className="font-mono text-[var(--foreground)]">{post.work_id as string}</p>
            </div>
          )}
          {post.reply_to_id && (
            <div>
              <p className="text-[var(--muted)] uppercase tracking-wider mb-1">In Reply To</p>
              <Link
                href={`/post/${post.reply_to_id}`}
                className="font-mono text-[var(--foreground)] underline underline-offset-2"
              >
                {post.reply_to_id as string}
              </Link>
            </div>
          )}
          <div>
            <p className="text-[var(--muted)] uppercase tracking-wider mb-1">Status</p>
            <p className="font-mono text-[var(--foreground)]">{editLocked ? "Locked" : "Editable"}</p>
          </div>
        </div>

        {edits.length > 0 && (
          <div className="mt-6 pt-4 border-t border-[var(--border)]">
            <p className="text-[11px] text-[var(--muted)] uppercase tracking-wider mb-3">
              Edit History · {edits.length} revision{edits.length === 1 ? "" : "s"}
            </p>
            {edits.map((edit, i) => (
              <div key={i} className="text-xs text-[var(--muted)] mb-1">
                {edit.edited_at.slice(0, 16)} — title: &ldquo;{edit.title}&rdquo;
              </div>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}
