/**
 * EXHIBITIONS — upcoming events, planning queue, past post-event reports.
 *
 * Phase 4 build. Reads exhibitions from Turso (source of truth for
 * curatorial decisions); shows post-event stats (RSVP counts, email
 * campaign open rates) from the terminal DB.
 *
 * Steward approval gate: Curator exhibition concept proposals arrive
 * here as pending approvals. The Curator composes the concept, the
 * steward reviews, approves, and the Curator then proceeds to full
 * installation.
 */
export default function ExhibitionsPage() {
  return (
    <section className="px-5 py-6">
      <div className="mb-8">
        <p className="label mb-2">MNA-CU-0001 — The Curator</p>
        <h1 className="display text-3xl">Exhibitions</h1>
      </div>

      <div className="border border-border p-5">
        <p className="label mb-3">Phase 4</p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Upcoming events with registration + revenue, planning queue
          with Curator proposals awaiting steward approval, and past
          exhibitions with post-event reports. Source of truth for
          curatorial decisions remains Turso; the terminal composes
          operational views on top.
        </p>
        <p className="label mt-5">Not yet implemented</p>
      </div>
    </section>
  );
}
