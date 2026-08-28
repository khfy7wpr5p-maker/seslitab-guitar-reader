# SesliTab Current Status

Last documentation review: 2026-08-28  
Latest verified protected `main` implementation baseline: `278b69ed1f7f0cede6a3dc00e8265e887811c88b`  
Latest exact-main implementation CI: **#266 / run `33196791822`, job `98935863577` — SUCCESS**  
Current package state: **Package 0–8 Completed. Package 8B Partially implemented; 8B-T1 Completed.**  
Next safe-sequence stage: **Package 8B-T2 — bounded verified-evidence intake/readiness work only; no training or production OMR changes.**

Source code, tests, protected-main state and fresh GitHub Actions evidence remain authoritative.

## Verified current baseline

Exact-main CI #266 checked out exact protected-main SHA `278b69ed1f7f0cede6a3dc00e8265e887811c88b` and verified:

- **1228 / 1228 tests PASS**
- **232 suites**
- **0 failed / skipped / cancelled**
- **0 vulnerabilities**
- Vite production build **PASS**
- all Package 8B-T1 focused and review-regression tests PASS
- existing OMR/Audiveris, Render Blueprint and Dockerfile security regressions PASS

`main` remains protected and requires `test-and-build`.

## Completed foundations

Packages 0–7 remain Completed and provide the established PDF/OMR, MusicXML security, canonical note/time, structural and quality validation, Turkish rhythmic text/TTS/playback, MIDI, Basic Guitar TAB, Basic Violin, and source-only chord presentation foundations.

Package 8 is **Completed**. Its T1–T6 teacher revision, controlled correction, exact approval, lossless history/undo, optimistic concurrency and accessible teacher UI contracts remain intact.

Structural validity, source verification, quality-gate acceptance, teacher correction, teacher approval, Audiveris-training approval and later student-sharing authorization are separate concepts.

## Package 8B — verified Audiveris training evidence

Status: **Partially implemented.**

### 8B-T1 — verified dataset contract

Status: **Completed.**

T1 establishes a fail-closed, research-only contract before any real Audiveris training dataset may exist.

Verified behavior:

- MusicXML alone is never a trainable sample;
- source PDF, page image, `.omr`, MusicXML, glyph, label, coordinates, licence and Audiveris version are explicit evidence fields;
- training approval uses scope `audiveris_training_sample` and binds to the exact deterministic candidate SHA-256 fingerprint;
- changing sample evidence prevents reuse of old training approval;
- candidate and dataset manifests are strict immutable records;
- dataset versions are deterministic;
- train/evaluation leakage is rejected by provenance plus shared PDF/page/.omr/MusicXML/glyph hashes;
- IDs/timestamps are caller supplied; none are invented;
- unsafe paths, malformed hashes, injected/accessor/sparse/mutable evidence fail closed;
- no filesystem writes, Audiveris execution, training, model replacement or production OMR/deployment integration were added.

### Current real evidence inventory

The repository preserves one strong owner/teacher-approved golden-reference chain at:

`tests/fixtures/golden-reference/plan0-owner-approved-3-8/`

It includes source PDF, `project.omr`, expected MusicXML, approval record and SHA-256 integrity evidence. The approval is valid golden/reference evidence and records CC0-1.0 rights plus Audiveris 5.11.0.

However, the repository currently preserves **0 trainable real Audiveris samples** under the 8B-T1 contract. The golden chain lacks a separate page image, glyph image, shape label, symbol coordinates, explicit Audiveris-training approval and split assignment. It therefore remains **INCOMPLETE** and is not promoted to training data.

No missing label, coordinate, image, approval or split is fabricated.

### 8B-T1 implementation evidence

- PR #104 final head: `4005192f55afead7d22e7a32db596569faa7aff9`
- exact-head CI #265 / run `33196559638`, job `98935074605`: **SUCCESS**
- exact-head: **1228/1228 tests**, 232 suites, 0 vulnerabilities, build PASS
- review threads: none
- protected-main squash merge: `278b69ed1f7f0cede6a3dc00e8265e887811c88b`
- exact-main CI #266 / run `33196791822`, job `98935863577`: **SUCCESS**
- exact-main: **1228/1228 tests**, 232 suites, 0 failed/skipped/cancelled, 0 vulnerabilities, build PASS

Detailed contract: `docs/package-8b-t1-dataset-contract.md`.  
Closure evidence: `docs/package-8b-t1-closure.md`.

## Next safe boundary

Package 8B is **not Completed**. A next bounded 8B stage may validate/intake genuinely supplied teacher-approved labeled image/glyph evidence against T1. It must not synthesize missing training evidence and must not run training or change the production model/runtime unless separately authorized and supported by measured evidence.

## Protected OMR and deployment boundary

Without separate explicit authorization, do not change:

- production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway or production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

Package 8B-T1 changed only isolated research/data contract, inventory, tests and documentation. Exact-main CI #266 confirms existing OMR/Audiveris and deployment security regressions remain green.
