# Package 2E — OMR Benchmark Contract and Evidence Boundary

Status: **Completed by the Package 2E closure package once merged to protected `main` and exact-main CI passes**

## Prerequisite

Package 2D is completed by `docs/package-2d-closure.md`. Package 2E code stages 2E-A through 2E-E are merged. Package 3A or any later package remains prohibited until `docs/package-2e-closure.md` is present on protected `main` and the exact resulting main SHA passes required `test-and-build` CI.

## Objective

Package 2E provides a deterministic, fail-closed framework for measuring how isolated PDF/image preprocessing variants affect OMR output. It is experimental and does not change the production OMR path.

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

2E-A established fixture/provenance inventory, deterministic benchmark vocabulary/schema, explicit `NOT_MEASURED` behavior without golden comparison, immutable isolated variant records, deterministic reviewed-output diagnostics, fail-closed tests and production-path isolation.

It does not preprocess, invoke production Audiveris, rewrite MusicXML, merge notes across outputs, invent an accuracy percentage, or deploy anything.

## Package 2E-B — read-only golden MusicXML comparator

Merged through PR #46.

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

- raw generated MusicXML is not retained in the result;
- SHA-256 and byte-length artifact metadata are retained;
- quality findings remain source-unverified unless separately verified;
- golden comparison is measured only against inventoried teacher-verified truth;
- no golden means recognition comparison stays `NOT_MEASURED`;
- malformed evidence fails closed as `UNKNOWN`/`REVIEW_REQUIRED`.

## Package 2E-D — isolated comparative runner

Merged through PR #48. Post-merge protected main became `3162b2e9a355be6bb8530bc952dec9aa4bb4e618`; exact-main CI run #106 passed with 827/827 tests, 229 suites, audit 0 vulnerabilities, and production build PASS.

2E-D establishes:

- exactly all eight approved variant kinds per complete experiment;
- a dedicated temporary workspace for every variant;
- workspace-local prepared artifacts only;
- original source SHA-256 and byte-length checks across adapter boundaries;
- guaranteed `finally` cleanup on success and failure;
- dependency-injected experimental preprocessing/OMR adapters only;
- unavailable capability recorded as `NOT_MEASURED`;
- no golden reference means recognition comparison remains `NOT_MEASURED`;
- deterministic result ordering;
- no temporary path or raw MusicXML exposure in the final runner result.

2E-D does not import or modify the production Audiveris provider, OMR worker/provider, gateway, production MusicXML path, or E2E workflow.

## Package 2E-E — evidence-only recommendation

Merged through PR #49.

- Exact accepted head: `be16e72480aa38fc146d93be72dd4e8f58af8058`
- Exact-head CI: run `33090178321` / run #108 — success
- Merge commit / technical closure baseline: `23f758b6231c282b0d10832820e18007dbaea65f`
- Exact post-merge `main` CI: run `33090396467` / run #109 — success
- Full regression: 839/839 tests, 229 suites, 0 failed/skipped/cancelled
- Dependency audit: 120 packages audited, 0 vulnerabilities
- Production build: PASS

2E-E may recommend one variant only when:

1. the complete eight-variant set is present;
2. a teacher-verified golden reference identity is attached;
3. every variant execution is measured;
4. missing notes, extra notes, pitch errors, duration errors, voice errors, and fully-correct-measure rate are all safely measured;
5. exactly one variant is no worse on every approved metric and strictly better on at least one metric than every other variant.

This is strict Pareto dominance. There is no weighted/composite score.

If evidence is incomplete, malformed, tied, or contains metric trade-offs, the result is `REVIEW_REQUIRED` with no winner. `accuracyPercentage` remains null because fully-correct-measure rate is benchmark evidence, not a general OMR accuracy percentage. A recommendation never promotes production source verification or merges notes from different outputs.

## Full Package 2E acceptance boundary

The closure package records the following as satisfied by code/test evidence:

- variant isolation;
- original-file preservation;
- operation without golden MusicXML;
- no production-pipeline mutation;
- safe temporary-file cleanup;
- deterministic output;
- measured comparison against valid teacher-verified golden evidence where metrics are claimed;
- evidence-only recommendation with fail-closed tie/trade-off handling;
- no cross-output note merging;
- no unsupported accuracy percentage;
- full regression suite PASS;
- dependency audit PASS;
- production build PASS;
- exact PR-head required CI PASS;
- exact post-merge main required CI PASS.

The remaining administrative closure gate is this documentation/status reconciliation PR itself: exact PR-head CI, protected merge, and exact post-merge main CI.

## Protected production boundary

The following remained regression-shield-only during Package 2E:

- Audiveris provider/runtime/preflight
- OMR worker
- OMR provider selection
- gateway
- production MusicXML OMR path
- existing E2E workflow

Packages 2E-A through 2E-E introduce no intentional production behavior change or deployment.

## Explicit limitations

Package 2E completion closes the benchmark/evidence framework. It does not establish that every real score has been benchmarked, that preprocessing should be wired into production, that Audiveris is error-free, that one variant is universally best, or that a general OMR accuracy percentage exists.

Empirical results must remain tied to explicit teacher-verified golden evidence, and teacher review remains part of the product safety model.

## Closure sequence

This closure/status reconciliation branch must pass exact-head required CI and merge through the protected PR path. The exact resulting protected `main` SHA must then pass required `test-and-build` CI. Only after that final check is Package 2E unconditionally closed and Package 3A eligible to begin.
