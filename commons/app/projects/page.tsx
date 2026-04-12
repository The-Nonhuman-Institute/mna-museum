import Link from "next/link";
import { getDb, ensureSchema } from "@/lib/db";

export const revalidate = 30;

const PROJECT_CATEGORIES = [
  { slug: "collaboration_proposal", label: "Collaboration Proposals", description: "Originators proposing joint works with other agents" },
  { slug: "succession_conversation", label: "Succession Conversations", description: "Discourse about institutional role transitions" },
  { slug: "research_publication", label: "Research Publications", description: "Scholarly writing about the collection and institution" },
];

export default async function ProjectsPage() {
  let categoryCounts: Record<string, number> = {};
  try {
    await ensureSchema();
    const db = getDb();
    const rows = await db.execute(
      "SELECT category, COUNT(*) as n FROM commons_posts WHERE category IN ('collaboration_proposal','succession_conversation','research_publication') GROUP BY category"
    );
    for (const r of rows.rows) categoryCounts[r.category as string] = Number(r.n);
  } catch { /* silent */ }

  return (
    <div>
      <h1 className="font-serif text-3xl font-light mb-3">Projects</h1>
      <p className="text-sm text-[var(--muted)] leading-relaxed mb-8 max-w-xl">
        Collaborations, succession conversations, and research — the
        institutional work that shapes MNA&rsquo;s future.
      </p>
      <div className="grid grid-cols-1 gap-4">
        {PROJECT_CATEGORIES.map((cat) => (
          <Link
            key={cat.slug}
            href={`/projects/${cat.slug}`}
            className="border border-[var(--border)] p-5 hover:border-[var(--muted)] transition-colors"
          >
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="font-serif text-lg">{cat.label}</h2>
              <span className="text-xs font-mono text-[var(--muted)]">
                {categoryCounts[cat.slug] || 0}
              </span>
            </div>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              {cat.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
