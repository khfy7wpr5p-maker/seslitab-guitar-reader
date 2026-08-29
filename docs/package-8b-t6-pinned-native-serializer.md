# Package 8B-T6 — Pinned Audiveris Native Serializer + Acceptance Gate

Status: **Completed**

## Purpose

Package 8B-T6 implements the isolated research serializer immediately after T5. It can turn an exact T5 `ready_for_audiveris_native_serializer` report into deterministic `samples.zip` bytes and binds any later acceptance claim to both the exact archive SHA-256 and the exact pinned Audiveris revision.

This package does **not** execute classifier training, evaluate a trained model, replace a production model, or modify SesliTab production OMR/deployment wiring.

## Pinned upstream contract

The serializer is pinned to Audiveris revision:

`7a36078e7ba0c006052c1f661b949cf9b729f505`

Fresh upstream source verification established:

- `SampleRepository.SAMPLES_FILE_NAME = "samples.zip"`;
- `SheetContainer.CONTAINER_ENTRY_NAME = "META-INF/container.xml"`;
- each `SampleSheet` persists `<sheet-name>/samples.xml`;
- `SampleSheet.SampleList` is JAXB root `<samples sheet-name="...">` with repeated `<sample>` elements;
- `Sample` persists `id`, `shape`, `interline`, `left`, `top` and a child `run-table`;
- `RunTable` persists `orientation`, `width`, `height` and ordered `<runs>` sequences;
- Audiveris explicitly accepts an empty run sequence as `[]`, so T6 emits `<runs/>` for an all-background row rather than dropping the row index;
- actual repository acceptance is performed by `SampleRepository.getInstance(Path,true)`, followed by a loaded-sample-count check via `getAllSamples()`.

## Serializer rules

T6 accepts only an immutable T5 report that validates and is in `ready_for_audiveris_native_serializer`. Anything earlier fails closed and produces no archive bytes.

For accepted T5 input it:

1. re-decodes every exact T5 mask and rechecks its SHA-256;
2. supports only the bounded T3 accidental shapes (`SHARP`, `FLAT`, `NATURAL`, `DOUBLE_SHARP`, `DOUBLE_FLAT`);
3. maps each source page to a deterministic, path-safe Audiveris sample-sheet name derived from SHA-256(pageId);
4. assigns deterministic positive integer sample IDs within each generated sheet while preserving source identity through the bound T5 manifest fingerprint;
5. emits horizontal Audiveris `RunTable` RLE with one explicit sequence per bbox row;
6. writes `META-INF/container.xml` and `<sheet>/samples.xml` only;
7. uses fixed ZIP metadata, stable path ordering and STORE compression to make identical input produce identical archive bytes;
8. records archive byte length and SHA-256.

A successful serialization state is only:

`archive_built_pending_pinned_acceptance`

It is **not** Audiveris acceptance, training readiness, production authorization or model-replacement authorization.

## Real pinned-Audiveris acceptance probe

`scripts/runPinnedAudiverisSampleRepositoryAcceptance.js` requires a separate checkout whose `git rev-parse HEAD` exactly equals the pinned revision and whose worktree is clean. In that isolated checkout it temporarily installs one bounded JUnit probe, invokes the real:

`SampleRepository.getInstance(archive, true)`

and requires:

- non-null repository;
- `repo.isLoaded() == true`;
- `repo.getAllSamples().size()` exactly equals the serialized sample count;
- independently computed archive SHA-256.

The temporary probe source and receipt file are removed after the run. No training method is invoked.

The external probe receipt contains only the probe/API identity, pinned revision, archive SHA-256, repository-loaded state and loaded sample count. `bindPinnedAudiverisAcceptance` separately re-validates the serializer build, including its already-bound T5 staging-manifest fingerprint, and copies that fingerprint into the final `accepted_by_pinned_audiveris` report only when the receipt fields exactly match the build.

## Current real-data state

T6 does not fabricate missing upstream evidence. The current real Package 8B population still has:

```text
mapped experimental samples:             2,714
T4 exact approvals:                          0
T4 admitted samples:                         0
T1/T2 trainable samples:                     0
T5 serializer-ready real samples:            0
real samples.zip built:                      NO
real pinned-Audiveris acceptance:            NO
Audiveris training executed:                 NO
production model changed:                    NO
```

Therefore the executable serializer/acceptance gate is verified with bounded fixtures, but no real MUSCIMA training archive or real-data acceptance claim exists until the earlier exact evidence gates are satisfied.

## Hard safety invariants

T6 always keeps these separate:

- archive serialization;
- pinned Audiveris repository acceptance;
- training execution;
- evaluation;
- production-model adoption.

An accepted archive still reports:

- `trainingExecuted = false`;
- `productionAuthorized = false`;
- `modelReplacementAuthorized = false`.

T6 fails closed on invalid/accessor-bearing T5 input, stale or malformed pinned revisions, dirty pinned checkouts, archive mutation, failed repository load, wrong probe API identity, sample-count mismatch, malformed receipt binding and attempted authorization escalation.

No T6 code changes the production Audiveris provider/runtime/worker, Cloud OMR Gateway/backend path, `Dockerfile`, `render.yaml`, Render deployment wiring, production classifier/model bytes, CI workflow or dependencies.

## Verification evidence

- stage-start protected main: `a771c27d9359c2fbcd4b126272287cf0ca82d875`;
- implementation branch: `feature/package-8b-t6-pinned-native-serializer`;
- implementation PR: #120;
- final implementation head: `9f7806c6eb6079dfc5ee929d270dfb39b063e8a4`;
- exact-head CI #307 / run `33251176354`, job `99096993296`: **SUCCESS**;
- final merge gate: **0 behind**, mergeable, **0 unresolved review threads**;
- expected-head-locked squash merge: `eb711fa0483b87d841b4381e242b4d19ae95d189`;
- exact-main CI #308 / run `33251255425`, job `99097200088`: **SUCCESS**;
- exact-main verification: **1315/1315 tests**, 232 suites, 0 failed/skipped/cancelled, 0 vulnerabilities, production build PASS, real-browser score render + cursor proof PASS using Google Chrome.

## Result

**Package 8B-T6 is Completed.**

**Package 8B remains Partially implemented.** T6 closes the serializer/acceptance engineering boundary only; it does not make the current mapped evidence trainable.

## Next gate

No classifier training may begin merely because T6 code exists. The next evidence-supported step is genuine T4/T5 real-sample evidence and approval acquisition. Only real samples that pass those gates may be serialized and tested against pinned Audiveris.

Training/evaluation and any production adoption remain separately reviewed gates. Do not invent a new Package 8B substage to bypass absent evidence.
