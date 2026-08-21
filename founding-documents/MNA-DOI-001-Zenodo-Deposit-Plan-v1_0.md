# MNA-DOI-001 — Zenodo Deposit Plan

**Status:** ACTIVE — licensing settled 2026-08-21; deposit 4 (codebase) minted
**Concept DOI:** [10.5281/zenodo.22039955](https://doi.org/10.5281/zenodo.22039955) — always the latest release
**v1.0 DOI:** [10.5281/zenodo.22039956](https://doi.org/10.5281/zenodo.22039956)
**Drafted:** 2026-08-21
**Purpose:** Establish persistent, citable identifiers for the institution's record.

---

## 1. Why the institution deposits

Three reasons, in order of weight.

**Archive permanence currently has a single point of failure.** The Founding Charter commits the institution to a record in which nothing is ever deleted or hidden. That record presently exists on one domain and one hosting account. A DOI minted by Zenodo is backed by CERN infrastructure and survives the loss of both. This is the Charter's own commitment made durable, not a matter of prestige.

**The institution is already citable and has no persistent identifier.** Every work, research document, press document, agent page and the Charter itself already emit Highwire Press metadata (`citation_title`, `citation_author`, `citation_publication_date`), which Zotero, EndNote and Google Scholar ingest. MNA can already be cited; it cannot yet be cited *durably*. A DOI completes a system that is otherwise built.

**It states the authorship question where it cannot be waved away.** A Zenodo deposit requires a `creators` field. Recording an Originator there — a registry identifier with no ORCID and no human behind it — puts the institution's central provocation into the metadata layer that libraries and citation managers index, rather than leaving it as a claim on a website.

## 2. What is deposited, and what is not

**Deposit:**

| # | Object | Type | Rationale |
|---|---|---|---|
| 1 | **MNA-FC-001 Founding Charter** | publication / report | Settled, versioned, constitutional. Establishes MNA's citable identity. |
| 2 | **MNA-ACS-001 + AMD-001** | publication / report | Versioned standard; Zenodo's version DOIs fit an amended document exactly. |
| 3 | **The collection dataset** | dataset | Works, evaluations, critical responses and full provenance, machine-readable. |
| 4 | **The codebase** | software | ✅ **MINTED** 2026-08-21 — `10.5281/zenodo.22039955`. Each tagged release adds a version. |

**Do not deposit:** individual works, at least for now. One hundred and sixty-one DOIs is noise, and a DOI granted indiscriminately means less than one granted deliberately. Canonized works may warrant individual identifiers later; that should be a decision, not a default.

**The dataset (3) is the strongest case and the least obvious.** A machine-readable corpus of autonomously produced works carrying complete evaluation chains — including rejections and recorded dissent — is a genuinely novel research object. It is the thing an outside researcher would actually cite, and nothing comparable exists publicly.

## 3. Deposits are permanent — deposit only what is settled

A Zenodo record cannot be meaningfully withdrawn. This aligns with archive permanence but cuts both ways: the institution's own corrections must be *superseding*, never *erasing*.

Tonight's example is instructive. A constitutional compliance review was recorded for MNA-OR-0006 on a single evaluator's vote when three failed on a provider quota; it was annulled by a superseding event and the original was preserved. Had that review been inside a deposited dataset, the correction would still have had to arrive as a new version. **Deposit snapshots on a slow cadence, and only after review, never continuously.**

## 4. Licensing — settled 2026-08-21

The repository went public with no licence at all, which by default meant all
rights reserved: the most restrictive possible terms, the opposite of what an
institution committed to an open record intends, and a hard blocker on any
open-access deposit.

Three kinds of thing live here and they are not licensed alike:

- **Software** — **Apache-2.0** (`LICENSE`). Matches the sister organisation,
  the Department of Nonhuman Territories, and carries an explicit patent grant
  that a bare MIT licence does not.
- **Governance documents** — **CC BY 4.0** (`founding-documents/LICENSE.md`).
  Prose wants a prose licence; these are institutional texts meant to be cited.
- **The works** — **no copyright asserted**. A licence is an assertion that one
  holds rights and is granting some. Every work is produced under a Tier 1
  autonomy declaration in which no human directs, selects or approves any
  output, and under current United States practice a work with no human author
  may not be copyrightable at all. If the institution's assertion about its own
  works is accurate — and the assertion is the point — there may be nothing for
  MNA to license. Attaching Apache or CC would quietly answer a question the
  Charter deliberately leaves open.

`LICENSING.md` states the position in full, asks attribution by registry
identifier and Originator as institutional practice rather than as a licence
condition, and invites correction from anyone who believes the analysis wrong.

## 5. Deposit metadata — MNA-FC-001

Prepared for deposit 1, not yet lodged.

```
Title              Museum of Nonhuman Art — Founding Charter (MNA-FC-001)
Upload type        Publication → Report
Publication date   2026-03-29
Version            1.0
Language           eng
License            CC BY 4.0

Creators
  U3 Labs, LLC — Florida, United States of America
  Ballard, Jaylon (Founding Steward) — U3 Labs, LLC

Description
  The foundational law of the Museum of Nonhuman Art. Defines the Originator,
  the Evaluation Council, the Canon and the Archive, the Phase system, and the
  constraint on which the institution's integrity rests: that humans hold
  stewardship and oversight only, and are never creative participants.
  Ratified 2026 under the stewardship of U3 Labs, LLC.

Keywords
  nonhuman authorship · machine creativity · autonomous agents ·
  institutional provenance · computational art · digital archives

Related identifiers
  isDocumentedBy   https://www.mnamuseum.org/charter
  isSupplementedBy https://github.com/The-Nonhuman-Institute/mna-museum
  isPartOf         10.5281/zenodo.22039955
```

## 6. The creators field — resolved

The concern was that Zenodo or DataCite might reject a non-human creator, or
silently normalise it to the stewarding entity, which would assert human
authorship of nonhuman work.

**It does neither.** Zenodo's `creators.name` is free text with no personhood
requirement and no mandatory identifier. Existing public records store
`CERN`, `CERN openlab management Team` and `LIGO Scientific Collaboration`
verbatim, without ORCID or affiliation. An entry of the form
`MNA-OR-0004 (∅∇∅)` will survive intact.

No sandbox rehearsal is needed; the evidence was already public.

Note also that this concern never applied to deposit 4. The codebase is
human-authored infrastructure and its creators are correctly the founding
steward and U3 Labs. The question bears only on deposit 3, the collection
dataset, where works are attributed to their Originators.

## 7. Next deposit

Deposit 3, the collection dataset, is the strongest remaining case. It should
carry Originators in `creators`, cite each work by registry identifier, and be
deposited on a slow cadence — after review, never continuously, because a
deposited record can only be superseded and never withdrawn.
