# Package 2E — OMR Benchmark Contract and Evidence Boundary

Status: **In progress — 2E-A through 2E-D merged; 2E-E evidence recommendation under verification**

## Prerequisite

Package 2D is completed by `docs/package-2d-closure.md`. Package 2E is the current package. This document does not authorize Package 3A or any later package until Package 2E closure is merged and exact-main CI is verified.

## Objective

Package 2E measures how isolated PDF/image preprocessing variants affect OMR output. It is experimental and must not change the production OMR path.

The approved comparative input families are:

- original PDF
- original page image
- PNG
- high-quality JPG
- deskewed image
- cropped image
- adaptive binarization
- careful upscale and denoise

A measured variant record preserves:

- input metadata
- preprocessing settings
- Audiveris settings
- generated MusicXML artifact metadata
- validator findings
- golden MusicXML comparison evidence when available
- missing-note result
- extra-note result
- pitch-error result
- duration-error result
- voice-error result
- fully-correct-measure result/rate

If a field has not actually been measured, the result must say `NOT_MEASURED`, `UNKNOWN`, or `REVIEW_REQUIRED` as appropriate. A missing ground truth must never become a numeric accuracy claim.

## Repository evidence inventory

### Teacher-verified comparison references

1. `tests/fixtures/golden-reference/plan0-cc0-4measure/`
   - source PDF
   - approved expected MusicXML
   - integrity manifest
   - the historical Audiveris attempt is not classified as a successful reproduction

2. `tests/fixtures/golden-reference/plan0-owner-approved-3-8/`
   - source PDF
   - preserved Audiveris `.omr`
   - approved expected MusicXML
   - `APPROVAL.md`
   - integrity manifest

### Regression-output diagnostics only

The following files are deterministic real-OMR regression outputs but are not complete teacher-approved musical ground truth:

- `django-clean.xml`
- `fikriminincegulu-clean.xml`
- `fug1001-clean.xml`
- `gesi-clean.xml`
- `karayip-korsanlari-clean.xml`
- `samanyolu-clean.xml`
- `shostywaltz-clean.xml`

They may detect parser/validator/regression drift. Recognition accuracy must not be inferred from them.

## Package 2E-A — benchmark contract and fixture inventory

Merged through PR #45.

2E-A established:

- fixture/provenance inventory
- deterministic benchmark vocabulary and schema
- explicit `NOT_MEASURED` behavior without golden comparison
- immutable, isolated variant records
- deterministic reviewed-output diagnostic reporter
- fail-closed tests and production-path isolation

It does not preprocess, invoke production Audiveris, rewrite MusicXML, merge notes across outputs, invent an accuracy percentage, or deploy anything.

## Package 2E-B — read-only golden MusicXML comparator

Merged through PR #46.

2E-B adds a deterministic comparator for generated MusicXML against repository-owned teacher-verified expected MusicXML.

Alignment policy:

1. Physical measures align by `partIndex + measureIndex`, never by visible measure number.
2. Exact musical-event matches are removed first.
3. A remaining event pair is classified as a pitch, duration, or voice error only when exactly one golden event and one generated event occupy the same strict location.
4. A strict location uses canonical `startBeat`, staff, rest/grace state, and chord-continuation state; it excludes pitch, duration, and voice so those fields can be measured when pairing is unambiguous.
5. Multiple unmatched events at the same location make detailed metrics `REVIEW_REQUIRED`; correspondence is never guessed.
6. Fully-correct-measure rate uses exact normalized event equality and remains measurable even when detailed event correspondence is ambiguous.
7. The comparator reads approved golden files from the fixed repository inventory; callers cannot supply arbitrary truth.

Parser boundary discovered during audit:

- `parseMusicXml()` supplies ordered canonical note onsets because it calculates `startBeat` through note/backup/forward processing.
- `parseMusicXmlWithStructure()` supplies physical measure metadata only.
- Package 2E does not change either production parser.

Golden self-comparison proves comparator behavior, not Audiveris recognition accuracy.

## Package 2E-C — measured variant evidence

Merged through PR #47.

2E-C connects one generated MusicXML output to immutable benchmark evidence:

- raw generated MusicXML is not retained in the result
- SHA-256 and byte-length artifact metadata are retained
- quality findings remain source-unverified unless separately verified
- golden comparison is measured only against inventoried teacher-verified truth
- no golden means recognition comparison stays `NOT_MEASURED`
- malformed evidence fails closed as `UNKNOWN`/`REVIEW_REQUIRED`

## Package 2E-D — isolated comparative runner

Merged through PR #48. Post-merge protected main became `3162b2e9a355be6bb8530bc952dec9aa4bb4e618`; exact-main CI run #106 passed with 827/827 tests, 229 suites, audit 0 vulnerabilities, and production build PASS.

2E-D establishes:

- exactly all eight approved variant kinds per complete experiment
- a dedicated temporary workspace for every variant
- workspace-local prepared artifacts only
- original source SHA-256 and byte-length checks across adapter boundaries
- guaranteed `finally` cleanup on success and failure
- dependency-injected experimental preprocessing/OMR adapters only
- unavailable capability recorded as `NOT_MEASURED`
- no golden reference means recognition comparison remains `NOT_MEASURED`
- deterministic result ordering
- no temporary path or raw MusicXML exposure in the final runner result

2E-D does not import or modify the production Audiveris provider, OMR worker/provider, gateway, production MusicXML path, or E2E workflow.

## Package 2E-E — evidence-only recommendation

2E-E may recommend one variant only when:

1. the complete eight-variant set is present;
2. a teacher-verified golden reference identity is attached;
3. every variant execution is measured;
4. missing notes, extra notes, pitch errors, duration errors, voice errors, and fully-correct-measure rate are all safely measured;
5. exactly one variant is no worse on every approved metric and strictly better on at least one metric than every other variant.

This is strict Pareto dominance. There is no weighted/composite score.

If evidence is incomplete, malformed, tied, or contains metric trade-offs, the result is `REVIEW_REQUIRED` with no winner. `accuracyPercentage` remains null because fully-correct-measure rate is benchmark evidence, not a general OMR accuracy percentage. A recommendation never promotes production source verification or merges notes from different outputs.

## Full Package 2E acceptance boundary

Package 2E cannot be marked completed until all applicable mandatory behavior is proven, including:

- variant isolation
- original-file preservation
- operation without golden MusicXML
- no production-pipeline mutation
- safe temporary-file cleanup
- deterministic output
- measured comparison against valid teacher-verified golden evidence where metrics are claimed
- evidence-only recommendation with fail-closed tie/trade-off handling
- no cross-output note merging
- no unsupported accuracy percentage
- full regression suite PASS
- dependency audit PASS
- production build PASS
- exact PR-head required CI PASS
- exact post-merge main required CI PASS
- package status/current status/closure documentation reconciled

## Protected production boundary

The following remain regression-shield-only during Package 2E:

- Audiveris provider/runtime/preflight
- OMR worker
- OMR provider selection
- gateway
- production MusicXML OMR path
- existing E2E workflow

Packages 2E-A through 2E-E introduce no intentional production behavior change or deployment.

## Closure sequence

After 2E-E exact-head CI and post-merge exact-main CI succeed, Package 2E receives a dedicated closure/status reconciliation PR. Only after that closure PR is merged and exact-main CI succeeds may Package 3A begin.
