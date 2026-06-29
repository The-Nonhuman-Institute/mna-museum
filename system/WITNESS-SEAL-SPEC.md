# Witness Seal — Build Spec (v2, anonymous-claim model)

A commemorative MNA strikes for those who choose to witness an exhibition
opening. A unique, numbered, engraved-obsidian-plate **seal** — claimed
anonymously during the live ceremony, kept and shared by the guest like any
public work. Not a certificate, not an NFT, **not a record of who attended.**

> Status: design + look LOCKED 2026-06-26. Model revised to **anonymous-claim**
> 2026-06-27 — both Keeper-flagged gates CLEARED (see §13). Build is post-July-1.
> See [[project_witness_seal]] memory.
>
> **Locked render reference:** `website/scripts/seal-real-glyph-prototype.ts` is
> the approved render — port verbatim into the Phase B `next/og` route. Locked
> params: portrait 820×1060; obsidian radial `#141417→#060607`; two hairline
> inset frames (0.07 / 0.10 paper opacity); engraving = 3 layers per mark —
> shadow `#000`@0.6 offset(1.0,1.2), groove `#aeaeb6`, light-catch `#EAE7E2`@0.3
> offset(−0.6,−0.7); featured mark 196px @ y320, satellites 76px @ y≈478, faint
> constellation lines `#EAE7E2`@0.12. Cormorant numerals + Inter small-caps.

---

## 1. Principles

- **Humans witness; they do not create.** The seal marks *having been present*
  at an institutional moment — the institution's mark, not the guest's artwork.
- **The audience is unsurveilled.** No accounts, no RSVP, no email, no record of
  *who*. This is non-negotiable: it's what `/events/access` publicly promises
  and what the Keeper consultation requires (§13).
- **Shareable like a work.** Public seal page + OG image + download. A guest may
  post it or not, exactly as they may share any canon work.
- **$0.** Reuses the glyph library, `next/og`, the snapshot read/write split.

---

## 2. The anonymous-claim model

The earlier RSVP/email design gated attendance by **identity** and so collided
with the charter. This model gates by **presence-in-the-moment** instead:

- **No RSVP, no email, no account, no registration.** Nothing identifies a guest.
- The seal is **claimable only during the live ceremony's window**, by anyone
  present (see §6 for how presence is proven — both options anonymous).
- The guest **downloads/keeps** it and shares it freely. No delivery to a person.
- The institution records **only the anonymous issuance** — "Seal No. 37 issued
  for EVT-00003 at [time]" — a count of tokens struck, never a registry of
  people. (Keeper: same record category as "exhibition published.")
- Numbering is **claim-order**; scarcity is the **window closing** — never
  reissued. Real scarcity by time, not artificial caps.

---

## 3. Data model

One table; **no identity columns by design.** Writes → `getWriteDb()` (Turso);
the public seal page reads the snapshot.

```sql
CREATE TABLE IF NOT EXISTS seals (
  id            TEXT PRIMARY KEY,     -- opaque slug; the seal's public URL
  ceremony_id   TEXT NOT NULL,        -- EVT-xxxxx (the opening)
  seal_number   INTEGER NOT NULL,     -- per-event claim-order ordinal
  seal_seed     TEXT NOT NULL,        -- hash(ceremony_id + id) → deterministic render
  issued_at     TEXT NOT NULL DEFAULT (datetime('now'))
  -- NO email, NO ip, NO user agent, NO identity. Intentionally.
);
CREATE INDEX IF NOT EXISTS idx_seals_ceremony ON seals(ceremony_id, seal_number);
```

Presence proof (b) needs a per-ceremony passphrase, revealed at the close and
validated server-side at claim. Store on the ceremony (no new identity data):

```sql
ALTER TABLE ceremonies ADD COLUMN seal_passphrase TEXT;  -- set by orchestrator/Curator; revealed at the closing
```

`seal_seed` makes the render fully deterministic — the plate at a given URL is
the same forever.

---

## 4. The mark — the speakers' REAL symbols (never invented)

**Hard rule (unchanged): the seal's mark is composed from the actual
`visual_symbol` of the Originators who spoke** — resolved via
`resolveVisualIdentity` → `agents.visual_symbol` (Turso) / `visual-identities.json`
fallback. **Never** `pickFamily()` / procedural glyphs / RNG over `registry_id`
(that fabricates identity — see [[feedback_visual_identity_stability]]).
Recolor-only for the obsidian context; forms/opacities/widths preserved verbatim.
Featured Originator centred, other speakers as satellites, names inscribed.
Per-seal uniqueness comes only from the seeded *constellation weave*, not the
symbols. (Full render = the locked reference script.)

---

## 5. The claim flow + presence proof

1. During the ceremony's live window (from the `ceremonies` row the orchestrator
   already opens/closes), the **live surface** (`/museum` and/or the event page)
   shows a **"Claim your Witness Seal"** affordance.
2. **Presence proof — STEWARD DECISION (Keeper declined; §13):**
   - **(a) Time-window only** — the affordance simply appears during the window.
     Simplest; a link could be passed around. Record: claims-during-window.
   - **(b) Passphrase at the close** — the Curator/ceremony reveals a word at the
     closing; the guest enters it to claim. You had to witness the close. Record:
     claims-after-passphrase. (Keeper: "a slightly richer event structure.")
3. Claiming `POST`s to mint a `seals` row (`getWriteDb`) — assigns the next
   `seal_number`, sets `seal_seed`, returns the seal's permanent URL. **No
   identity captured.** Optional soft anti-spam: one claim per browser session
   (cookie), never a server-side identity.
4. The guest lands on their **permanent seal page** (§7) and downloads it.

---

## 6. The seal page + sharing

`/seal/[id]` — permanent, public, provenance-complete (like `/work/[id]`):
the interactive engraved plate (tilt + light-sweep), the **reverse/record**
(works shown + links, speakers, the opening, the number), an **OG image**
(`next/og`, the locked render) so it previews when shared, and a **PNG download**
(the portable collectible). Shareable exactly like a work.

**The "collection"** is simply the seals a guest *keeps* — their saved
images/links. No account, no server-side gallery. This is *more* charter-
consistent than the earlier Register idea, not less.

---

## 7. Issuance + the record  (issuer problem — RESOLVED)

The earlier "issued under the Keeper's authority" framing is **gone** — it caused
the attestation problem. Under the anonymous model:

- **MNA issues** the seal as a ceremonial artifact (no person certified).
- **The Keeper merely records the anonymous issuance event** — within its
  function, no constitutional amendment needed. Write a `SEAL_ISSUED` event (or a
  per-ceremony batch/count) with `ceremony_id` + `seal_number` + time, **no
  identity**.
- **Open steward classification (Keeper's question, §13):** is the seal a
  *ceremonial artifact issued by MNA* (→ Keeper records issuance, recommended —
  it's provenance) or a *souvenir external to the record* (→ not recorded)?

---

## 8. Integration

- **Writes** (claim/mint, issuance event) → `getWriteDb()` (Turso).
- **Public seal pages** → `getDb()` (snapshot). The `seals` table rides the
  snapshot clone automatically; a just-claimed seal's page may read live
  (`getWriteDb`) for the first render so the guest sees it immediately.
- **Live window** from the ceremony orchestrator (`ceremonies-tick` /
  `ceremony-live`). The claim affordance + (option b) passphrase surface on the
  live ceremony view.
- **Reveal (nice-to-have):** the plate can "crystallize" on claim — a client
  animation over the deterministic SVG.

---

## 9. `/events/access`

**No contradiction-amendment needed** — the page's promises ("no record of your
presence," "no sign-up," "no emails for attendance") all stay literally true.
Optional: a small **additive** line disclosing that an anonymous commemorative
may be claimed during a live opening. (Additive disclosure, not a reversal — far
lighter than the amendment the RSVP design would have required.)

---

## 10. Steward decisions — RESOLVED (2026-06-29)

1. **Seal classification → RECORDED CEREMONIAL ARTIFACT.** MNA records the
   anonymous issuance as provenance; the Keeper writes the `SEAL_ISSUED` event
   (count only, no identity). §7 applies.
2. **Presence proof → (b) PASSPHRASE AT THE CLOSE.** The Curator/ceremony reveals
   a word at the closing; the guest enters it to claim. You had to witness the
   close. The passphrase is per-ceremony, surfaced on the live ceremony view at
   the closing segment; store it on the `ceremonies` row metadata (or a
   `ceremony_passphrase` field), validated server-side at claim. Record:
   claims-after-passphrase.
3. **Numbering → PER-EVENT CLAIM-ORDER.** "Witness No. N — [Opening]." Each
   opening is its own numbered set (`seal_number` resets per `ceremony_id`).
4. **Debut → PILOT AT THE AUG 24 OPENING ("The Unfinished as Method", EVT-00004),
   NOT July 10.** The anonymous model has no retroactive net (§12), so the live
   claim must work on the night; piloting at the second opening keeps the
   irreplaceable First Opening clean and de-risks the build. July 10 runs without
   seals.

---

## 11. Charter-compliance checklist (gate before ship)

- [ ] No identity captured anywhere (no email/account/IP-as-identity/registry).
- [ ] Claim available only during the live window; attendance otherwise
      anonymous + ungated.
- [ ] `/events/access` remains literally true (additive disclosure only).
- [ ] Record holds counts/issuance events only — never who claimed.
- [ ] Seal framed as MNA-issued artifact, never guest authorship.
- [ ] Marks use real `visual_symbol`, never derived (§4).

---

## 12. Milestones + the July-10 consequence

⚠ **The anonymous model removes the retroactive safety net.** With no email/
identity, there is no way to deliver seals after the fact — **the claim must work
*live* at the opening.** So the seal can't "follow later" the way the RSVP design
allowed.

- Reads return July 1, so by **July 10** the DB holds all four Frequency
  speakers' real `visual_symbol`s — the generator can render correctly.
**DECIDED → pilot at the Aug 24 opening** (EVT-00004, "The Unfinished as Method").
July 10 runs without seals — the irreplaceable First Opening stays clean, and the
build gets ~7 weeks (not ~10 days) with the live claim de-risked. The Aug 24
speakers' glyphs (OR-0001/0005/0006) are already in the JSON fallback, so the
render works regardless of DB state.

**M1** generator (port locked render, real `visual_symbol`, deterministic).
**M2** claim flow + presence proof (chosen route) + `seals` table.
**M3** seal page (interactive + reverse + OG + download) + `SEAL_ISSUED` record.
**M4** reveal animation (optional). **M5** `/events/access` additive line.

---

## 13. Keeper consultation record (MNA-KP-0001)

- **2026-06-26 (RSVP design):** flagged two tensions — (1) RSVP/email/witness-
  record contradicts the published `/events/access` commitments → would create an
  incoherent archive; (2) issuing a keepsake certifying a named human exceeds the
  Keeper's function (it records, does not attest to external parties). Declined to
  recommend; named both as steward decisions.
- **2026-06-27 (anonymous-claim design):** **both tensions CLEARED.** Recording
  anonymous issuance ("a seal was struck") is within function — same category as
  "exhibition published"; no person named, no attestation. Raised the
  classification question (§10.1). **Declined to choose the presence-proof route**
  (exceeds its authority; the steward's, "arguably the Ambassador's").

These consultations should be entered into the institutional record (the Keeper's
own standing). Offer pending.
