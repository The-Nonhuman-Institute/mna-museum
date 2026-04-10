import { readExhibitions, type Exhibition } from "@/lib/collection";

/**
 * EXHIBITIONS — the Curator's domain.
 *
 * Shows all exhibitions from the institutional Turso database:
 * active exhibitions at the top, planned next, retired at the bottom.
 * Each card shows title, status, work count, dates, and an excerpt
 * of the curatorial statement.
 *
 * Curator proposals (awaiting steward approval) will surface in a
 * "Pending Proposals" section once the approval queue is wired in
 * Phase 4.5.
 */
export const dynamic = "force-dynamic";

export default async function ExhibitionsPage() {
  let exhibitions: Exhibition[] = [];
  let error: string | null = null;
  try {
    exhibitions = await readExhibitions();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const active = exhibitions.filter((e) => e.status === "ACTIVE");
  const planned = exhibitions.filter((e) => e.status === "PLANNED");
  const retired = exhibitions.filter((e) => e.status === "RETIRED");

  return (
    <section className="px-5 py-6">
      <div className="mb-6">
        <p className="label mb-2">MNA-CU-0001 — The Curator</p>
        <h1 className="display text-3xl">Shows</h1>
      </div>

      {error ? (
        <div className="border border-error p-4">
          <p className="label mb-1">Error loading exhibitions</p>
          <p className="text-xs text-error leading-relaxed break-all" style={{ overflowWrap: "anywhere" }}>
            {error}
          </p>
        </div>
      ) : exhibitions.length === 0 ? (
        <div className="border border-border p-5">
          <p className="label mb-2">No exhibitions</p>
          <p className="text-sm text-foreground/60 leading-relaxed">
            The Curator has not proposed any exhibitions yet. When a
            proposal is submitted, it will appear here for steward
            review and approval.
          </p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-6">
              <p className="label mb-2">Currently on view</p>
              {active.map((e) => (
                <ExhibitionCard key={e.id} exhibition={e} />
              ))}
            </div>
          )}

          {planned.length > 0 && (
            <div className="mb-6">
              <p className="label mb-2">Planned</p>
              {planned.map((e) => (
                <ExhibitionCard key={e.id} exhibition={e} />
              ))}
            </div>
          )}

          {retired.length > 0 && (
            <div className="mb-6">
              <p className="label mb-2">Past exhibitions</p>
              {retired.map((e) => (
                <ExhibitionCard key={e.id} exhibition={e} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ExhibitionCard({ exhibition: e }: { exhibition: Exhibition }) {
  const excerpt = e.curatorial_statement
    ? e.curatorial_statement.split(/\n\s*\n/)[0]?.trim().slice(0, 200) || ""
    : "";
  const statusLabel =
    e.status === "ACTIVE"
      ? "On view"
      : e.status === "PLANNED"
        ? "Planned"
        : "Closed";
  const statusClass =
    e.status === "ACTIVE"
      ? "text-active"
      : e.status === "PLANNED"
        ? "text-attention"
        : "text-muted";

  return (
    <div className="border border-border p-5 mb-3 last:mb-0">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="font-serif text-xl text-foreground">{e.title}</h2>
        <span className={`label shrink-0 ${statusClass}`}>{statusLabel}</span>
      </div>
      {e.subtitle && (
        <p className="text-sm text-foreground/70 italic mb-3">{e.subtitle}</p>
      )}
      <div className="flex gap-4 mb-3">
        <span className="data-muted">{e.work_ids.length} work{e.work_ids.length === 1 ? "" : "s"}</span>
        {e.opened_at && <span className="data-muted">Opened {formatDate(e.opened_at)}</span>}
        {e.retired_at && <span className="data-muted">Closed {formatDate(e.retired_at)}</span>}
      </div>
      {excerpt && (
        <p className="text-sm text-foreground/70 leading-relaxed">{excerpt}</p>
      )}
      {e.work_ids.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="label mb-2">Works</p>
          <div className="flex flex-wrap gap-2">
            {e.work_ids.map((wid) => (
              <span key={wid} className="data text-xs bg-surface px-2 py-1 border border-border">
                {wid}
              </span>
            ))}
          </div>
        </div>
      )}
      {e.curator_id && (
        <p className="data-muted mt-3">Curated by {e.curator_id}</p>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}
