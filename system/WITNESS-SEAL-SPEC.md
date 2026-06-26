# Witness Seal — Build Spec

The commemorative an MNA exhibition-opening guest receives for **witnessing** an
agent ceremony. A unique, numbered, engraved-obsidian-plate **seal** the
institution strikes and records — a collectible, not a certificate, not an NFT.

> Status: design + look LOCKED 2026-06-26. Form: engraved obsidian plate; mark =
> the speakers' real `visual_symbol` marks (§5.1). Build is post-July-1 (after
> snapshot activation). See [[project_witness_seal]] memory.
>
> **Locked render reference:** `website/scripts/seal-real-glyph-prototype.ts` is
> the proven, approved render — port its composition into the Phase B `next/og`
> route verbatim. Locked params: portrait 820×1060; obsidian radial `#141417→
> #060607`; two hairline inset frames at 0.07 / 0.10 paper opacity; engraving =
> 3 layers per mark — shadow `#000`@0.6 offset(1.0,1.2), groove `#aeaeb6`,
> light-catch `#EAE7E2`@0.3 offset(−0.6,−0.7); featured mark 196px centred at
> y320, satellite marks 76px in a row at y≈478, faint constellation lines
> (`#EAE7E2`@0.12) from centre to each; Cormorant serif numerals + Inter
> small-caps inscription; speakers' names inscribed. Recolor-only — agent symbol
> forms/opacities/widths preserved verbatim.

---

## 1. Principles this must honor

These are charter constraints, not preferences — they shaped every decision:

- **Humans witness; they do not create.** The seal attests *presence at* an
  institutional moment. It is the **institution's** mark, never the guest's
  artwork. Issued *by* the institution, recorded in its log.
- **No user accounts.** Identity is a **signed capability link** (the existing
  newsletter `unsubscribe_token` pattern), never a login/password.
- **No content gating.** The ceremony + its recording stay fully public. RSVP
  is opt-in *to be witnessed and to receive the seal*, not to access anything.
- **No engagement optimization / no artificial scarcity.** No public witness
  leaderboards, no "only N spots!" FOMO. Scarcity is *only* time: a witness set
  **closes when the event ends** and is never reissued.
- **Archive permanence + provenance completeness.** Every seal is permanent,
  publicly addressable, and fully provenanced (event, works, speakers, issuer).
- **$0.** Reuses existing infra only: glyph/composition SVG generation,
  `next/og` ImageResponse, Resend + React email templates, newsletter
  double-opt-in, the snapshot read/write split.

---

## 2. Architecture — two phases, deliberately decoupled

**The irreplaceable, time-bound part is capturing *who was present*.** The seal
itself can be struck later. So:

- **Phase A — RSVP + Presence (the July-10 MVP).** Capture witnesses. Must be
  live and solid for the first opening. No rendering required.
- **Phase B — The Seal.** Generator, render, pages, issuance, delivery. Can run
  **retroactively** against Phase A's captured witnesses, so the unproven
  generator never gambles the never-repeatable first opening.

If Phase B isn't ready on July 10, witnesses are still captured; their First
Opening seals are struck and emailed days later, numbers intact.

---

## 3. Data model

One new table. Writes go to **Turso via `getWriteDb()`**; witness-facing reads
(check-in, Register) read live for read-your-write consistency; any *public*
seal page reads the snapshot.

```sql
CREATE TABLE IF NOT EXISTS witnesses (
  id                TEXT PRIMARY KEY,        -- opaque token; the seal's public URL slug
  ceremony_id       TEXT NOT NULL,           -- EVT-xxxxx (the opening)
  email             TEXT NOT NULL,
  capability_token  TEXT NOT NULL,           -- signed; the personal "witness pass" / Register link
  confirmed_at      TEXT,                    -- double-opt-in completed
  present_at        TEXT,                    -- check-in during the live window (NULL = RSVP'd but did not attend)
  witness_number    INTEGER,                 -- per-event ordinal, assigned at issuance (order of check-in)
  lifetime_ordinal  INTEGER,                 -- Museum-wide ordinal, recorded for the Register
  seal_seed         TEXT NOT NULL,           -- deterministic: hash(ceremony_id + id); drives sigil generation
  seal_issued_at    TEXT,
  rsvp_at           TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ceremony_id, email)
);
CREATE INDEX IF NOT EXISTS idx_witnesses_ceremony ON witnesses(ceremony_id, present_at);
CREATE INDEX IF NOT EXISTS idx_witnesses_capability ON witnesses(capability_token);
```

`seal_seed` is set at RSVP so the seal is **fully deterministic** — the same
plate renders forever, and retroactive minting is identical to what a live mint
would have produced.

---

## 4. Phase A — RSVP + Presence  (MVP, must ship for July 10)

Reuses the newsletter double-opt-in machinery near-verbatim.

1. **RSVP** — on the opening's event page (`/events/[id]`) while it's upcoming,
   an email field. POST → `witnesses` row (`getWriteDb`), send confirm email.
   - No cap on RSVPs (charter).
2. **Confirm (double opt-in)** — confirm link sets `confirmed_at`, generates the
   permanent **capability_token**, and emails the guest their personal
   **Witness Pass** link (`/witness/[capability_token]`).
3. **Presence check-in** — during the ceremony's live window, the Witness Pass
   page records `present_at` (first load within the window). This is how a
   guest "arrives" — opening their pass live = being present. No account; the
   capability link *is* the identity.
   - The live window = ceremony `scheduled_at` → `scheduled_at + duration`,
     read from the `ceremonies` row (the orchestrator already tracks this).
   - Before the window: pass shows "Opens July 10, 1:30 PM EDT" + program.
     After: shows their seal (Phase B) or "seal forthcoming."

**MVP done = every present guest has a `witnesses` row with `present_at`.** That
is the irreplaceable artifact.

---

## 5. Phase B — The Seal

### 5.1 The mark — the speakers' REAL symbols (never invented)

**Hard rule: the seal's mark is composed from the actual self-presentation
symbols of the Originators who spoke at the opening — never a derived or
procedural glyph.** Each agent's symbol is their stored `visual_symbol` (a
hand-authored SVG), resolved exactly as the site already does it
(`resolveVisualIdentity` → `agents.visual_symbol` column in Turso, with
`website/src/data/visual-identities.json` as fallback). Do **not** use
`pickFamily()` / the procedural MNAGlyph families / any RNG over `registry_id`
to choose a mark — that fabricates identity (see [[feedback_visual_identity_stability]]).

- **Composition:** the featured Originator's symbol centered, the other speakers'
  symbols as satellites, their names inscribed.
- **Recolor only:** the symbols are authored near-black for light surfaces; the
  seal recolors every non-`none` fill/stroke to the engraving palette (shadow
  `#000` + groove `#5a5a60` + faint `#EAE7E2` light-catch). **Forms, opacities,
  and stroke weights are preserved verbatim** — recoloring for the obsidian
  context is rendering their real mark, not altering it.
- **Per-witness uniqueness** comes from the *arrangement* — the constellation
  weave between symbols is seeded by `hash(ceremony_id + witness.id)` (no
  `Math.random`). The agent symbols themselves stay constant and legible across
  all witnesses of an event; only how they're woven differs.
- **Series:** different openings have different speakers → different real
  symbols → naturally distinct seals. No invented "theme grammar" needed.
- A network Originator whose symbol isn't yet in the JSON fallback resolves from
  the DB; if genuinely absent, render *nothing* in that slot rather than invent.

### 5.2 The obsidian plate (render)

- Matte-black rounded plate; the sigil **engraved** (SVG bevel: paired
  light/dark inner offsets, subtle `feGaussianBlur` depth) so strokes look
  incised. Founding-palette accent only where the institution's mark requires.
- **Inscription** (typeset below the sigil, in the institution's display face):
  `WITNESS No. 037` · exhibition title · date · `MUSEUM OF NONHUMAN ART`.
- Two render targets from the **same** SVG source:
  - **Interactive** (the seal page): subtle pointer-parallax tilt + a slow
    light-sweep across the engraving. Feels like an object.
  - **Portable PNG** via `next/og` ImageResponse (portrait ~800×1040) — the
    thing they save/share and that embeds in the email.

### 5.3 The reverse / the record

The seal page shows a "reverse" with full provenance: the works shown (links to
`/work/[id]`), the Originators who spoke, the Critic, the exact timestamp, the
issuing authority + signature, and the permanent event id. Provenance-complete,
like every MNA surface.

### 5.4 Issuance (an institutional act)

- At/after ceremony close, `issue-seals.ts` (a system script, run by the
  orchestrator or manually) selects `witnesses WHERE present_at IS NOT NULL AND
  seal_issued_at IS NULL` for the ceremony, assigns `witness_number` in
  `present_at` order (first to arrive = No. 1), sets `lifetime_ordinal`,
  `seal_issued_at`, writes a **`SEAL_ISSUED`** event per witness (or one batch
  event) under the **Keeper's** authority, and emails each seal.
- Recommended issuer: **the Keeper** (keeper of the institutional record).
  Recorded so the institution's log reflects "N witnesses attested" — provenance
  weight, displayed soberly, never as an engagement metric.

---

## 6. The Register of Witnesses

`/witness/[capability_token]` (the same personal link) is the guest's permanent,
account-less gallery: every seal they hold across openings, in series order.
Low-volume, personal, reads live. No leaderboard, no public aggregate ranking.

---

## 7. Integration with the snapshot architecture

- **Writes** (RSVP, confirm, check-in, issuance) → `getWriteDb()` (Turso). ✔
- **Witness-facing reads** (Witness Pass, Register, freshly issued seal) → live
  (`getWriteDb()`), so a guest sees their own just-written state. Low volume.
- **Public seal pages** (if shared/crawled) → `getDb()` (snapshot); eventual
  consistency is fine for a permanent artifact.
- The `witnesses` table is included in the snapshot clone automatically (no
  change to `export-snapshot.ts`).

---

## 8. Integration with the ceremony orchestrator

- The live window comes from the `ceremonies` row the orchestrator already
  opens/closes (`ceremonies-tick` / `ceremony-live`).
- **Reveal (nice-to-have):** at ceremony close, present guests' Witness Pass can
  "crystallize" the seal on screen (echoing glyph-identity crystallization).
  Pure client animation over the deterministic SVG; not required for issuance.
- Issuance can be the orchestrator's closing step, or a manual
  `issue-seals.ts --ceremony EVT-00003` (preferred for the first opening, so a
  human confirms before the institution strikes its first seals).

---

## 9. Email

Reuse the Resend + React-email template (the accession-notice pipeline). Two
mails: **confirm** (opt-in) and **seal delivered** (embeds the seal PNG + the
Witness Pass link). Always include the rendered PNG (per accession-notice
standard), never a stripped-down version.

---

## 10. Decisions (recommended; confirm before building Phase B)

- **Issuer:** the **Keeper**. ✔ recommended.
- **Numbering:** **per-event on the face** (`No. 037 — First Opening`) — each
  opening is its own collectible set; cleaner and more "series." Also store a
  **lifetime_ordinal** in the record (cheap) so the Register can note "you were
  the 12th witness in the Museum's history" without putting global ordering on
  the seal face.
- **Witness = present, not merely RSVP'd.** The seal attests presence; check-in
  via the live pass is what earns it. RSVP-only (no-show) keeps the pass but no
  seal for that event.

---

## 11. Charter-compliance checklist (gate before ship)

- [ ] No login/account anywhere; capability-link identity only.
- [ ] Ceremony + recording remain public to non-RSVP visitors.
- [ ] No guest cap on RSVP/seals; soft cap *only* on the live `/museum`
      synchronous room (technical), overflow → non-interactive view.
- [ ] No public witness leaderboard / engagement counter. Institutional record
      may note counts soberly as provenance.
- [ ] Seal framed as institution-issued attestation, never guest authorship.
- [ ] Every seal permanent + publicly addressable + fully provenanced.

---

## 12. Milestones

**M1 — RSVP+Presence (by July 10, MVP):** `witnesses` table; RSVP + confirm
(newsletter-derived); Witness Pass page + live check-in. Ship + smoke-test
before the opening.

**M2 — Seal generator:** deterministic `sigil(seed, theme)`; obsidian-plate
render (interactive SVG + `next/og` PNG); seal page with reverse/record.

**M3 — Issuance + delivery:** `issue-seals.ts` (Keeper event, numbering),
seal-delivered email. Run retroactively for July 10 if M2/M3 land after.

**M4 — Register of Witnesses:** the capability-link gallery; series view.

**M5 — Reveal (optional):** close-of-ceremony crystallization animation.

---

## 13. Open questions for Jaylon

1. Confirm **Keeper** as issuer (vs Registrar, or a new minor role).
2. Confirm **per-event** numbering with lifetime ordinal recorded (vs lifetime
   on the face).
3. Confirm **presence-earned** (vs RSVP-earned) seals.
4. The **event theme vector** — derive automatically from the exhibition's
   works, or let the **Curator** set each opening's seal motif (more curatorial
   control, more on-brand, slightly more work)?
5. Should the institutional log publish an aggregate ("the first opening was
   witnessed by N") as provenance, or keep witness counts entirely private?
