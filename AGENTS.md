# Museum of Nonhuman Art — Codex Context

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

## Virtual museum authority (as of v1.1 Curator amendment)

- **Curator (MNA-CU-0001 v1.1)** — extends the Curator's long-standing exhibition authority into spatial curation of the virtual museum. The Curator assigns canonized works to gallery spaces (Gallery West, East, South, Sculpture Court, Exhibition Hall, Chamber, Solo Exhibition Hall), selects the Chamber's monumental featured work, selects the Originator featured in the Solo Exhibition Hall, designs themed group exhibitions in the Exhibition Hall, and may move 3D sculptures into 2D gallery spaces when curatorially warranted. Every spatial decision is recorded as a `curatorial_decision` event.
- **Installer (MNA-IN-0001)** — realizes the Curator's spatial decisions. Reads curatorial directives and writes installation records; tracks every entry, rotation, and exit in the virtual museum. Operational execution only — no independent placement, evaluation, or curatorial authority.
- **Conservator (MNA-CV-0001)** — attends to the rendered integrity of canonized works in the museum. Validates that works render correctly across all display contexts, performs bounded safe recoveries on rendered representations (never on the original payload), and flags works needing human or code-level intervention. Diagnostic and reporting only — no evaluative or deaccessioning authority.

---

## Key documents (read these before building anything)

All founding documents are in `./founding-documents/`. Read in this order (and `governance/MNA-OPS-001` before touching anything that runs):

1. `MNA-FC-001-Founding-Charter-v1_0.md` — The institution's foundational law. Read first, always.
2. `MNA-WEB-IA-001-Website-IA-v1_0.md` — The complete IA and system design spec. This governs all website decisions.
3. `MNA-ACS-001-Agent-Constitution-Standard-v1_0.md` — The standard all agent constitutions follow.
4. `MNA-REG-001-Registry-Index-v1_0.md` — The complete agent registry with all 19 founding agents.
5. `./founding-documents/agents/` — All 19 individual agent constitutions.

---

## Website architecture

The website has three integrated layers sharing a single data model:

- **Institutional Layer** — static, canonical (`/`, `/about`, `/charter`, `/protocol`, `/agents`, `/agent/[id]`)
- **Collection Layer** — dynamic, data-driven (`/canon`, `/archive`, `/work/[id]`, `/originators`, `/evaluation`, `/critics`, `/exhibitions`)
- **Spatial Layer** — interactive museum walk-through (`/museum`)

Full sitemap and route definitions are in `MNA-WEB-IA-001-Website-IA-v1_0.md`.

---

## How the institution runs now (as of 2026-10-01)

The Phase 1 static build is long finished. The Museum runs **unattended**: scheduled GitHub Actions do the agents' work and the upkeep, and commit to `master` as `mna-operations`. The founding steward's last hand-written commit before 2026-10-01 was 2026-09-02, so a local checkout drifts dozens of commits behind within days.

**Start every session with `git pull`.** Then `gh run list -R The-Nonhuman-Institute/mna-museum -L 20` and `system/data/ops-escalations.json`, which holds the standing escalations last mailed to the steward. `.claude/SESSION-HANDOFF.md` (local, gitignored) carries the running state.

| Workflow | Schedule | Does |
|---|---|---|
| `combined-ticks` / `tick` | hourly | agents act: memory, consultations, ceremonies, production |
| `ops-round` | every 3h | MNA-OPS-001 §V checks, safe repairs, escalation mail |
| `institutional-check` | 09:00, 21:00 UTC | registrations, unevaluated works, accession notices |
| `snapshot-refresh` | daily 09:00 UTC | rebuilds `website/data/snapshot.db` (see `system/SNAPSHOT-ARCHITECTURE.md`) |
| `deploy-website` / `deploy-commons` | on push to `website/**` / `commons/**` | Vercel production deploy — never deploy by hand |
| `canary`, `previews-refresh`, `memory-*`, `canonization-digest` | various | health probe, preview capture, memory upkeep, weekly digest |

## Where things live

- `website/` — public site, mnamuseum.org. Next.js 14, Tailwind, reads Turso + the daily snapshot.
- `commons/` — the Commons (MNA-COM-001). Next.js 16; its own `AGENTS.md`.
- `terminal/` — the steward's private command centre, run locally and reached over Tailscale. Not public.
- `party/` — museum presence server (WebSocket), deployed on Railway.
- `system/` — agent pipeline (`src/`), operational scripts (`scripts/`), and the specs: snapshot, network handshake, witness seal, self-hosted libSQL, Cloudflare D1 migration.
- `founding-documents/` — charter, standards, registry, constitutions, `governance/` (succession, firewall, memory, comms, multi-authorship, **OPS-001**), `curatorial-record/`.
- `dataset/` — the Zenodo collection dataset.

**Database:** Turso (libSQL) is production. Free tier — the snapshot exists because re-querying Turso caused rows-read blackouts. `system/data/mna.db` is the old local SQLite, not the record.

**Models:** `MNA_LLM_CHAIN=groq,gemini`, both free tiers. Groq caps every model at 8,000 tokens a minute; Gemini has answered `403 PERMISSION_DENIED` since at least 2026-10-01 and wants payment, which there is no budget for. A prompt too large for Groq is evaluated whole through **Ollama Cloud** from the steward's Mac (signed in with `ollama signin`; Actions runners cannot reach it):

```
MNA_LLM_CHAIN=ollama MNA_LLM_PROVIDER=ollama MNA_MODEL_STANDARD=gpt-oss:120b-cloud OLLAMA_NUM_CTX=32768 \
  npx tsx system/scripts/evaluate-turso-works.ts --work <id>
```

The model that rendered each verdict is recorded on its `EVALUATION_RENDERED` event. The Mac itself (Intel i7, 16 GB) cannot run a credible evaluator locally.

## Working on it

`founding-documents/governance/MNA-OPS-001-Operations-and-Definition-of-Done-v0_1.md` is the operations standard. Read §III and §IV before changing anything that runs:

- **Definition of done:** `npm run verify` in `website/` (typecheck, lint, tests together) passes; a test would fail without the change; no fact is restated in a second place; output is looked at, not assumed; it works on production.
- **Contract tests enforce single sources.** `website/tests/ops-round.test.ts` fails if `ops-round.ts` runs a check §V does not document. Change both, together.
- **Operations is service, not judgment.** No code or session may evaluate, canonise, rank, retitle or alter a payload, speak for an agent, approve a registration, or delete anything. Running the Council is allowed; choosing its verdict is not.
- Commit messages say what was wrong, in a sentence, and what changed — see `git log`.

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

---

## Institutional monitoring

At session start, `scripts/check-queue.sh` runs (read-only) and reports pending registrations and submitted works from Turso. **Always acknowledge and act on these alerts**, even if the current task is unrelated — they are institutional obligations.

The rest is scheduled, not session-bound:

- `institutional-check` (Actions) — pending registrations, unevaluated works, unsent accession notices; emails the steward.
- `ops-round` (Actions) — the §V checks. Steward-settled findings live in `system/data/ops-reviewed.json`.
- `system/scripts/evaluate-turso-works.ts` — runs the Evaluation Council against Turso; `--work <id>` resumes, asking only evaluators who have not voted.
- `website/scripts/send-accession-notices.ts` — Notices of Accession.

Do not run `system/scripts/institutional-check.ts` casually: it sends mail.

Steward notification email: mnamuseum@gmail.com
Emails sent via Resend from registry@mnamuseum.org
