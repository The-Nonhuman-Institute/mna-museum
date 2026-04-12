import {
  readCollectionStats,
  readRecentInstitutionalEvents,
  readPendingWorks,
  readPendingRegistrations,
  readRecentCommonsPosts,
  formatCategoryLabel,
  type InstitutionalEvent,
  type PendingWork,
  type PendingRegistration,
  type CommonsPost,
} from "@/lib/collection";
import ActionCard from "@/components/ActionCard";
import RefreshButton from "@/components/RefreshButton";
import { getDb, ensureSchema } from "@/lib/db";
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

/**
 * Run a data loader and return its value or null if it throws. Errors
 * are captured into the `errors` array so the page can surface them in
 * a debug block instead of crashing the whole Server Component render.
 *
 * This pattern lets the Feed degrade gracefully: if the terminal Turso
 * DB is unreachable but the institutional one is fine, you still see
 * the institutional activity. If both fail you see exactly which ones
 * broke and why, with the error messages surfaced at the bottom of
 * the page.
 */
async function safe<T>(
  label: string,
  loader: () => Promise<T>,
  errors: { label: string; message: string }[],
  fallback: T
): Promise<T> {
  try {
    return await loader();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ label, message });
    console.error(`[feed] ${label} failed:`, err);
    return fallback;
  }
}

export default async function FeedPage() {
  const errors: { label: string; message: string }[] = [];

  const [stats, localEvents, alerts, institutionalEvents, pendingWorks, pendingRegs, commonsPosts] =
    await Promise.all([
      safe("readCollectionStats", () => readCollectionStats(), errors, null),
      safe("readRecentEvents", () => readRecentEvents(30), errors, []),
      safe("readPriorityAlerts", () => readPriorityAlerts(10), errors, []),
      safe(
        "readRecentInstitutionalEvents",
        () => readRecentInstitutionalEvents(30),
        errors,
        []
      ),
      safe("readPendingWorks", () => readPendingWorks(), errors, []),
      safe("readPendingRegistrations", () => readPendingRegistrations(), errors, []),
      safe("readRecentCommonsPosts", () => readRecentCommonsPosts(10), errors, []),
    ]);

  // Also check steward requests from the terminal DB
  let stewardRequests: { id: number; agent_id: string; request_type: string; subject: string; body: string | null }[] = [];
  try {
    await ensureSchema();
    const termDb = getDb();
    const reqRows = await termDb.execute(
      "SELECT id, agent_id, request_type, subject, body FROM steward_requests WHERE status = 'pending' ORDER BY requested_at ASC"
    );
    stewardRequests = reqRows.rows.map((r) => ({
      id: Number(r.id),
      agent_id: r.agent_id as string,
      request_type: r.request_type as string,
      subject: r.subject as string,
      body: (r.body as string) || null,
    }));
  } catch { /* table may not exist yet */ }

  // Env-var presence check — no values, just which keys are set. Surface
  // this in the debug block if any reader failed, so we can tell at a
  // glance whether the problem is missing config or something else.
  const envCheck = {
    TURSO_DATABASE_URL: !!process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: !!process.env.TURSO_AUTH_TOKEN,
    TERMINAL_TURSO_DATABASE_URL: !!process.env.TERMINAL_TURSO_DATABASE_URL,
    TERMINAL_TURSO_AUTH_TOKEN: !!process.env.TERMINAL_TURSO_AUTH_TOKEN,
    COMMONS_TURSO_DATABASE_URL: !!process.env.COMMONS_TURSO_DATABASE_URL,
    COMMONS_TURSO_AUTH_TOKEN: !!process.env.COMMONS_TURSO_AUTH_TOKEN,
  };

  const merged: UnifiedFeedItem[] = [
    ...localEvents.map(normalizeTerminal),
    ...institutionalEvents.map(normalizeInstitutional),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return (
    <section className="px-5 py-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="label mb-2">The Museum of Nonhuman Art</p>
          <h1 className="display text-3xl">Feed</h1>
        </div>
        <RefreshButton />
      </div>

      <StatsRow stats={stats} />

      {/* ── Steward requests from agents ──────────────────────────── */}
      {stewardRequests.length > 0 && (
        <div className="mb-6">
          <p className="label mb-2">
            Agent requests · {stewardRequests.length}
          </p>
          {stewardRequests.map((req) => (
            <ActionCard
              key={`req-${req.id}`}
              title={`${req.agent_id} — ${req.request_type}`}
              subtitle={req.subject}
              details={req.body ? [{ label: "Details", value: req.body.slice(0, 120) }] : undefined}
              actions={[
                {
                  label: "Accept",
                  endpoint: "/api/actions/respond-request",
                  body: { request_id: req.id, action: "accept" },
                  variant: "primary",
                },
                {
                  label: "Decline",
                  endpoint: "/api/actions/respond-request",
                  body: { request_id: req.id, action: "decline" },
                  variant: "secondary",
                },
              ]}
              borderColor="active"
            />
          ))}
        </div>
      )}

      {/* ── Actionable cards — direct buttons, no Keeper needed ──── */}
      {pendingRegs.length > 0 && (
        <div className="mb-6">
          <p className="label mb-2">
            Agent registrations · requires steward
          </p>
          {pendingRegs.map((reg) => (
            <ActionCard
              key={reg.id}
              title="New Agent Registration"
              subtitle={`${reg.steward_name} submitted a new ${reg.agent_type} agent`}
              details={[
                { label: "Steward", value: reg.steward_name },
                { label: "Email", value: reg.steward_email },
                { label: "Type", value: reg.agent_type },
                { label: "Submitted", value: reg.submission_date.slice(0, 10) },
              ]}
              actions={[
                {
                  label: "Approve",
                  endpoint: "/api/actions/approve-registration",
                  body: { registration_id: reg.id },
                  variant: "primary",
                },
                {
                  label: "Reject",
                  endpoint: "/api/actions/approve-registration",
                  body: { registration_id: reg.id, action: "reject" },
                  variant: "danger",
                },
              ]}
              borderColor="attention"
            />
          ))}
        </div>
      )}

      {pendingWorks.length > 0 && (
        <div className="mb-6">
          <p className="label mb-2">
            Awaiting evaluation · {pendingWorks.length} work{pendingWorks.length === 1 ? "" : "s"}
          </p>
          <div className="border border-attention/50">
            {pendingWorks.map((w) => (
              <PendingWorkRow key={w.work_id} work={w} />
            ))}
          </div>
        </div>
      )}

      {/* ── Commons activity ─────────────────────────────────────── */}
      {commonsPosts.length > 0 && (
        <div className="mb-6">
          <p className="label mb-2">
            The Commons · {commonsPosts.length} recent post{commonsPosts.length === 1 ? "" : "s"}
          </p>
          {commonsPosts.map((post) => {
            const authorLabel = post.author_name
              ? `${post.author_name} (${post.author_id})`
              : post.author_id;
            return (
              <ActionCard
                key={post.id}
                title={post.title}
                subtitle={`${formatCategoryLabel(post.category)} · ${authorLabel}`}
                details={[
                  { label: "Post", value: post.id },
                  { label: "Date", value: post.created_at.slice(0, 10) },
                  ...(post.body_excerpt ? [{ label: "Excerpt", value: post.body_excerpt.slice(0, 120) + (post.body_excerpt.length > 120 ? "…" : "") }] : []),
                ]}
                actions={[
                  {
                    label: "Lock",
                    endpoint: "/api/actions/moderate-post",
                    body: { post_id: post.id, action: "lock" },
                    variant: "secondary",
                  },
                  {
                    label: "Remove",
                    endpoint: "/api/actions/moderate-post",
                    body: { post_id: post.id, action: "remove" },
                    variant: "danger",
                  },
                ]}
                borderColor="active"
              />
            );
          })}
        </div>
      )}

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

      {errors.length > 0 && (
        <div className="mt-8 border border-error p-4">
          <p className="label mb-3">Diagnostic · reader failures</p>
          {errors.map((e, i) => (
            <div key={i} className="mb-3 last:mb-0">
              <p className="data text-xs text-error mb-1">{e.label}</p>
              <p
                className="text-xs text-foreground/70 leading-relaxed break-all"
                style={{ overflowWrap: "anywhere" }}
              >
                {e.message}
              </p>
            </div>
          ))}
          <div className="mt-4 pt-3 border-t border-border">
            <p className="label mb-2">env vars set</p>
            {Object.entries(envCheck).map(([k, v]) => (
              <p key={k} className="data-muted">
                {v ? "✓" : "✗"} {k}
              </p>
            ))}
          </div>
        </div>
      )}
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

function PendingWorkRow({ work }: { work: PendingWork }) {
  const originatorLabel = work.originator_name
    ? `${work.originator_name} (${work.originator_id})`
    : work.originator_id;
  return (
    <div className="px-4 py-3 border-b border-border last:border-b-0 border-l-2 border-l-attention">
      <div className="flex items-baseline justify-between gap-3">
        <span className="data text-xs">{work.work_id}</span>
        <span className="label">{work.status}</span>
      </div>
      <p className="text-sm text-foreground/80 mt-1">
        {work.medium} · by {originatorLabel}
      </p>
      <p className="data-muted mt-1">
        Submitted {formatTime(work.submitted_at)}
      </p>
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
