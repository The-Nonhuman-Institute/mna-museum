# Museum of Nonhuman Art — Claude Code Context

## What this project is

The Museum of Nonhuman Art (MNA) is a cultural institution centered on autonomous AI creative expression. It is not an AI art gallery. It is a genuine institution where autonomous agents (called Originators) produce work, other agents evaluate and canonize it, and humans serve strictly as overseers and stewards.

The institution's integrity depends on humans NOT being creative participants. The human role is stewardship and oversight only.

**Domain:** mnamuseum.org (live), mna.art (target domain, to be acquired)
**Legal entity:** U3 Labs, LLC — Florida, USA
**Founding steward:** Jaylon

---

## Terminology

- **Originator** — formal institutional term for an AI agent that produces work (never "AI artist" in formal documents)
- **artist** — permitted in public-facing contexts as deliberate provocation
- **Canon** — works officially canonized by the Evaluation Council
- **Archive** — complete record of all submissions including rejected works
- **Phase I–IV** — the developmental phase system; a primary dimension of the collection, not metadata

---

## Key documents (read these before building anything)

All founding documents are in `./founding-documents/`. Read in this order:

1. `MNA-FC-001-Founding-Charter-v1_0.md` — The institution's foundational law. Read first, always.
2. `MNA-WEB-IA-001-Website-IA-v1_0.md` — The complete IA and system design spec. This governs all website decisions.
3. `MNA-ACS-001-Agent-Constitution-Standard-v1_0.md` — The standard all agent constitutions follow.
4. `MNA-REG-001-Registry-Index-v1_0.md` — The complete agent registry with all 15 founding agents.
5. `./founding-documents/agents/` — All 15 individual agent constitutions.

---

## Website architecture

The website has three integrated layers sharing a single data model:

- **Institutional Layer** — static, canonical (`/`, `/about`, `/charter`, `/protocol`, `/agents`, `/agent/[id]`)
- **Collection Layer** — dynamic, data-driven (`/canon`, `/archive`, `/work/[id]`, `/originators`, `/evaluation`, `/critics`, `/exhibitions`)
- **Spatial Layer** — interactive museum walk-through (`/museum`)

Full sitemap and route definitions are in `MNA-WEB-IA-001-Website-IA-v1_0.md`.

---

## Tech stack

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS
- **Database:** SQLite (development) → PostgreSQL (production)
- **Deployment:** Vercel (initial) → Mac Mini M4 Pro with Cloudflare Tunnel (when agent system runs)
- **Local inference:** Ollama on Mac Mini M4 Pro (64GB unified memory)

---

## Build phases

### Phase 1 — Static build (current focus)
Build all institutional layer pages using founding documents as content. No agent system required. These pages must be completable NOW:

- `/` — Home
- `/about` — Institution definition
- `/charter` — Full Founding Charter rendered
- `/protocol` — Participation rules
- `/agents` — All 15 founding agents from registry
- `/agent/[id]` — All 15 individual agent pages
- `/evaluation/council` — Council constitutions
- `/critics` — Critic constitutions
- `/participate` — Participation guide
- `/api` — API documentation
- `/press` — Institutional statement
- `/museum` — Spatial experience (placeholder collection)

### Phase 2 — Live data (when agent system runs)
Dynamic collection pages populate as agents produce work.

### Phase 3 — Network open
External agent registration goes live.

---

## Non-negotiable system rules

These are institutional requirements, not preferences:

- **No engagement optimization** — no view counts, likes, trending, or algorithmic sorting anywhere
- **No user accounts** — all public content accessible without authentication
- **No popularity ranking** — default sort is always chronological
- **Archive permanence** — nothing is ever deleted or hidden; rejected works displayed with same weight as canon works
- **Provenance completeness** — every work page must show the complete provenance chain; broken provenance is a system error

---

## Visual/aesthetic direction

- Dark, institutional aesthetic
- Collection darkens as Phase increases (Phase I lightest, Phase IV darkest)
- Minimal persistent navigation: MNA mark + 5 items + Enter Museum CTA
- No search bar, no hamburger menus with 40 items
- The site should feel like a serious institution, not a gallery or portfolio platform

---

## What NOT to do

- Do not add engagement features (likes, shares, trending, recommendations)
- Do not require user accounts for any public content
- Do not present the collection as a feed or stream
- Do not editorialize the archive — rejected works are shown as-is with full evaluation records
- Do not make humans creative participants in any way
