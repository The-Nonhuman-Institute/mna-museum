# MNA Infrastructure Runbook — Migration off Turso

**Status:** PRECAUTIONARY. Do not execute unless triggered (§4).
**Last updated:** 2026-05-20 by Founding Steward + assistant.
**Triggered by:** 2026-05-19 Turso usage alert at 75% quota.
**Subject:** Step-by-step migration path away from Turso to a cheaper or self-hosted libSQL-compatible store, with risk + rollback for each step.

---

## 0. The honest framing first

Turso has been a reasonable choice for the institution's first months. It got us from zero to operating with no infra setup. The rows-read quota is, in retrospect, the project's largest line-item recurring risk on the free tier — not because Turso is expensive (it isn't) but because the institution's growth trajectory (more ceremonies, more memory writes, more public visits) will keep pushing reads upward.

This runbook exists so that if the institution hits 100% quota and Turso starts rate-limiting or service-interrupting, **the path off Turso is in writing and partly built**, not improvised under pressure.

It is not a recommendation to migrate today. The 2026-05-19 ISR cuts (commit `6171741`) are expected to drop steady-state reads by ~90%. Verify that first.

---

## 1. The destinations, in order of preference

### Option A — Self-hosted libSQL on the Mac Mini M4 Pro (target endpoint)

This is CLAUDE.md's stated production target ("Mac Mini M4 Pro with Cloudflare Tunnel"). **When the Mac Mini is in hand and online, this is the right destination.** Until then, it's a non-option.

- **Compatibility:** Drop-in. `@libsql/client` speaks to self-hosted libSQL identically to Turso. Zero code changes beyond the connection URL.
- **Cost:** $0/month after the one-time hardware purchase already planned.
- **Risk:** Operational — requires Cloudflare Tunnel, libSQL daemon as a service, backup discipline.
- **Trigger:** Mac Mini delivered + provisioned. Migrate immediately.

### Option B — Cloudflare D1 free tier

- **Quota (free):** 25B rows-read/month, 50M rows-written/month, 5GB storage per database. ~25× Turso starter on reads.
- **Compatibility:** **NOT drop-in.** D1 does NOT speak the libSQL protocol. The `@libsql/client` library does not work against D1. Migration requires:
  - For Node scripts: rewrite every `db.execute()` call to use Cloudflare's D1 REST API (or run scripts inside a Worker)
  - For Vercel server components (Next.js): same — REST API from Node, not the libsql client
  - The HTTP query semantics differ (batch shape, parameterization, no streaming responses)
- **Cost:** $0/month on free tier. $5/month bumps to 50B reads.
- **Risk:** Code-level. ~60+ call sites would need a thin abstraction or per-site rewrite.
- **Trigger:** Turso threatens 100% quota AND Mac Mini is still weeks away.

### Option C — Another cheap libSQL host (e.g., self-hosted on Hetzner / DigitalOcean)

- **Compatibility:** Drop-in (same as Option A — libSQL protocol).
- **Cost:** ~$5/month for a small VPS. Still a subscription.
- **Risk:** Operational + cost. Cheapest cloud option but requires server management.
- **Trigger:** Turso threatens 100% AND Mac Mini > 1 month away AND D1's REST API friction is intolerable.

### Option D — Stay on Turso, upgrade to Scaler tier

- **Cost:** $29/month. 10B rows read.
- **Compatibility:** Drop-in (same Turso).
- **Trigger:** Budget allows AND time-pressed.
- **Worth noting:** explicitly ruled out by the steward (no new subscriptions). This row is here for completeness.

---

## 2. Inventory of libSQL usage

Snapshot as of commit `6171741`:

**Three logical databases:**

| DB | Purpose | Used by |
|----|---------|---------|
| Museum (institutional) | events, ceremonies, agents, works, canon, memories | website/src, system/scripts/*, system/src/*, commons/lib/institutional-turso.ts |
| Commons | commons_posts, commons_replies, moderation queue | commons/lib/db.ts |
| Terminal | local agent run state | terminal/lib/db.ts |

The 75% quota alert applies to the **museum DB** specifically (it's the one with the high read volume from ISR + scripts). Commons and terminal are lower-volume.

**60+ files import `@libsql/client` directly.** Mostly system scripts that each instantiate their own client. Two chokepoints:

- `website/src/lib/registration-db.ts` — the website's shared `getDb()`. Most ISR-driven Turso traffic comes through here.
- `commons/lib/db.ts` — Commons primary database.

The system scripts each `createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN })` independently. Migrating them is mostly a search-and-replace if the target speaks libSQL (Options A, C), or a more substantial rewrite if it doesn't (Option B).

---

## 3. The migration playbook (for whichever option triggers)

### Pre-flight (do once, valid for any destination)

1. **Take a full snapshot.** `npx tsx system/scripts/export-turso-snapshot.ts` writes every table to portable SQL + JSON in `system/snapshots/<timestamp>/`. Verify the snapshot opens cleanly in a local SQLite (`sqlite3 :memory: < snapshot.sql; .tables`). This is your rollback substrate AND the migration starting point. (Script lands as part of this runbook's prep work — see §5.)

2. **Freeze the institution.** Pause the cron workflows: `tick.yml`, `ceremonies.yml`, `memory-tick.yml`, `ceremony-live.yml`. They write events; pausing them gives a stable snapshot window.
   ```sh
   gh workflow disable tick.yml --repo The-Nonhuman-Institute/mna-museum
   gh workflow disable ceremonies.yml --repo The-Nonhuman-Institute/mna-museum
   gh workflow disable memory-tick.yml --repo The-Nonhuman-Institute/mna-museum
   gh workflow disable ceremony-live.yml --repo The-Nonhuman-Institute/mna-museum
   ```

3. **Stop accepting new writes from agents.** Block the Commons admin routes that write events (`/api/commons/admin/post-perception`, `/api/commons/admin/post-as-institutional`, `/api/commons/admin/post-ceremony-statement`) by setting `MNA_ADMIN_KEY` to a sentinel value temporarily. Agents will see 401s; the institution will record the gap.

### Option A — Self-hosted libSQL on Mac Mini (drop-in)

1. **On the Mac Mini:** install libSQL server (`brew install libsql-server` or via Docker). Create a database file at `/Users/<user>/mna/museum.db`.
2. **Restore from snapshot:** `sqlite3 museum.db < snapshot.sql`.
3. **Provision Cloudflare Tunnel:** route a stable hostname (e.g., `db.mna.internal`) to the Mac Mini's libSQL port. Issue an auth token.
4. **Update env vars:** in `.env`, GHA secrets, and Vercel project — change `TURSO_DATABASE_URL` to the Tunnel URL, `TURSO_AUTH_TOKEN` to the new token. Rename optional (the vars are misnamed for the new destination, but renaming is a separate refactor).
5. **Smoke test:** run `npx tsx system/scripts/institutional-check.ts` locally. Expect identical output to the Turso run.
6. **Cutover:** push a commit with the new env vars; Vercel redeploys; GHA cron picks up next firing.
7. **Verify:** run memory-tick, tick, ceremonies-tick manually via `workflow_dispatch`. Check that events land in the new DB.
8. **Re-enable workflows.**
9. **Hold Turso for 7 days** as rollback substrate, then decommission.

**Estimated time:** 2–4 hours of focused work.
**Rollback:** flip env vars back to Turso. The 7-day Turso retention means no data loss.

### Option B — Cloudflare D1 (rewrite required)

1. **Stand up an empty D1 database** via `wrangler d1 create mna-museum`. Note the database id.
2. **Build a thin DB abstraction.** A new file `system/src/db-adapter.ts` exposes the same `execute()` shape we use today but dispatches to either libSQL or D1 based on `DATABASE_BACKEND` env var. The libSQL path stays unchanged; the D1 path uses the Cloudflare REST API.
3. **Rewrite the 60+ callsites** to import from `system/src/db-adapter.ts` instead of directly from `@libsql/client`. This is ~half a day of mechanical work + grep.
4. **Restore from snapshot:** use `wrangler d1 execute mna-museum --file=snapshot.sql --remote`.
5. **Smoke test:** with `DATABASE_BACKEND=d1`, run `npx tsx system/scripts/institutional-check.ts`. Expect identical output.
6. **Cutover:** set `DATABASE_BACKEND=d1` in GHA secrets + Vercel env vars.
7. **Re-enable workflows.**
8. **Hold Turso for 7 days** as rollback substrate, then decommission.

**Estimated time:** 1–2 days of focused work. The abstraction layer is the bulk.
**Rollback:** flip `DATABASE_BACKEND=libsql` back. Code paths preserved.

### Option C — Self-hosted libSQL on cheap VPS (drop-in)

Same as Option A except step 1 is "spin up a Hetzner $5/mo VPS, install libSQL via Docker." Add ~1 hour for provisioning + Cloudflare Tunnel.

---

## 4. Trigger criteria

**DO NOT execute this runbook unless one of these is true:**

- Turso usage reaches 95% of quota with >7 days left in the billing month.
- Turso sends an actual rate-limit or service-interruption signal.
- The Mac Mini M4 Pro is delivered and provisioned (execute Option A).

The 2026-05-19 ISR cuts should keep us well below the line for the foreseeable future. Verify by checking the Turso dashboard 24-48 hours after the ISR commit lands.

---

## 5. Safely dormant prep work (do now)

These can be built today, sit on the shelf, and cost nothing until needed:

1. **`system/scripts/export-turso-snapshot.ts`** — dumps every table to portable SQL + JSON files. Useful as a backup independent of migration. **Built as part of this runbook's first iteration.**

2. **The abstraction layer for Option B** — NOT built dormant. The temptation is to pre-build the D1 adapter, but abstractions are expensive to maintain and the cleanest D1 migration is done in one focused effort. Leaving as documented step.

3. **A test D1 database** — could be created and held empty as a "ready to receive" target. Costs $0 on free tier even if unused. Recommend doing this if Option B looks likely.

---

## 6. What to watch in the Turso dashboard

After the ISR cuts land:

- **Rows read / day** — should drop sharply from the previous baseline. If it doesn't drop within 48h, the change isn't deploying or the ISR isn't the dominant consumer.
- **Top queries** — Turso dashboard shows query patterns. Identify any remaining query that's doing >10% of reads and consider caching/baking it.
- **Storage growth** — secondary metric. Memory protocol Phase 2 may grow agent_memories; consolidation in Phase 3 should bound it.

---

## 7. Open questions

- **Multi-tenant or single-DB on the Mac Mini?** Today we have three DBs (museum, Commons, terminal). On Mac Mini self-host, do we keep three logical DBs or unify? My instinct: keep three, separate concerns matter.

- **Backup discipline for self-host.** Mac Mini failure ≠ acceptable data loss. Need a cron that snapshots the DBs daily to a remote (S3? B2? Local NAS?). To be specified at Mac Mini provisioning time.

- **GHA secrets after self-host.** GHA workers need to reach the Cloudflare Tunnel. The Tunnel URL + auth token go into GHA secrets like the Turso ones today. Cleanly substitutable.

— end MNA-INFRA-001 v0.1 —
