# SesliTab Current Status

Last documentation review: 2026-08-28  
Latest verified protected `main` implementation baseline: `ce5210476c5957595a9159abff6fd3b64afd10bd`  
Latest exact-main implementation CI: **#273 / run `33207881028`, job `98973500868` — SUCCESS**  
Current package state: **Package 0–8 Completed. Package 8B Partially implemented; 8B-T1 and 8B-T2 Completed.**  
Current real eligible/trainable 8B sample count: **0**.

Source code, tests, protected-main state and fresh GitHub Actions evidence remain authoritative.

## Verified current baseline

Exact-main CI #273 checked out exact protected-main SHA `ce5210476c5957595a9159abff6fd3b64afd10bd` and verified:

- **1244 / 1244 tests PASS**
- **232 suites**
- **0 failed / skipped / cancelled**
- **0 vulnerabilities**
- Vite production build **PASS**
- Package 8B-T1 and 8B-T2 focused/review regressions PASS
- existing OMR/Audiveris, Render Blueprint and Dockerfile security regressions PASS

`main` remains protected and requires `test-and-build`.

## Completed foundations

Packages 0–7 remain Completed and provide the established PDF/OMR, MusicXML security, canonical note/time, structural and quality validation, Turkish rhythmic text/TTS/playback, MIDI, Basic Guitar TAB, Basic Violin, and source-only chord presentation foundations.

Package 8 is **Completed**. Its T1–T6 teacher revision, controlled correction, exact approval, lossless history/undo, optimistic concurrency and accessible teacher UI contracts remain intact.

Structural validity, source verification, quality-gate acceptance, teacher correction, teacher approval, Audiveris-training approval and later student-sharing authorization remain separate concepts.

## Package 8B — verified Audiveris training evidence

Status: **Partially implemented.**

### 8B-T1 — verified dataset contract

Status: **Completed.**

T1 establishes the immutable, fail-closed research/data contract required before any real Audiveris training dataset may exist:

- MusicXML alone is never a trainable sample;
- source PDF, page image, `.omr`, MusicXML, glyph, shape label, coordinates, licence and Audiveris version are explicit evidence;
- training approval scope is `audiveris_training_sample` and binds to the exact deterministic candidate fingerprint;
- evidence changes prevent reuse of prior training approval;
- candidate/dataset manifests are strict immutable records;
- train/evaluation leakage is rejected through provenance and shared PDF/page/.omr/MusicXML/glyph hashes;
- dataset fingerprint/versioning is deterministic;
- unsafe or fabricated evidence fails closed;
- production OMR/model/deployment wiring is untouched.

### 8B-T2 — verified evidence intake/readiness

Status: **Completed.**

T2 adds an isolated byte-verification/readiness boundary over T1:

- raw supplied artifact bytes are hashed by T2 itself with SHA-256;
- exact declared path + digest must match the T1 candidate evidence;
- paths are compared byte-for-byte and are not trimmed into equivalence;
- readiness is only `eligible`, `incomplete` or `rejected`;
- `eligible` means **eligible for dataset-manifest review only**, not training-run authorization or production readiness;
- missing observations remain incomplete;
- duplicate/undeclared/path-mismatched/hash-mismatched evidence is rejected;
- MusicXML-only evidence cannot be promoted;
- raw evidence bytes are never retained in the readiness report;
- report shape and semantics are immutable/fail-closed;
- no Audiveris execution, model training, production model replacement or deployment change was added.

### Current real evidence inventory

The repository preserves one strong owner/teacher-approved golden-reference chain at:

`tests/fixtures/golden-reference/plan0-owner-approved-3-8/`

It includes source PDF, `project.omr`, expected MusicXML, reference approval and SHA-256/licence evidence. T2 verifies the currently declared artifact bytes in regression tests.

It still is **not** a trainable 8B sample because it lacks:

- separate page image;
- glyph image;
- real shape label;
- symbol coordinates;
- explicit `audiveris_training_sample` approval;
- train/evaluation split assignment.

Therefore current real eligible/trainable sample count remains **0**. No missing label, coordinate, image, approval, licence, split or metric is generated or inferred.

## 8B-T2 implementation evidence

- implementation PR #106 final head: `8d333a4bc3de2b58731b6c0360e5d0923b9728fb`
- exact-head CI #272 / run `33207712313`, job `98972982291`: **SUCCESS**
- exact-head: **1244/1244 tests**, 232 suites, 0 failures/skips/cancellations, 0 vulnerabilities, build PASS
- review P2 exact-path normalization issue fixed and regression-tested
- protected-main squash merge: `ce5210476c5957595a9159abff6fd3b64afd10bd`
- exact-main CI #273 / run `33207881028`, job `98973500868`: **SUCCESS**
- exact-main: **1244/1244 tests**, 232 suites, 0 failed/skipped/cancelled, 0 vulnerabilities, build PASS

Detailed contract: `docs/package-8b-t2-evidence-readiness.md`.  
Closure evidence: `docs/package-8b-t2-closure.md`.

## Next safe boundary

Package 8B is **not Completed** because no genuine teacher-verified, training-ready symbol sample exists in the repository.

There is currently no evidence-supported next coding stage that may fabricate the missing page/glyph/shape/coordinate/training-approval/split data. The safe next action is to obtain genuine teacher-verified training artifacts and then fresh-read them against T1/T2. Until that evidence exists, do not start model training and do not advance to Package 9 under the approved sequential roadmap.

## Protected OMR and deployment boundary

Without separate explicit authorization and measured evidence, do not change:

- production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway or production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection;
- production model selection/replacement.
