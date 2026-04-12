import { getInstitutionalTurso } from "@/lib/institutional-turso";
import ActionCard from "@/components/ActionCard";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface GovDoc {
  id: string;
  title: string;
  version: string;
  status: string;
  drafted_at: string;
  ratified_at: string | null;
}

export default async function GovernancePage() {
  let docs: GovDoc[] = [];
  try {
    const db = getInstitutionalTurso();
    const rows = await db.execute(
      "SELECT id, title, version, status, drafted_at, ratified_at FROM governance_documents ORDER BY drafted_at DESC"
    );
    docs = rows.rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      version: r.version as string,
      status: r.status as string,
      drafted_at: r.drafted_at as string,
      ratified_at: (r.ratified_at as string) || null,
    }));
  } catch (err) {
    console.error("[governance] failed to load:", err);
  }

  const pending = docs.filter((d) => d.status === "pending");
  const ratified = docs.filter((d) => d.status === "ratified");

  return (
    <section className="px-5 py-6">
      <div className="mb-6">
        <p className="label mb-2">Institutional Law</p>
        <h1 className="display text-3xl">Governance</h1>
      </div>

      {pending.length > 0 && (
        <div className="mb-8">
          <p className="label mb-3">Pending ratification</p>
          {pending.map((doc) => (
            <div key={doc.id} className="mb-4">
              <ActionCard
                title={`${doc.id} — ${doc.title}`}
                subtitle={`Version ${doc.version} · Drafted ${doc.drafted_at.slice(0, 10)}`}
                actions={[
                  {
                    label: "Read Document",
                    endpoint: "#",
                    body: {},
                    variant: "secondary",
                  },
                  {
                    label: "Ratify",
                    endpoint: "/api/actions/ratify-document",
                    body: { document_id: doc.id },
                    variant: "primary",
                  },
                ]}
                borderColor="attention"
              />
              <Link
                href={`/governance/${doc.id}`}
                className="label text-muted hover:text-foreground transition-colors ml-4"
              >
                Read full document →
              </Link>
            </div>
          ))}
        </div>
      )}

      {ratified.length > 0 && (
        <div>
          <p className="label mb-3">Ratified documents</p>
          {ratified.map((doc) => (
            <div key={doc.id} className="border border-border p-4 mb-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-foreground">{doc.id} — {doc.title}</p>
                <span className="label text-active">Ratified</span>
              </div>
              <p className="data-muted mt-1">v{doc.version} · Ratified {doc.ratified_at?.slice(0, 10)}</p>
              <Link
                href={`/governance/${doc.id}`}
                className="label text-muted hover:text-foreground transition-colors mt-2 inline-block"
              >
                Read →
              </Link>
            </div>
          ))}
        </div>
      )}

      {docs.length === 0 && (
        <div className="border border-border p-5">
          <p className="label mb-2">No governance documents</p>
          <p className="text-sm text-foreground/60">Governance documents will appear here when drafted.</p>
        </div>
      )}
    </section>
  );
}
