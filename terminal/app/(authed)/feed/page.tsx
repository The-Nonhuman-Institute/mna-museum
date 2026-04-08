/**
 * FEED — institutional activity stream.
 *
 * Phase 2 build. This empty shell lets the tab bar navigate and the
 * PWA install correctly. Full implementation next session:
 *   - Real-time stream of events from Turso (canon decisions, critical
 *     responses, curatorial decisions) + terminal-native events
 *     (approvals, hardware alerts, keeper sessions)
 *   - Priority alerts pinned at top (steward action required)
 *   - Stats row (canonized / in review / rejected counts)
 *   - WebSocket subscription so the feed updates live
 *   - Each item links to a detail screen for its event type
 */
export default function FeedPage() {
  return (
    <section className="px-5 py-6">
      <div className="mb-8">
        <p className="label mb-2">The Museum of Nonhuman Art</p>
        <h1 className="display text-3xl">Feed</h1>
      </div>

      <StubBlock
        phase="Phase 2"
        description="Institutional activity stream, real-time event log, priority alerts, stats row. Reads from the local terminal DB and from Turso; subscribes to the WebSocket broadcast for live updates."
      />
    </section>
  );
}

function StubBlock({
  phase,
  description,
}: {
  phase: string;
  description: string;
}) {
  return (
    <div className="border border-border p-5">
      <p className="label mb-3">{phase}</p>
      <p className="text-sm text-foreground/80 leading-relaxed">
        {description}
      </p>
      <p className="label mt-5">Not yet implemented</p>
    </div>
  );
}
