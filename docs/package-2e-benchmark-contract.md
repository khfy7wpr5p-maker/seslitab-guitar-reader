# Package 2E — OMR Benchmark Contract and Evidence Boundary

Status: **In progress — 2E-A merged; 2E-B golden comparator under verification**

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

A measured variant record must preserve:

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

## Package 2E-A — merged safe slice

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

2E-A merged through PR #45. Exact post-merge main verification is recorded by GitHub CI; Package 2E remains incomplete.

## Package 2E-B — read-only golden MusicXML comparator

2E-B adds a deterministic comparator for generated MusicXML against one of the two repository-owned teacher-verified expected MusicXML files.

Alignment policy:

1. Physical measures align by `partIndex + measureIndex`, never by visible measure number.
2. Exact musical-event matches are removed first.
3. A remaining event pair is classified as a pitch, duration, or voice error only when exactly one golden event and one generated event occupy the same strict location.
4. A strict location uses canonical `startBeat`, staff, rest/grace state, and chord-continuation state; it does not use pitch, duration, or voice, so those fields can be measured when pairing is unambiguous.
5. If multiple unmatched events remain at the same location, detailed error metrics become `REVIEW_REQUIRED` with no definitive numeric value. The comparator does not guess correspondences.
6. Fully-correct-measure rate is based on exact normalized event equality and remains measurable even when a detailed event correspondence is ambiguous.
7. The comparator reads the approved golden file from the fixed repository inventory. A caller cannot supply arbitrary MusicXML and label it as ground truth.

Important parser boundary discovered during 2E-B audit:

- `parseMusicXml()` is used for ordered canonical note onsets because it calculates `startBeat` through note/backup/forward processing.
- `parseMusicXmlWithStructure()` is used only for physical measure metadata in this comparator.
- Package 2E-B does not change either production parser.

2E-B remains measurement infrastructure only. Comparing a golden file to itself proves comparator behavior; it is **not** evidence of Audiveris recognition accuracy.

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

2E-A and 2E-B introduce no dependency and no production behavior change.

## Next safe 2E slice after 2E-B

After 2E-B is merged and verified, the next Package 2E slice should connect the immutable variant record to the comparator result without executing preprocessing or Audiveris yet. Only after that contract is stable should an isolated experimental runner be considered. Any runner must keep temporary variants separate, preserve the original input, clean temporary artifacts safely, and remain completely outside the production OMR pipeline.
