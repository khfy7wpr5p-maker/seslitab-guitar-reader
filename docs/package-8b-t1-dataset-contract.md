# Package 8B-T1 — Verified Audiveris Dataset Contract

Status: **Completed.**

Stage-start baseline: `32f774fe4a5adfb093ee6103ea39222c4bdb9203`.  
Verified implementation main: `278b69ed1f7f0cede6a3dc00e8265e887811c88b`.  
Exact-main CI: **#266 / run `33196791822`, job `98935863577` — SUCCESS**.

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
- teacher/training approval evidence;
- source/version metadata;
- licensing evidence;
- Audiveris version;
- explicit train/evaluation split.

The contract enforces these safety rules:

1. MusicXML alone never becomes a trainable Audiveris sample.
2. A sample without explicit training approval never enters a dataset manifest.
3. Training approval is bound to the exact candidate-evidence SHA-256 fingerprint; changing candidate identity, split, image, `.omr`, MusicXML, glyph, label, coordinates, licence evidence, source approval evidence, or Audiveris version prevents reuse of the prior approval.
4. Train/evaluation leakage is rejected by provenance identity and by shared source PDF, page image, `.omr`, MusicXML, or glyph SHA-256 evidence.
5. Dataset manifests are deterministic, immutable and versioned by caller-supplied dataset/version identity plus exact sample evidence.
6. The package generates no IDs and no timestamps.
7. Paths are repository-relative, extension constrained and traversal-safe.
8. Candidate, nested artifact, coordinate, approval, sample-array, split-count and manifest structures are strict immutable data records.
9. Unknown/injected/accessor/sparse/mutable evidence fails closed.
10. Production Audiveris and deployment wiring remain untouched.

## Exact training-approval binding

`trainingApproval` is not a generic teacher-review or golden-reference marker. It must use the explicit scope:

`audiveris_training_sample`

The approval records `approvedCandidateFingerprint`, which must equal the deterministic SHA-256 fingerprint of the exact normalized candidate evidence. A training approval copied from another candidate or retained after evidence changes is rejected.

Golden-reference approval remains separate. A prior approval that authorizes benchmark/golden-reference use is not silently reinterpreted as permission to use the evidence as an Audiveris training sample.

## Existing repository evidence inventory

The repository currently preserves one strong owner/teacher-approved evidence chain:

`tests/fixtures/golden-reference/plan0-owner-approved-3-8/`

It contains:

- `source.pdf`;
- `project.omr`;
- `expected.musicxml`;
- `APPROVAL.md`;
- SHA-256 integrity evidence in `sha256.txt`.

The approval records golden-reference use and rights evidence, and records Audiveris 5.11.0. It does **not** explicitly approve Audiveris training use. The repository also does not preserve a separate page image, glyph image, shape label, or symbol coordinates for this evidence chain.

Therefore `scripts/audiverisTrainingDatasetInventory.js` represents this chain as **INCOMPLETE**, never as trainable data.

Current actual admitted real trainable sample count: **0**.

No missing glyph, label, coordinate, page image, approval scope, or split is fabricated.

## Files in T1

- `scripts/audiverisTrainingDatasetContract.js`
- `scripts/audiverisTrainingDatasetInventory.js`
- `tests/package8bDatasetContract.test.js`
- `docs/package-8b-t1-dataset-contract.md`

## Verified tests

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

## Closure evidence

- PR #104 final head: `4005192f55afead7d22e7a32db596569faa7aff9`
- exact-head CI #265 / run `33196559638`, job `98935074605`: **SUCCESS**
- exact-head: **1228/1228 tests**, 232 suites, 0 vulnerabilities, build PASS
- review threads: none
- protected-main squash merge: `278b69ed1f7f0cede6a3dc00e8265e887811c88b`
- exact-main CI #266 / run `33196791822`, job `98935863577`: **SUCCESS**
- exact-main: **1228/1228 tests**, 232 suites, 0 failed/skipped/cancelled, 0 vulnerabilities, build PASS

See `docs/package-8b-t1-closure.md` for the bounded closure record.

## Deferred work

T1 does not claim that a usable training dataset already exists. A later bounded 8B stage may intake only genuinely supplied teacher-approved labeled image/glyph evidence that satisfies this contract.

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

Revert protected-main implementation commit `278b69ed1f7f0cede6a3dc00e8265e887811c88b`. T1 introduced no production OMR/runtime/deployment state change.
