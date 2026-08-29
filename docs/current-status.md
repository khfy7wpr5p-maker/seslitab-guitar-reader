# SesliTab Current Status

Last documentation review: 2026-08-29  
Latest verified protected `main` implementation baseline: `258ac27262aa4715164aafebe8fce97bb89f9dfb`  
Latest exact-main implementation CI: **#286 / run `33246461356`, job `99084669804` — SUCCESS**  
Current package state: **Package 0–8 Completed. Package 8B Partially implemented; 8B-T1, 8B-T2 and 8B-T3 Completed.**  
Current T1/T2-admitted real eligible/trainable 8B sample count: **0**.  
Current research-only T3 accidental mapping evidence: **2,714 mapped accidentals from 100 matched pages**.

Source code, tests, protected-main state and fresh GitHub Actions evidence remain authoritative.

## Verified current baseline

Exact-main CI #286 checked out exact protected-main SHA `258ac27262aa4715164aafebe8fce97bb89f9dfb` and verified:

- **1275 / 1275 tests PASS**
- **232 suites**
- **0 failed / skipped / cancelled**
- **0 vulnerabilities**
- Vite production build **PASS**
- real-browser score runtime proof **PASS**
- Package 8B-T1/T2/T3 focused regressions PASS
- existing OMR/Audiveris, Render Blueprint and Dockerfile security regressions PASS

`main` remains protected and requires `test-and-build`.

## Completed foundations

Packages 0–7 remain Completed and provide the established PDF/OMR, MusicXML security, canonical note/time, structural and quality validation, Turkish rhythmic text/TTS/playback, MIDI, Basic Guitar TAB, Basic Violin, source-only chord presentation and later verified score-view foundations.

Package 8 is **Completed**. Its T1–T6 teacher revision, controlled correction, exact approval, lossless history/undo, optimistic concurrency and accessible teacher UI contracts remain intact.

Structural validity, source verification, quality-gate acceptance, teacher correction, teacher approval, Audiveris-training approval and later student-sharing authorization remain separate concepts.

## Package 8B — verified Audiveris training evidence

Status: **Partially implemented.**

### 8B-T1 — verified dataset contract

Status: **Completed.**

T1 establishes the immutable, fail-closed contract for genuine Audiveris training candidates. MusicXML alone cannot be training truth; training approval scope is `audiveris_training_sample` and binds to the exact candidate fingerprint; train/evaluation leakage and fabricated evidence fail closed; production OMR/model/deployment wiring is untouched.

### 8B-T2 — verified evidence intake/readiness

Status: **Completed.**

T2 hashes supplied artifact bytes itself, requires exact path+digest agreement with T1 and reports only `eligible`, `incomplete` or `rejected`. `eligible` means eligible for dataset-manifest review only, never training authorization or production readiness.

### 8B-T3 — bounded MUSCIMA accidental mapping

Status: **Completed.**

T3 safely maps only five supplied annotation classes to the corresponding bounded Audiveris accidental-shape vocabulary:

- `accidentalSharp` → `SHARP`
- `accidentalFlat` → `FLAT`
- `accidentalNatural` → `NATURAL`
- `accidentalDoubleSharp` → `DOUBLE_SHARP`
- `accidentalDoubleFlat` → `DOUBLE_FLAT`

Measured user-supplied pilot evidence:

- 100 PNG page images;
- 100 XML annotation files;
- 100/100 deterministic page matches;
- 10,109 total annotation objects;
- **2,714 accidental objects**;
- 0 accidental bounding boxes outside the declared page;
- local research-only page-disjoint split: **2,247 mapped train / 467 mapped evaluation** across 80/20 pages.

T3 validates page/hash identity, integer bounds and binary RLE masks, hashes decoded mask pixels and creates deterministic mapping identities. Unrelated MUSCIMA classes are ignored rather than relabelled.

The 2,714 mapped records are **experimental mapping evidence only**. They are not T1/T2 trainable samples. Every mapped record remains blocked by:

- missing Audiveris `.omr` artifact;
- missing exact per-sample `audiveris_training_sample` approval;
- external licence review required.

The supplied annotation XML is not renamed or represented as an Audiveris `.omr` project. User approval to perform T3 engineering is not converted into per-sample training approval. The split is page-disjoint only; writer-independent evaluation is not claimed.

Source/derived MUSCIMA images are not published into the public repository. The normalized pilot remains research-only under the documented external-license boundary.

## 8B-T3 verification evidence

- implementation PR #113 final head: `b3f4b71a9748f2b8281abe5f0d9e6fb925a0fd9a`
- exact-head CI #285 / run `33246314925`, job `99084280341`: **SUCCESS**
- review threads: **0 unresolved**
- protected-main exact-head squash merge: `258ac27262aa4715164aafebe8fce97bb89f9dfb`
- exact-main CI #286 / run `33246461356`, job `99084669804`: **SUCCESS**
- exact-main: **1275/1275 tests**, 232 suites, 0 failed/skipped/cancelled, 0 vulnerabilities, build PASS, real-browser proof PASS

Detailed contract: `docs/package-8b-t3-muscima-accidental-mapping.md`.  
Closure evidence: `docs/package-8b-t3-closure.md`.

## Next safe boundary

Package 8B is **not Completed**. T3 solved the bounded annotation-to-shape mapping problem for accidentals, but it did not satisfy T1/T2 admission requirements and did not train Audiveris.

The next safe action is evidence/architecture review before any training stage: determine how third-party classifier glyph evidence should satisfy or intentionally revise the T1 `.omr` requirement, obtain explicit per-sample training authorization compatible with the external licence, and define an evaluation protocol that does not overclaim writer independence. Do not start model training or production-model replacement merely because 2,714 mappings exist.

## Protected OMR and deployment boundary

Without separate explicit authorization and measured evidence, do not change:

- production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway or production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection;
- production model selection/replacement.
