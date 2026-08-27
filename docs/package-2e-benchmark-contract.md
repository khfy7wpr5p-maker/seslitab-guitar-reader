# Package 2E — OMR Benchmark Contract and Evidence Boundary

Status: **In progress — 2E-A contract/inventory slice only**

## Prerequisite

Package 2D is completed by `docs/package-2d-closure.md`. Package 2E is the next package. This document does not authorize Package 3A or any later package.

## Objective

Package 2E measures how isolated PDF/image preprocessing variants affect Audiveris output. It is experimental and must not change the production OMR path.

The approved comparative input families are:

- original PDF
- original page image
- PNG
- high-quality JPG
- deskewed image
- cropped image
- adaptive binarization
- careful upscale and denoise

A future measured variant record must preserve:

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

The following files are useful deterministic real-OMR regression outputs but are not complete teacher-approved musical ground truth:

- `django-clean.xml`
- `fikriminincegulu-clean.xml`
- `fug1001-clean.xml`
- `gesi-clean.xml`
- `karayip-korsanlari-clean.xml`
- `samanyolu-clean.xml`
- `shostywaltz-clean.xml`

They may be used to detect parser/validator/regression drift. Recognition accuracy must not be inferred from them.

## Package 2E-A — current safe slice

2E-A is intentionally limited to:

- fixture/provenance inventory
- deterministic benchmark vocabulary and schema
- explicit `NOT_MEASURED` behavior without golden comparison
- immutable, isolated variant records
- deterministic reviewed-output diagnostic reporter
- focused tests proving fail-closed behavior and production-path isolation

2E-A does **not**:

- preprocess an image
- invoke a new Audiveris experiment
- modify Audiveris configuration
- alter the OMR worker/provider/gateway
- alter the E2E workflow
- rewrite MusicXML
- merge notes from different OMR outputs
- calculate an OMR accuracy percentage
- select a best variant without measured comparison evidence
- deploy anything

## Full Package 2E acceptance boundary

Package 2E cannot be marked completed until the isolated comparative runner can prove all applicable mandatory behavior, including:

- variant isolation
- original-file preservation
- operation without golden MusicXML
- no production-pipeline mutation
- safe temporary-file cleanup when temporary files are introduced
- deterministic output
- measured comparison against a valid golden reference where comparison metrics are claimed
- full regression suite PASS
- dependency audit PASS
- production build PASS
- exact PR-head required CI PASS
- exact post-merge main required CI PASS

The final report may recommend the best **complete measured result** only when the evidence supports that recommendation. It must not combine notes from separate OMR outputs.

## Protected production boundary

The following remain regression-shield-only during Package 2E unless a separate architectural decision is explicitly approved:

- Audiveris provider/runtime/preflight
- OMR worker
- OMR provider selection
- gateway
- production MusicXML OMR path
- existing E2E workflow

2E-A introduces no dependency and no production behavior change.

## Next safe 2E slice

After 2E-A is merged and verified, the next Package 2E slice should implement a read-only golden MusicXML comparator with explicit event-alignment rules and tests. It must fail closed where musical alignment is ambiguous rather than inventing note correspondences.
