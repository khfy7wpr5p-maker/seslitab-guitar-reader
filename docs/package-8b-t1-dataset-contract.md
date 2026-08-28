# Package 8B-T1 — Verified Audiveris Dataset Contract

Status: **Implementation candidate. Closure requires protected-main merge plus exact-main CI.**

Baseline at stage start: `32f774fe4a5adfb093ee6103ea39222c4bdb9203`.

## Purpose

Package 8B follows completed Package 8 and remains an isolated experimental data/research stage. T1 establishes the fail-closed data contract that must exist before any real Audiveris training dataset can be assembled.

This stage does **not** train Audiveris, run Audiveris, replace a model, change the OMR provider/runtime, change gateway/worker behavior, or modify Render/Docker deployment wiring.

## Source-defined Package 8B rules represented here

A candidate may preserve:

- source PDF evidence;
- source page image evidence;
- corrected/preserved `.omr` evidence;
- MusicXML provenance evidence;
- glyph image;
- shape label;
- symbol coordinates;
- teacher approval evidence;
- source/version metadata;
- licensing evidence;
- Audiveris version;
- explicit train/evaluation split.

The contract enforces these safety rules:

1. MusicXML alone never becomes a trainable Audiveris sample.
2. A sample without explicit training approval never enters a dataset manifest.
3. Training approval is bound to the exact candidate-evidence SHA-256 fingerprint; changing candidate identity, split, image, `.omr`, MusicXML, glyph, label, coordinates, licence evidence, source approval evidence, or Audiveris version invalidates reuse of the prior approval.
4. Train/evaluation leakage is rejected by provenance identity and by shared source PDF, page image, `.omr`, MusicXML, or glyph SHA-256 evidence.
5. Dataset manifests are deterministic, immutable and versioned by caller-supplied dataset/version identity plus exact sample evidence.
6. The package generates no IDs and no timestamps.
7. Paths are repository-relative, extension constrained and traversal-safe.
8. Candidate, nested artifact, coordinate, approval, sample-array, split-count and manifest structures are strict immutable data records.
9. Unknown/injected/accessor/sparse evidence fails closed.
10. Production Audiveris and deployment wiring remain untouched.

## Exact approval binding

`trainingApproval` is not a generic teacher-review marker. It must use the explicit scope:

`audiveris_training_sample`

The approval records `approvedCandidateFingerprint`, which must equal the deterministic SHA-256 fingerprint of the exact normalized candidate evidence. A training approval copied from another candidate or retained after evidence changes is rejected.

Golden-reference approval is kept separate. A prior approval that authorizes benchmark/golden-reference use is not silently reinterpreted as permission to use the evidence as an Audiveris training sample.

## Existing repository evidence inventory

The repository currently preserves one strong owner/teacher-approved evidence chain:

`tests/fixtures/golden-reference/plan0-owner-approved-3-8/`

It contains:

- `source.pdf`;
- `project.omr`;
- `expected.musicxml`;
- `APPROVAL.md`;
- SHA-256 integrity evidence in `sha256.txt`.

The existing approval records golden-reference use and rights evidence, and records Audiveris 5.11.0. It does **not** explicitly approve Audiveris training use. The repository also does not preserve a separate page image, glyph image, shape label, or symbol coordinates for this evidence chain.

Therefore `scripts/audiverisTrainingDatasetInventory.js` intentionally represents this chain as **INCOMPLETE**, never as trainable data.

No missing glyph, label, coordinate, page image, approval scope, or split is fabricated.

## Files in T1

- `scripts/audiverisTrainingDatasetContract.js`
- `scripts/audiverisTrainingDatasetInventory.js`
- `tests/package8bDatasetContract.test.js`
- `docs/package-8b-t1-dataset-contract.md`

## Required tests covered

- unapproved sample rejected;
- MusicXML-only evidence rejected as a training sample;
- image/glyph/shape-label/coordinate completeness;
- exact SHA-256 and safe repository-path validation;
- exact training-approval fingerprint binding;
- approval replay after evidence change rejected;
- deterministic dataset version fingerprint;
- train/evaluation provenance leakage rejected;
- train/evaluation PDF/page/.omr/MusicXML/glyph leakage rejected;
- mutable/injected evidence rejected;
- real repository evidence hashes checked against preserved files;
- existing golden chain remains incomplete rather than being promoted;
- no production OMR/model/deployment integration imports or write/execute surfaces.

Full regression and production build remain required in protected CI before merge.

## Deferred work

T1 does not claim that a usable training dataset already exists. A later bounded 8B stage may ingest only genuinely teacher-approved labeled image/glyph evidence that satisfies this contract.

Still deferred:

- extracting or curating glyphs from `.omr`;
- generating page images;
- assigning real Audiveris shape labels;
- recording real symbol coordinates;
- obtaining explicit per-sample training approval;
- dataset population at useful scale;
- training experiments;
- model evaluation and comparison;
- any production-model replacement or runtime change.

## Rollback

Before merge, delete the feature branch. After merge, revert the bounded 8B-T1 squash commit. No production OMR/runtime/deployment state is changed by T1.
