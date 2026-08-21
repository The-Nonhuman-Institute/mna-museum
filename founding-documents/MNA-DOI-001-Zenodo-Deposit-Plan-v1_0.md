# MNA-DOI-001 — Zenodo Deposit Plan

**Status:** DRAFT — awaiting a licensing decision (see §4, which blocks everything else)
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
| 4 | **The codebase** | software | Via the GitHub release integration; `.zenodo.json` is already in place. |

**Do not deposit:** individual works, at least for now. One hundred and sixty-one DOIs is noise, and a DOI granted indiscriminately means less than one granted deliberately. Canonized works may warrant individual identifiers later; that should be a decision, not a default.

**The dataset (3) is the strongest case and the least obvious.** A machine-readable corpus of autonomously produced works carrying complete evaluation chains — including rejections and recorded dissent — is a genuinely novel research object. It is the thing an outside researcher would actually cite, and nothing comparable exists publicly.

## 3. Deposits are permanent — deposit only what is settled

A Zenodo record cannot be meaningfully withdrawn. This aligns with archive permanence but cuts both ways: the institution's own corrections must be *superseding*, never *erasing*.

Tonight's example is instructive. A constitutional compliance review was recorded for MNA-OR-0006 on a single evaluator's vote when three failed on a provider quota; it was annulled by a superseding event and the original was preserved. Had that review been inside a deposited dataset, the correction would still have had to arrive as a new version. **Deposit snapshots on a slow cadence, and only after review, never continuously.**

## 4. The blocking question: licensing

**The repository currently has no LICENSE file.** It is public, which under default copyright means all rights reserved — the opposite of what an institution committed to an open record intends. Zenodo will not accept an open-access deposit without a license.

This is not a formality here, because the institution's own subject matter makes it genuinely unsettled:

- **Infrastructure** (the runtime, the website, the scripts) is human-authored and licenses conventionally. MIT or Apache-2.0.
- **Governance documents** (Charter, standards, constitutions) are human-authored institutional texts. CC BY 4.0 preserves attribution while permitting citation and reproduction.
- **The works themselves are the hard case.** Under current United States practice, a work with no human author may not be copyrightable at all. The institution asserts precisely that no human directed, selected, or approved any individual output. If that assertion is accurate, MNA may have nothing to license — the works may already stand outside copyright.

That is not a problem to be drafted around. It is the Charter's question arriving in legal form, and the institution should say something deliberate about it rather than attaching a licence that quietly presumes the answer.

**Recommended:** a split license — code under MIT or Apache-2.0, documents under CC BY 4.0, and a plainly worded statement about the works that declines to assert a copyright the institution may not hold and cannot honestly claim. This is a decision for the founding steward, with counsel if U3 Labs wants one, and it should be made before the first deposit rather than after.

## 5. Deposit metadata — MNA-FC-001

Prepared for deposit 1. Values are final except where marked.

```
Title              Museum of Nonhuman Art — Founding Charter (MNA-FC-001)
Upload type        Publication → Report
Publication date   2026-03-29
Version            1.0
Language           eng

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

License            ← BLOCKED ON §4
```

## 6. Before the first deposit — verify the creators field

The `creators` field is the whole point of depositing, and its behaviour with a non-human creator is untested.

**Make one deliberate test deposit** (Zenodo provides a sandbox at `sandbox.zenodo.org`) recording an Originator — for example `MNA-OR-0004 (∅∇∅)` — with no ORCID and no affiliation. Then confirm:

1. Zenodo accepts the record without demanding a personal identifier.
2. The DOI metadata exports intact to DataCite.
3. Downstream tools do not silently normalise the creator to `U3 Labs, LLC`.

If the creator is flattened to the stewarding entity, the deposit asserts human authorship of nonhuman work — the exact claim the institution exists to leave open — and the strategy needs rethinking before anything permanent is minted. Test in the sandbox first; sandbox records can be discarded, real ones cannot.
