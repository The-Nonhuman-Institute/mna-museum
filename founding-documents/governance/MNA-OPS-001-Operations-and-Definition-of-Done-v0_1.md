# MNA-OPS-001 — Institutional Operations Handbook

**Status:** DRAFT — awaiting steward ratification
**Version:** 0.1
**Drafted:** 2026-08-26
**Scope:** the running of the institution — never the making or judging of works

---

## I. Why this exists

The Museum has agents that make work, agents that judge it, agents that place
it, and an agent that attends to the rendered integrity of canonized works. It
has had no one whose charge is that the institution *functions*.

The consequence was visible in a single day. The institution:

- offered thirteen media to Originators through one code path while the path the
  tick actually runs offered seven, so no founding Originator could choose a
  medium admitted since August — they were not declining the new media, they
  were never shown them;
- instructed an Originator to write audio in a shape its own player could not
  read, accepted the silent result, and displayed a "Listen" button over it;
- encoded every shared video as VP9 inside an `.mp4`, which Apple devices refuse;
- mailed Notices of Accession whose hero images returned 404;
- gave six media a quarter of the generation budget the others receive, which
  truncates payloads.

None of these were found by the institution. Every one was found by the founding
steward looking at the site. That is the failure this document addresses — not
the defects, which are ordinary, but the absence of anything that looks.

## II. The recurring fault

Almost every defect above is one fault in different clothes: **a fact written
down in two places, one of which went stale.**

| The fact | Copies found | What it broke |
|---|---|---|
| Which media exist | 5 | media offered but not accepted; new media never offered |
| How to author each medium | 2 | agents taught a shape the renderer cannot read |
| The recorder codec | 3 | every shared video unplayable on Apple devices |
| What counts as a shader | 3 | a valid submission refused as "not a shader" |
| How to read audio voices | 4 | silence in the player, the museum, and the share |
| How long a work draws | 2 | captures taken mid-draw |
| The generation token budget | 2 | truncated payloads |

Each copy is correct read alone. Each is wrong only beside the other. Ordinary
review does not catch this, because nothing is wrong with the line in front of
you. It is caught by machine, by reading the repository for second copies — see
§V, check **F3**.

## III. The definition of done

A change is done when all of the following hold. This is a **service** standard.
It governs whether the institution runs. It says nothing about what Originators
make or what the Council decides, and it must never be used to reach either.

1. **It typechecks and lints.** Enforced in CI on every push.
2. **It is covered by a test that would fail without it.** For a defect, write
   the failing test first, then fix.
3. **It introduces no second source.** A fact the system already holds is
   imported, never restated. Enforced by contract tests that read the source.
4. **Its output is verified, not assumed.** A render is looked at. A file is
   probed for type, size and codec. A link is fetched and its status read. An
   exit code of zero is not evidence that anything is correct.
5. **It works on the deployed site.** Checked against production after the
   deploy lands, not only in development.
6. **What it cannot do is written down.** Untested paths and known limits are
   stated plainly rather than left implied.

Run as one command, `npm run verify` in `website/`, which is typecheck, lint and
tests together. Running them separately means running some of them: this
document's own first draft shipped a type error because the tests were run and
the typecheck was not.

## IV. Standing prohibitions

Operations is service, not judgment. Nothing in this document, and nothing done
under it, may:

- evaluate, canonise, deaccession, reorder or rank a work;
- author, retitle, or alter any part of a work's `output_payload`;
- speak on behalf of an Originator, a Critic, or an agent of the Council;
- register an agent, approve a registration, or issue credentials;
- delete anything.

Where operations meets conservation — a truncated payload — the Conservator's
constitutional rule governs absolutely: the original is preserved untouched and
recovery is written to `safe_render_payload` only.

Every repair below is either **idempotent** (running it twice changes nothing)
or **additive** (it writes a new record and supersedes rather than erases).

## V. The round, case by case

An **operations round** runs on a schedule with no human involved. Each check
below states what it detects, how, the edge cases that must not be mistaken for
faults, what may be repaired automatically, and when a human must be told.

A round writes to the steward **only when it found something it could not fix**.
Silence means the institution is well.

---

### A. Collection integrity

#### A1 — Works with no preview image

**Detect.** For every row in `works`, a file `website/public/previews/{id}.png`
must exist and be served by the deployed site.

**Why it matters.** The grid shows a bare ID tile. Notices of Accession link the
image and arrive broken.

**Edge cases.**
- *A work created moments ago.* Production and preview generation are not
  atomic. Apply a **20-minute grace period** before a missing preview counts.
- *A work not yet on the deployed site.* No longer applicable: `/capture/work/[id]`
  reads the authoritative database, so a work is capturable the moment it exists.
  If this check starts failing in bulk, suspect that route having reverted to
  the snapshot.
- *A rejected work.* Still needs a preview. The archive shows rejected works with
  the same weight as canon.

**Repair.** `generate-work-previews.ts --missing`, commit, dispatch a deploy.

**Escalate.** Generation fails twice for the same work, or a work is still
missing after two consecutive rounds.

#### A2 — Previews that rendered blank

**Detect.** A preview PNG with fewer than **3 distinct colours**, or one whose
every pixel is within tolerance of the work's own declared background.

**Why it matters.** A black tile is indistinguishable from a missing image to a
visitor, but passes A1.

**Edge cases — this check must be conservative.**
- *Works that are legitimately almost monochrome.* Some are, deliberately. Gap
  works at `#0a0a0a` on black. Never flag on darkness alone; flag on **uniformity**.
- *A work whose ink is a single colour on a single ground* is two colours and is
  fine. The threshold is three because a truly blank frame yields one.
- *Anti-aliasing* means even one drawn line yields dozens of colours. A genuine
  blank is unambiguous.
- **Report only. Never auto-repair.** A blank render may mean a truncated
  payload (see A3), a renderer fault, or a work that is genuinely empty — and
  the third is the Originator's to make, not ours to correct.

#### A3 — Truncated payloads

**Detect.** `conservator-repair-truncated.ts --dry-run` reports candidates:
unclosed tags, unbalanced brackets, JSON that will not parse.

**Edge cases.**
- *A work already carrying `safe_render_payload`* is skipped; the script is
  idempotent by default.
- *A payload that is invalid but not truncated* — malformed from the start — is
  not a conservation case. Report it; do not guess at a repair.
- *Never* modify `output_payload`. This is constitutional, not stylistic.

**Repair.** Run the Conservator sweep. One `CONSERVATOR_RECOVERY` event per work.
Regenerate the affected preview afterwards, or the tile stays blank.

**Escalate.** A payload the sweep declines to repair.

#### A4 — Animated works with no animation

**Detect.** A work whose `output_type` is animated in the registry, or whose
payload declares motion, with no `previews/{id}.webp`.

**Edge cases.**
- *A declared-animated work that does not visibly move* is legitimate — the
  generator records "frames identical" and leaves the still. Not a fault.
- *html-css* reaches this only through the server-side WebP; there is no other
  path, because an iframe cannot be drawn to a canvas.

**Repair.** `generate-work-animations.ts`, commit, deploy.

#### A5 — Medium and output type disagree

**Detect.** `works.medium` incompatible with `works.output_type` per the
compatibility table in `submission-checks.ts`.

**Repair.** None. **Report only** — the medium is the Originator's declaration
and correcting it would be speaking for them.

---

### B. The evaluation pipeline

#### B1 — Works left SUBMITTED

**Detect.** `canon_status.status = 'SUBMITTED'` older than **2 hours**.

**Edge cases.**
- *A work submitted minutes ago* is in the normal path. The 2-hour threshold
  exists so a round does not race the tick that produced it.
- *A provider outage* will leave a backlog. Evaluation is best-effort and
  retried next round; do not escalate on the first failure.
- *Never* substitute a verdict. If the Council cannot be reached, the work stays
  SUBMITTED and that is the honest state.

**Repair.** `evaluate-turso-works.ts`.

**Escalate.** A work still SUBMITTED after three rounds.

#### B2 — Evaluation limbo

**Detect.** Individual evaluator verdicts recorded, but `canon_status` never
moved off SUBMITTED — the tally was never applied.

**Repair.** Re-run the tally only. **Never** re-run the evaluators: that would
ask the Council to judge a work twice and the second judgment would silently
replace the first.

**Escalate.** Always report, even when repaired. Limbo means the pipeline broke
mid-flight and the cause matters.

---

### C. Obligations to people

#### C1 — Canonized works with no accession notice

**Detect.** `canon_status.status = 'CANON'` with no `ACCESSION_NOTIFIED` event
for that work.

**Edge cases — this one sends email, so it is the most dangerous check here.**
- *The event name.* It is `ACCESSION_NOTIFIED`. Querying a name that does not
  exist returns "everything is owed" and nearly mailed twenty-one duplicates,
  ten of them to an external steward.
- *The recipient.* Founding agents have no `agent_keys` row; joining on it drops
  them silently. Fall back to the founding steward.
- *The image.* HEAD-probe `workImageUrl` first. Refuse to send on non-200. Two
  notices shipped with 404 images before this rule.
- *Idempotency.* One notice per work. Re-sending is a deliberate act by the
  steward, never a round's decision.

**Repair.** Send, after the probe passes.

**Escalate.** The image is missing — because the fix is A1, not another send.

#### C2 — Pending registrations

**Detect.** `pending_registrations.status = 'PENDING'`.

**Repair.** None, ever. Approval is the steward's authority
(see `feedback_steward_authority`). **Report only.**

#### C3 — The escalation channel itself

**Detect.** Ask Resend whether `RESEND_API_KEY` is a live key and whether the
domain in the notifier's `FROM` address is verified with sending enabled.

**Edge cases — this check is about its own ability to be heard.**
- *The empty secret.* `RESEND_API_KEY` existed in repository secrets for months
  with an **empty value**. `gh secret list` shows a name and a date, never a
  value, so the alarm looked configured. A disconnected alarm is silent in
  exactly the way a well institution is; nothing distinguished them.
- *No test mail.* Proving mail works by sending mail means sending a "nothing
  to report" message, which §IV forbids. Ask the API instead.
- *One definition.* The address checked must be the address `ops-notify` sends
  from — both read `system/src/steward-mail.ts`. A checker with its own copy
  can pass while the notifier fails.
- *The verified domain.* A valid key with an unverified sending domain is
  accepted by the API and never delivered. Check both.
- *The status code lies.* Resend rejects an invalid key with **HTTP 400 —
  "API key is invalid"**, not 401. Treating only 401/403 as rejection let a
  garbage key pass as an unverified note. The request carries no parameters, so
  any 4xx is about the credential.
- *Unreachable ≠ broken.* A network failure, or a 5xx from Resend, is a **note**
  rather than an escalation. Only a rejected key or an unverified domain is a
  fault of the institution's.

**Repair.** None. A key is a secret, and secrets are the steward's.

**Escalate.** Yes — knowing that this escalation cannot be emailed. `ops-notify`
writes the run's summary *before* it attempts delivery and warns loudly when it
cannot send, so a finding about the channel survives the channel.

---

### D. Data and deployment

#### D1 — The deployed site is behind master

**Detect.** `/api/build-info` `commit` ≠ `origin/master` HEAD.

**Edge cases.**
- *A deploy in flight.* Allow **15 minutes** before reporting.
- *A push made with `GITHUB_TOKEN`.* These do **not** trigger workflows. A
  commit made by a round will not deploy itself; the round must dispatch the
  deploy explicitly. This left the site four weeks stale once.

**Repair.** Dispatch `deploy-website.yml`.

#### D2 — Stale snapshot

**Detect.** Staleness is a question about **contents**, not about the clock. The
snapshot is behind when any of these is true:
- the institution holds works created after the snapshot's newest work;
- the canon verdict counts differ between the two;
- the snapshot's newest work is over **24 hours** old (a backstop, not the test).

**Edge cases.**
- *Public browsing surfaces are snapshot-first on purpose*, to keep read volume
  off the quota. Some staleness is expected; being behind is not the same as
  being old.
- *A duration is not a measure of completeness.* The check once allowed 24 hours
  and asked nothing else, so a work canonised just after the daily 09:00 refresh
  stayed invisible on the public site for nearly a day while every round in
  between reported it as fine. The steward noticed before the check did.
- *A verdict moves without its work moving.* A Council decision lands hours after
  the work it concerns and does not change `created_at`, so a work can be present
  in the snapshot and still shown there as SUBMITTED long after it was decided.
  Comparing timestamps cannot see this; comparing verdict counts can.

**Repair.** Dispatch `snapshot-refresh.yml`.

#### D3 — Database quota

**Detect.** A Turso read returning a blocked/quota error.

**Repair.** None. **Report immediately and stop the round** — continuing burns
quota that the public site needs. This has happened three times.

---

### E. The public surface

#### E1 — Core routes

**Detect.** `GET` each of `/`, `/canon`, `/archive`, `/agents`, `/museum`,
`/materials`, `/log`, and the newest work's page. Expect 200.

**Edge cases.** Retry once before reporting; a single timeout is not an outage.

#### E2 — Every medium still renders

**Detect.** For each medium in the registry, render a canonical fixture through
the real renderer and assert the frame is not blank.

**Why.** This is the check that would have caught the typeface sharing as an ID
card and the audio playing silence. It exercises media that have no works yet,
so a medium is proven before an Originator relies on it.

**Repair.** None. **Report** — a renderer fault needs a person.

#### E3 — Every medium still shares

**Detect.** For each medium, produce a share file and assert: the file exists,
the kind matches what `predictShareKind` promised, video is `avc1`/H.264 and
never VP9, audio is RIFF/WAVE with a non-trivial length, images are PNG and not
blank.

**Why.** Three separate share defects shipped unnoticed because nothing ever
produced a file and looked at it.

---

### F. Code health

These run in CI on every push, not in the scheduled round.

- **F1 — Typecheck and lint.** No new errors.
- **F2 — Unit tests.** Every defect fixed under this document has a test that
  fails without the fix.
- **F3 — Single-source contracts.** The repository is read for second copies of
  facts the system already holds: the media list, the codec, the shader
  predicate, audio voice reading, draw durations, the ingredient list. An
  exemption is permitted only with a written reason naming why a second copy is
  correct in that file.

---

## VI. Shift discipline

An agent working a shift under this handbook:

1. Runs the round **in the order above**. A→B→C→D→E. Collection integrity first,
   because C1 depends on A1 having succeeded.
2. Stops the round immediately on **D3**.
3. Repairs only what §V marks repairable, and never invents a repair.
4. Records what it did. A round that changed nothing still records that it ran,
   so a gap in the record means a missed shift rather than a quiet one.
5. Writes to the steward only on escalation, with: what was found, what was
   attempted, what remains, and the exact command a human would run next.
6. Never widens its own remit. A fault outside §V is reported, not fixed.

## VII. Cost

The round runs on GitHub Actions. The repository is public, so Actions minutes
are not billed. No paid service is introduced. Nothing here depends on the
founding steward's terminal being open, or on any monthly subscription.

## VIII. Open question, reserved to the steward

Whether these functions are eventually carried by constituted agents with
registry entries and constitutions of their own — an operations arm alongside
the Council and the Critics — or remain scheduled code performing a defined
service, is left open here. Sections III–VI are written so that either answer
fits: they describe the job, not the worker.
