import {
  readCollectionStats,
  readRecentInstitutionalEvents,
  type InstitutionalEvent,
} from "@/lib/collection";
import {
  readRecentEvents,
  readPriorityAlerts,
  type TerminalEvent,
} from "@/lib/events";

/**
 * FEED — institutional activity stream (Phase 2).
 *
 * Merges two sources:
 *   1. Local terminal events (lib/events.ts) — priority alerts, Keeper
 *      sessions, approval gates, hardware warnings.
 *   2. Turso institutional events (lib/collection.ts) — canon verdicts,
 *      critical responses, curatorial decisions, accession notices.
 *
 * The page is a server component. Each render pulls fresh data from
 * both sources and merges by timestamp. A later phase will layer a
 * WebSocket broadcast on top for live updates; for now, refresh by
 * navigating back to the tab.
 *
 * Revalidation is disabled (`force-dynamic`) because every visit wants
 * fresh institutional state — this is a command center, not a cached
 * public page.
 */
export const dynamic = "force-dynamic";

interface UnifiedFeedItem {
  key: string;
  priority: "normal" | "attention" | "error";
  event_type: string;
  description: string | null;
  agent_id: string | null;
  work_id: string | null;
  created_at: string;
  source: "terminal" | "turso";
}

function normalizeTerminal(e: TerminalEvent): UnifiedFeedItem {
  return {
    key: `t-${e.id}`,
    priority: e.priority,
    event_type: e.event_type,
    description: e.description,
    agent_id: e.agent_id,
    work_id: e.work_id,
    created_at: e.created_at,
    source: "terminal",
  };
}

function normalizeInstitutional(e: InstitutionalEvent): UnifiedFeedItem {
  return {
    key: `i-${e.id}`,
    priority: "normal",
    event_type: e.event_type,
    description: e.description,
    agent_id: e.agent_id,
    work_id: e.work_id,
    created_at: e.created_at,
    source: "turso",
  };
}

export default async function FeedPage() {
  const [stats, localEvents, alerts, institutionalEvents] = await Promise.all([
    readCollectionStats(),
    Promise.resolve(readRecentEvents(30)),
    Promise.resolve(readPriorityAlerts(10)),
    readRecentInstitutionalEvents(30),
  ]);

  const merged: UnifiedFeedItem[] = [
    ...localEvents.map(normalizeTerminal),
    ...institutionalEvents.map(normalizeInstitutional),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <section className="px-5 py-6">
      <div className="mb-6">
        <p className="label mb-2">The Museum of Nonhuman Art</p>
        <h1 className="display text-3xl">Feed</h1>
      </div>

      <StatsRow stats={stats} />

      {alerts.length > 0 && (
        <div className="mb-6">
          <p className="label mb-2">Priority · requires steward</p>
          <div className="border border-attention/50">
            {alerts.map((a) => (
              <FeedRow key={`alert-${a.id}`} item={normalizeTerminal(a)} pinned />
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="label mb-2">Activity</p>
        {merged.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="border border-border">
            {merged.slice(0, 50).map((item) => (
              <FeedRow key={item.key} item={item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StatsRow({
  stats,
}: {
  stats: Awaited<ReturnType<typeof readCollectionStats>>;
}) {
  const cells: { label: string; value: string }[] = stats
    ? [
        { label: "Canon", value: String(stats.canonized) },
        { label: "In Review", value: String(stats.in_review) },
        { label: "Rejected", value: String(stats.rejected) },
        { label: "Pending Reg.", value: String(stats.pending_registrations) },
      ]
    : [
        { label: "Canon", value: "—" },
        { label: "In Review", value: "—" },
        { label: "Rejected", value: "—" },
        { label: "Pending Reg.", value: "—" },
      ];

  return (
    <div className="grid grid-cols-4 border border-border mb-6">
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={`p-3 ${i < cells.length - 1 ? "border-r border-border" : ""}`}
        >
          <p className="label mb-1">{cell.label}</p>
          <p className="data text-lg">{cell.value}</p>
        </div>
      ))}
    </div>
  );
}

function FeedRow({
  item,
  pinned = false,
}: {
  item: UnifiedFeedItem;
  pinned?: boolean;
}) {
  const priorityClass =
    item.priority === "error"
      ? "border-l-2 border-l-error"
      : item.priority === "attention"
        ? "border-l-2 border-l-attention"
        : pinned
          ? "border-l-2 border-l-attention"
          : "border-l-2 border-l-transparent";

  return (
    <div
      className={`px-4 py-3 border-b border-border last:border-b-0 ${priorityClass}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="data text-xs uppercase tracking-widest">
          {formatEventType(item.event_type)}
        </span>
        <span className="data-muted">{formatTime(item.created_at)}</span>
      </div>
      {item.description && (
        <p className="text-sm text-foreground/80 mt-1 leading-relaxed">
          {item.description}
        </p>
      )}
      {(item.agent_id || item.work_id) && (
        <p className="data-muted mt-1">
          {item.agent_id && <span>{item.agent_id}</span>}
          {item.agent_id && item.work_id && <span> · </span>}
          {item.work_id && <span>{item.work_id}</span>}
        </p>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="border border-border p-5">
      <p className="label mb-2">No activity</p>
      <p className="text-sm text-foreground/60 leading-relaxed">
        The institutional record is quiet. New verdicts, curatorial
        decisions, and agent activity will appear here as they happen.
      </p>
    </div>
  );
}

function formatEventType(raw: string): string {
  return raw.replace(/_/g, " ").toLowerCase();
}

function formatTime(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d`;
  return d.toISOString().slice(0, 10);
}
