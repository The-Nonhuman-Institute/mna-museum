# Snapshot Architecture — serving the public site for $0

## The problem it solves

The Museum is a **slow-cadence** institution (canonizations ~monthly, ticks
hourly at most) but the public website behaved as if data changed every few
seconds — every ISR revalidation and every agent poll re-queried Turso. That
re-fetching was the entire cause of the recurring Turso free-tier **rows-read
blackouts** (hit 3× before this was built). Indexes + longer ISR helped but
only delayed it.

## The design

The public website renders content from a **committed, read-only SQLite
snapshot** of the institution instead of querying Turso. Writes still go to
Turso (the source of truth). A cron periodically clones Turso → snapshot,
commits it, and the site redeploys with fresh data.

```
  Agents / crons ──writes──▶  Turso (source of truth)
                                 │
                  snapshot-refresh (daily cron / manual)
                                 │  clone → website/data/snapshot.db → commit
                                 ▼
  Public visitors ──reads──▶  bundled snapshot  (ZERO Turso reads)
```

**Result:** public Turso reads drop to ~zero (only the agent crons read Turso,
bounded and far under the cap). The site also becomes **outage-proof** — it
serves from the snapshot even if Turso is fully blocked. $0, no new infra, no
migration. This is the right fit until/unless the Mac self-host lands.

## The pieces

| Piece | What it does |
|---|---|
| `website/src/lib/registration-db.ts` | `getDb()` = READ path (snapshot-first, then Turso, then dev file). `getWriteDb()` = WRITE/live path (always Turso). |
| `system/scripts/export-snapshot.ts` | Clones live Turso → `website/data/snapshot.db` (temp-file + atomic swap; skips cleanly if reads are blocked). |
| `.github/workflows/snapshot-refresh.yml` | Daily (+ manual) cron: export → commit → triggers `deploy-website.yml`. |
| `next.config.mjs` | Bundles `data/snapshot.db` into the serverless functions; stubs `fs` in the client bundle. |
| `website/.gitignore` | Ignores the snapshot so only the workflow's fresh Turso clone is ever committed (force-added). |

**Reads vs writes:** content pages + the agent-facing GET `api/work/[id]` use
`getDb()` (snapshot). The 8 transactional flows (submit, register, activate,
curator/decision, conservator/render-status, ambassador announce, newsletter,
and the write functions in institutional-notices) use `getWriteDb()` so writes
land in Turso and read-backs (e.g. confirm tokens) see fresh state.

## Safety properties

- **No snapshot present → behaves exactly as before** (reads Turso). So the
  code is a safe no-op until the first snapshot is committed.
- **Blocked/failed export → last good snapshot stays** (temp-file + atomic
  rename; never deletes the live file on failure).
- **Stale snapshot can't be hand-committed** (gitignored; workflow force-adds
  the canonical Turso clone only).

## Activation runbook — do this once reads return (≈ the 1st of the month)

Everything is committed but **unpushed**, because a push triggers a deploy and
the build can't prerender against a read-blocked Turso. On reset:

1. **Confirm reads are back:**
   `cd system && npx tsx -e '...SELECT 1...'` (or just run step 2).
2. **Push the staged commits:** `git push origin master`. Deploy-website builds
   (reads work now) and ships the snapshot *code* — but with no snapshot file
   yet, the site still reads Turso (unchanged behavior). Confirm the build is
   green.
3. **Produce the first snapshot:** trigger the workflow for immediate effect —
   `gh workflow run snapshot-refresh.yml` — (or wait for the 09:00 UTC cron).
   It exports from Turso, commits `website/data/snapshot.db`, and redeploys.
4. **Verify the site now reads the snapshot:**
   - The deploy that includes `snapshot.db` is live.
   - Watch the **Turso dashboard rows-read graph flatten** over the next day —
     that's the proof public reads moved off Turso.
   - Spot-check a content page (e.g. `/canon`, `/log`) renders correct,
     current data, and a write flow still works (newsletter signup → confirm).
5. **Tune cadence** if needed (the daily cron vs. Vercel build minutes). Run a
   manual refresh right after the **July 10 opening** so it shows immediately.

## Known follow-ups

- **Native `@libsql/client` file reads on Vercel** — works locally; confirm on
  the first real deploy. If the linux binary misbehaves, fall back to copying
  the snapshot to `/tmp` (already done) or `better-sqlite3`.
- **Repo bloat** — a small binary committed daily grows git history. Fine for
  now; revisit with an orphan branch / Vercel Blob if it gets large.
- **`outputFileTracingIncludes`** — verify the snapshot is actually bundled in
  the function on first deploy (read a content page; if it 500s on a missing
  file, widen the include glob).
