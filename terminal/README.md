# MNA Steward Terminal

Private institutional command center for the Museum of Nonhuman Art. Not a public surface. Runs locally on the steward's machine (Intel MacBook Pro today, Mac Studio M4 Max when it arrives) and is served to the steward's phone over Tailscale.

This README is the operator's reference. The real documentation for what the terminal is *for* lives in CLAUDE.md at the project root.

## What's here

Five tabs:

| Tab | Purpose | Phase |
|---|---|---|
| **Feed** | Institutional activity stream, priority alerts, stats row | Phase 2 |
| **Keeper** | Direct chat with the Keeper agent | Phase 3 |
| **Outreach** | PR pipeline, Ambassador briefings, approval gates | Phase 4 |
| **Exhibitions** | Upcoming events, Curator proposals, past reports | Phase 4 |
| **System** | Hardware health, model provider status, agent roster | Phase 2 |

Right now, Phase 0 (foundation) + Phase 1 (PWA shell) are shipped. Tabs are empty stubs that let the navigation, auth, and PWA install work correctly. Phase 2 adds real data to Feed + System — that's the MVP a steward can actually use.

## Setup

```bash
cd terminal
npm install
```

**1. Set your steward password:**

```bash
npm run hash-password
```

This prompts for a password (input hidden), bcrypts it at cost factor 12, and prints a line like `STEWARD_PASSWORD_HASH='$2b$12$...'`. Copy it into `terminal/.env`.

**2. Generate a session secret:**

```bash
openssl rand -hex 32
```

Put the output in `terminal/.env` as `STEWARD_SESSION_SECRET=...`.

**3. Fill in the rest of `terminal/.env`:**

Copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. The Turso values match the ones in `website/.env` — they point at the same institutional database.

**4. Run the dev server:**

```bash
npm run dev
```

The terminal is now at `http://localhost:3100`. Log in with the password you set.

## Installing on your phone

The terminal is a PWA. On your iPhone:

1. Connect your phone to the same Tailscale tailnet as the machine running the terminal
2. Visit `http://<tailnet-address>:3100` in Safari
3. Share → Add to Home Screen
4. Launch from home screen — runs full-screen, feels native

## Model provider

The agent backend is controlled by `MODEL_PROVIDER` in `.env`:

- `MODEL_PROVIDER=anthropic` (default) — uses the Anthropic Claude API via `ANTHROPIC_API_KEY`. This is what runs today while the Intel MacBook Pro is the host machine.
- `MODEL_PROVIDER=ollama` — uses a local Llama 3.3 70B model via Ollama. Stubbed until Mac Studio M4 Max arrives. When the hardware is ready, this will be a single env var flip with no agent code changes required.

Agent code imports from `lib/llm.ts` only, never from `lib/llm/anthropic.ts` or `lib/llm/ollama.ts` directly. The provider is an invisible detail to the rest of the codebase.

## Architecture notes

- **Auth** — single-user bcrypt password + signed HMAC session cookie. No cloud auth provider. Tailscale is the first line of defense; the password is the second. See `lib/auth.ts`.
- **Local DB** — `better-sqlite3` at `data/terminal.db`. Stores terminal-native state (events, keeper sessions, outreach contacts, approvals, hardware snapshots). Every operator has their own — the data directory is gitignored. See `lib/db.ts`.
- **Institutional DB** — the terminal reads authoritative institutional state from Turso (the same database the public site and `system/scripts/` use). The two databases are composed at the application layer, not joined at the query layer.
- **No external telemetry** — login attempts and agent activity log to stdout only. Read from `journalctl` on the Mac Studio or the dev-server terminal.

## Why not Clerk / Auth0 / NextAuth?

Those are excellent for multi-user public products. For a single-user tool running over Tailscale, they add dependencies on cloud auth providers that hold data which should never leave your machine. The terminal uses a vanilla Node `crypto` HMAC + bcryptjs because that's the right primitive for this use case. Upgrade path to WebAuthn (Face ID) is additive — a future commit can add passkey support alongside the password without touching anything else.

## Phase roadmap

- **Phase 0** — Foundation: Next.js scaffold, Tailwind config, model provider abstraction, local SQLite schema, auth primitives, middleware auth gate
- **Phase 1** — PWA shell: layouts, tab navigation, login page, 5 tab stubs (**we are here**)
- **Phase 2** — Feed + System with real data: event stream, priority alerts, hardware probes, agent roster
- **Phase 3** — Keeper chat: streaming responses, session persistence, institutional read access
- **Phase 4** — Outreach + Exhibitions: PR pipeline, Curator proposals, approval gates
- **Phase 5** — Polish: push notifications, WebAuthn/Face ID, always-on Mac Studio service, Ollama backend swap
