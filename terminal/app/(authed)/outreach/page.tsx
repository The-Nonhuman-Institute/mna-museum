/**
 * OUTREACH — PR pipeline and Ambassador contact list.
 *
 * Phase 4 build. Shows active contacts with status (Replied / No
 * Response / Sent), with a detail screen per contact carrying the
 * Ambassador-authored briefing. Interview-request banner appears when a
 * contact has replied and needs steward action.
 *
 * Steward approval gate: outgoing Ambassador drafts land here as
 * pending approvals before they're sent.
 */
export default function OutreachPage() {
  return (
    <section className="px-5 py-6">
      <div className="mb-8">
        <p className="label mb-2">MNA-AM-0001 — The Ambassador</p>
        <h1 className="display text-3xl">Outreach</h1>
      </div>

      <div className="border border-border p-5">
        <p className="label mb-3">Phase 4</p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          PR contact table, reply indicators, Ambassador briefings, and
          the steward approval gate for outgoing drafts. Contacts live in
          the terminal DB; briefings are composed by the Ambassador agent
          at send time.
        </p>
        <p className="label mt-5">Not yet implemented</p>
      </div>
    </section>
  );
}
