# Package 8B-T5 — Isolated Audiveris Native Sample Staging Harness

Status: Implementation candidate

## Purpose

Package 8B-T5 is the next fail-closed research boundary after T4. It prepares exact evidence for an isolated Audiveris native sample serializer without writing `samples.zip`, executing Audiveris training, replacing a classifier, or touching production OMR/deployment wiring.

## Fresh upstream verification

Audiveris `master` was verified at revision `7a36078e7ba0c006052c1f661b949cf9b729f505`.

Relevant upstream contracts:

- `SampleRepository.SAMPLES_FILE_NAME = "samples.zip"`.
- `SampleRepository.storeRepository()` persists through `SheetContainer` and `SampleSheet`.
- each `SampleSheet` writes `<sheet-name>/samples.xml` through JAXB.
- `Sample` extends `Glyph` and requires shape, interline, glyph location and a `RunTable` pixel representation.

Therefore a valid native classifier sample cannot be reconstructed from only a label and a mask hash.

## Current T3/T4 evidence gap

T3 intentionally preserves mapped accidental identity, shape, bounding box and decoded-mask SHA-256, but not the raw mask/RLE payload or Audiveris interline value.

T4 currently has zero exact per-sample research approvals for the real 2,714 mapped samples.

T5 must not invent either missing raw glyph evidence or interline metadata. The current real population therefore remains blocked and no `samples.zip` is built.

## States

- `blocked_research_admission`: T4 is not `ready_for_isolated_samples_zip_build`.
- `blocked_native_evidence`: T4 approval is complete but exact native glyph/interline evidence is incomplete.
- `ready_for_audiveris_native_serializer`: every mapped sample has exact T4 approval plus native evidence whose decoded mask matches the T3 fingerprint and whose interline is explicit.

The final state is **serializer-ready staging only**. It is not training-ready, production-authorized, model-replacement-authorized, or T1-trainable.

## Native evidence contract

For every exact mapped sample T5 requires:

- exact `sampleId`;
- exact Audiveris accidental shape;
- raw bounded `maskRle` whose decoded pixels hash to the existing T3 `maskSha256`;
- explicit positive integer `interline`.

T5 derives glyph location and dimensions only from the exact immutable T3 bounding box. It preserves the T3 page-disjoint split and never claims writer-independent evaluation.

## Determinism and fail-closed behavior

When all evidence is present, T5 emits an immutable, sample-ID-sorted staging manifest and a deterministic SHA-256 manifest fingerprint. It rejects duplicate, unknown, sparse, accessor-injected, malformed, shape-mismatched or mask-mismatched evidence.

No partial manifest is emitted when evidence is incomplete.

## Hard safety invariants

T5 always reports:

- `samplesZipBuilt = false`;
- `trainingExecuted = false`;
- `t1TrainableSampleCount = 0`;
- `t1OmrEvidenceSatisfied = false`;
- `productionAuthorized = false`;
- `modelReplacementAuthorized = false`;
- `writerIndependentEvaluation = false`.

The stricter Package 8B-T1 `.omr` requirement remains unchanged.

## Non-impact

No changes are permitted in this package to:

- Audiveris production provider/runtime/worker;
- Cloud OMR Gateway or backend;
- `Dockerfile` or `render.yaml`;
- Render service/deployment wiring;
- production classifier/model bytes;
- CI workflow or dependencies.

## Next gate after T5

A future separately approved package may implement or invoke a pinned Audiveris-native serializer in an isolated research environment. It must prove that the produced archive is accepted by the pinned Audiveris sample repository before any training execution is considered.
