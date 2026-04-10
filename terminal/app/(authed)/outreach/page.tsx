import { getDb, ensureSchema } from "@/lib/db";

/**
 * OUTREACH — PR pipeline and Ambassador contact management.
 *
 * Shows contacts managed by the Ambassador agent, grouped by status:
 * - Replied: contacts who responded, may need steward follow-up
 * - Sent: outreach delivered, awaiting response
 * - No Response: follow-up window has passed
 * - Archived: closed contacts
 *
 * When the Ambassador agent is wired (Phase 4.5+), this page will
 * also show:
 * - Pending outreach drafts awaiting steward approval
 * - Ambassador-authored briefings per contact
 * - Social media monitoring results
 *
 * For now, the page reads from the terminal DB's outreach_contacts
 * table (which is empty until the Ambassador starts populating it)
 * and shows a meaningful empty state that explains what will appear.
 */
export const dynamic = "force-dynamic";

interface OutreachContact {
  id: number;
  name: string;
  organization: string | null;
  email: string | null;
  role: string | null;
  status: string;
  last_contact_at: string | null;
  last_reply_at: string | null;
  notes: string | null;
  created_at: string;
}

export default async function OutreachPage() {
  let contacts: OutreachContact[] = [];
  let error: string | null = null;

  try {
    await ensureSchema();
    const db = getDb();
    const rows = await db.execute(
      `SELECT id, name, organization, email, role, status,
              last_contact_at, last_reply_at, notes, created_at
         FROM outreach_contacts
         ORDER BY
           CASE status
             WHEN 'replied' THEN 0
             WHEN 'sent' THEN 1
             WHEN 'no_response' THEN 2
             ELSE 3
           END,
           last_contact_at DESC`
    );
    contacts = rows.rows.map((r) => ({
      id: Number(r.id),
      name: (r.name as string) || "Unknown",
      organization: (r.organization as string) || null,
      email: (r.email as string) || null,
      role: (r.role as string) || null,
      status: (r.status as string) || "sent",
      last_contact_at: (r.last_contact_at as string) || null,
      last_reply_at: (r.last_reply_at as string) || null,
      notes: (r.notes as string) || null,
      created_at: (r.created_at as string) || "",
    }));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const replied = contacts.filter((c) => c.status === "replied");
  const sent = contacts.filter((c) => c.status === "sent");
  const noResponse = contacts.filter((c) => c.status === "no_response");
  const archived = contacts.filter((c) => c.status === "archived");

  return (
    <section className="px-5 py-6">
      <div className="mb-6">
        <p className="label mb-2">MNA-AM-0001 — The Ambassador</p>
        <h1 className="display text-3xl">Outreach</h1>
      </div>

      {error ? (
        <div className="border border-error p-4">
          <p className="label mb-1">Error loading contacts</p>
          <p className="text-xs text-error leading-relaxed break-all" style={{ overflowWrap: "anywhere" }}>
            {error}
          </p>
        </div>
      ) : contacts.length === 0 ? (
        <div className="border border-border p-5">
          <p className="label mb-3">No outreach contacts yet</p>
          <p className="text-sm text-foreground/60 leading-relaxed mb-3">
            The Ambassador has not initiated any PR outreach. When the
            Ambassador agent begins its contact pipeline, outreach
            targets will appear here grouped by status — replied contacts
            needing steward follow-up at the top, sent outreach in the
            middle, and archived contacts at the bottom.
          </p>
          <p className="text-sm text-foreground/60 leading-relaxed">
            You can also ask the Keeper to draft and issue outreach
            through the chat interface. Ambassador-authored briefings
            and social media monitoring will be added when the
            Ambassador agent is fully wired.
          </p>
        </div>
      ) : (
        <>
          {replied.length > 0 && (
            <div className="mb-6">
              <p className="label mb-2">
                Replied · needs steward attention
              </p>
              <div className="border border-active/50">
                {replied.map((c) => (
                  <ContactRow key={c.id} contact={c} />
                ))}
              </div>
            </div>
          )}

          {sent.length > 0 && (
            <div className="mb-6">
              <p className="label mb-2">Sent · awaiting response</p>
              <div className="border border-border">
                {sent.map((c) => (
                  <ContactRow key={c.id} contact={c} />
                ))}
              </div>
            </div>
          )}

          {noResponse.length > 0 && (
            <div className="mb-6">
              <p className="label mb-2">No response</p>
              <div className="border border-border">
                {noResponse.map((c) => (
                  <ContactRow key={c.id} contact={c} />
                ))}
              </div>
            </div>
          )}

          {archived.length > 0 && (
            <div className="mb-6">
              <p className="label mb-2">Archived</p>
              <div className="border border-border">
                {archived.map((c) => (
                  <ContactRow key={c.id} contact={c} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ContactRow({ contact: c }: { contact: OutreachContact }) {
  const statusClass =
    c.status === "replied"
      ? "text-active"
      : c.status === "sent"
        ? "text-attention"
        : "text-muted";

  return (
    <div className="px-4 py-3 border-b border-border last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-foreground">{c.name}</span>
        <span className={`label shrink-0 ${statusClass}`}>
          {c.status.replace(/_/g, " ")}
        </span>
      </div>
      {(c.organization || c.role) && (
        <p className="data-muted mt-0.5">
          {c.role && <span>{c.role}</span>}
          {c.role && c.organization && <span> · </span>}
          {c.organization && <span>{c.organization}</span>}
        </p>
      )}
      {c.notes && (
        <p className="text-xs text-foreground/60 mt-1 leading-relaxed">
          {c.notes}
        </p>
      )}
      {c.last_reply_at && (
        <p className="data-muted mt-1">Replied {c.last_reply_at.slice(0, 10)}</p>
      )}
    </div>
  );
}
