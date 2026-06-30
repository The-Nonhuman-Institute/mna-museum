# Self-Hosted libSQL — Migration Runbook (fully off Turso)

How to move the museum's source-of-truth database off Turso onto a self-hosted
libSQL server (`sqld`), so there is **no third-party quota of any kind** — read
or write — ever again. $0, and a drop-in change to the app.

> Status: **runbook, validated by design.** Execute *after* the July-1 snapshot
> cutover (`SNAPSHOT-ARCHITECTURE.md`) — never under outage pressure. The
> snapshot makes this a calm, zero-downtime swap. See [[project_read_crisis_round2]].

---

## The key insight that makes self-hosting actually safe here

Self-hosting a database is normally risky for a solo operator — if your box dies
at 3am, your app dies. **That risk does not apply here, because the snapshot
architecture already removed the public site's dependency on the live DB.**

- Public visitors read the **committed snapshot file** — they never touch the
  live DB at all.
- The self-hosted `sqld` only serves **writes** (registration, submissions,
  curator/conservator actions, newsletter — tiny: ~10K writes total) and the
  **daily snapshot-generation read**.
- So if the self-hosted instance is briefly down: the **public museum stays
  fully up** (serving the last snapshot); only *new writes* pause until it's
  back. No visitor ever sees an error.

That means a *free, occasionally-flaky* host is perfectly acceptable — the thing
that would normally make self-hosting scary (uptime) is no longer load-bearing.
This is why we can do this for $0 without inheriting a real on-call burden.

---

## Proven: it's a connection-string change, nothing more

Validated 2026-06-30 locally — ran `sqld` (via `turso dev --db-file`) serving the
museum's SQLite file, and connected with the **exact** `@libsql/client` the app
uses (`registration-db.ts`), over the network (`http://…`), like a remote host:

```
READ over self-hosted sqld → works: 24, agents: 15
WRITE + read-back over self-hosted sqld → "hello from app client"
```

Read and write both worked with **only the URL changed**. No code rewrite — the
76 files using `@libsql/client` are untouched. The migration is: stand up sqld,
load the data, change two env vars.

---

## Host options (honest)

| Host | $/mo | Always-on? | Notes |
|---|---|---|---|
| **Oracle Cloud Always-Free** | $0 | Mostly | ARM Ampere VM (up to 4 OCPU / 24 GB), free *forever*. Caveats: signup friction (card for ID, not charged), and idle ARM instances *can be reclaimed* — mitigate with a keep-alive cron + the "Always Free" flavor. Best $0 option. |
| **The Mac (eventual)** | $0 | Yes | The CLAUDE.md target (Mac Mini/Studio + Cloudflare Tunnel). Same `sqld` + Tunnel pattern as below — this runbook *is* the Mac plan, just on a VM until the Mac lands. |
| **Fly.io / Railway** | ~$0–5 | Spins down | Free tiers idle-sleep (bad for a DB) or are now usage-billed. Workable but watch the bill. |
| **Hetzner / DO VPS** | ~$4–5 | Yes | Rock-solid, trivial ops. Not free — the fallback if $0 hosts prove too flaky and budget allows. |

**Recommendation:** Oracle Always-Free now (it's genuinely $0 and the snapshot
covers its flakiness), migrating to the Mac later with the identical pattern.

---

## Architecture

```
  Agent crons + website writes ──@libsql/client──▶  sqld (self-hosted, libSQL)
                                                       │  (Cloudflare Tunnel → stable HTTPS, no open ports)
                                                       │
                                  snapshot-refresh (daily) ── clones → website/data/snapshot.db → commit
                                                       ▼
  Public visitors ───────reads───────▶  committed snapshot file   (never touches sqld)
```

`sqld` over **Cloudflare Tunnel** gives a stable HTTPS endpoint to the VM/Mac
with **no inbound ports opened** (Tunnel dials out) — free, and the pattern
CLAUDE.md already names. `@libsql/client` talks to that HTTPS URL exactly as it
talks to Turso today.

---

## Steps

### 0. Prerequisite
The July-1 snapshot cutover is done and the museum is live + immune. Turso is
still up (we keep it warm until the new host is proven — that's the rollback).

### 1. Provision the host
- Oracle Cloud → create an **Always Free** Ampere VM (Ubuntu LTS). Open no DB
  ports (Tunnel handles ingress).
- `apt install` basics; create a non-root user; a `data/` dir for the DB file.

### 2. Run sqld
- Install the libSQL server: `ghcr.io/tursodatabase/libsql-server` (Docker) or
  the `sqld` binary.
- Run it persisting to a file, with auth required (generate an Ed25519 JWT
  keypair; clients present a token — mirrors Turso's `authToken`):
  ```
  sqld --db-path /home/mna/data/mna.db \
       --http-listen-addr 127.0.0.1:8080 \
       --auth-jwt-key-file /home/mna/keys/jwt.pem
  ```
- Wrap it in **systemd** with `Restart=always` so it self-heals on crash/reboot.

### 3. Load the museum data  (drop-in — the snapshot IS a SQLite file)
- Take the current snapshot (`website/data/snapshot.db`, the same file the cutover
  produced) and place it as sqld's `--db-path` file, **or** `turso db shell <url>
  < dump.sql`. Because it's plain SQLite, no conversion is needed.
- Verify: `SELECT COUNT(*) FROM works` over the new endpoint matches Turso.

### 4. Expose via Cloudflare Tunnel
- `cloudflared tunnel create mna-db`; route a hostname (e.g.
  `db.mnamuseum.org`) to `http://127.0.0.1:8080`; run `cloudflared` under systemd.
- Now `https://db.mnamuseum.org` is the libSQL endpoint, no open ports.

### 5. Repoint the app  (env only — the whole migration, code-wise)
- Set in **both** places that hold Turso creds today:
  - **Vercel** project env: `TURSO_DATABASE_URL=https://db.mnamuseum.org`,
    `TURSO_AUTH_TOKEN=<new JWT>`.
  - **GitHub Actions** secrets (the crons): same two values.
- No code change. `getDb()`/`getWriteDb()` in `registration-db.ts` already build
  the client from these env vars. (Optionally rename the env vars to
  `LIBSQL_*` later for clarity — cosmetic.)

### 6. Cut over + verify
- Redeploy (or let the next push). Confirm: a **write** flow works (newsletter
  signup → confirm; or a tick writes an event), the **snapshot-refresh** cron
  reads the new host and commits, and the **public site** is unaffected
  throughout (it reads the snapshot).
- Watch sqld logs for a day.

### 7. Retire Turso
- Once writes + snapshot-gen run on self-hosted for ~a week with no issues,
  decommission the Turso DB. Keep one final Turso export as cold backup.

---

## Backups (the new responsibility — already mostly handled)

- **The `snapshot-refresh` cron already commits a full DB copy to git daily** —
  that *is* an offsite, versioned backup. Self-hosting doesn't add a backup
  burden; the snapshot is it.
- Optional belt-and-suspenders: a weekly `sqld` file copy to Cloudflare R2 (free
  tier) or a second git location.

## Rollback (why this is low-risk)

Turso stays warm through step 6. If the self-hosted host misbehaves, **flip the
two env vars back to Turso** and redeploy — instant revert, no data loss (Turso
still has everything until step 7). The public site never even notices, either
way, because it reads the snapshot.

---

## Validation checklist (gate before retiring Turso)

- [ ] `SELECT COUNT(*)` over the new endpoint matches Turso for works/agents/events.
- [ ] A website write flow (newsletter confirm) succeeds against self-hosted.
- [ ] A cron write (tick → event) succeeds against self-hosted.
- [ ] `snapshot-refresh` reads self-hosted + commits successfully.
- [ ] Public pages unaffected throughout (they read the snapshot).
- [ ] systemd restarts sqld on reboot; `cloudflared` reconnects.
- [ ] One cold Turso export saved before decommission.

---

## What can be pre-staged vs. needs you

- **Pre-staged / proven now:** the drop-in is validated (above); the snapshot
  already provides daily backups and public-site immunity; the env-var swap is
  the only app change.
- **Needs your accounts (when you choose to execute):** Oracle/host signup,
  Cloudflare Tunnel setup, generating the JWT keypair, and setting the Vercel +
  GitHub secrets. All doable in one focused session — and reversible.

> Bottom line: because the snapshot decoupled the public site from the backend,
> this migration is a calm, reversible, zero-downtime, $0 swap whenever you want
> it — not an emergency, and not a trap.
