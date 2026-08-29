# Package 8B-T6 — Pinned Audiveris Native Serializer + Acceptance Gate

Status: **Implementation candidate**

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

`scripts/runPinnedAudiverisSampleRepositoryAcceptance.js` requires a separate checkout whose `git rev-parse HEAD` exactly equals the pinned revision. In that isolated checkout it temporarily installs one bounded JUnit probe, invokes the real:

`SampleRepository.getInstance(archive, true)`

and requires:

- non-null repository;
- `repo.isLoaded() == true`;
- `repo.getAllSamples().size()` exactly equals the serialized sample count;
- independently computed archive SHA-256.

The temporary probe source and receipt file are removed after the run. No training method is invoked.

Only a probe receipt whose API identity, pinned revision, archive SHA-256 and sample count exactly match the serializer build may be bound into an `accepted_by_pinned_audiveris` report.

## Current real-data state

T6 does not fabricate missing upstream evidence. The current real Package 8B population still has:

```text
mapped experimental samples:       2,714
T4 exact approvals:                    0
T4 admitted samples:                   0
T1/T2 trainable samples:               0
T5 serializer-ready real samples:      0
real samples.zip built:                 NO
real pinned-Audiveris acceptance:       NO
Audiveris training executed:            NO
production model changed:               NO
```

Therefore the executable serializer/acceptance gate can be tested with bounded fixtures, but no real MUSCIMA training archive or real-data acceptance claim exists until the earlier exact evidence gates are satisfied.

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

No T6 code changes the production Audiveris provider/runtime/worker, Cloud OMR Gateway/backend path, `Dockerfile`, `render.yaml`, Render deployment wiring, production classifier/model bytes, CI workflow or dependencies.

## Next gate

No classifier training may begin merely because T6 code exists. A future training package requires actual approved T4/T5 evidence, a real archive built from that evidence, and an acceptance receipt produced by the exact pinned Audiveris repository probe. Training/evaluation and any production adoption remain separately reviewed gates.
