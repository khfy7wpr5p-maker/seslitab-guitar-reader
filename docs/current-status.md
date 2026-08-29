# SesliTab Current Status

Last documentation review: 2026-08-29  
Latest verified protected `main` implementation baseline: `08bb9a1d909c20445cc0dbcaf1a5514e48470ee8`  
Latest exact-main implementation CI: **#290 / run `33247398205`, job `99087145954` — SUCCESS**  
Current package state: **Package 0–8 Completed. Package 8B Partially implemented; 8B-T1, 8B-T2, 8B-T3 and 8B-T4 Completed.**  
Current T1/T2-admitted real eligible/trainable 8B sample count: **0**.  
Current research-only T3 accidental mapping evidence: **2,714 mapped accidentals from 100 matched pages**.  
Current T4 exact research approvals / admitted samples: **0 / 0**.

Source code, tests, protected-main state and fresh GitHub Actions evidence remain authoritative.

## Verified current baseline

Exact-main CI #290 checked out exact protected-main SHA `08bb9a1d909c20445cc0dbcaf1a5514e48470ee8` and verified:

- **1287 / 1287 tests PASS**
- **232 suites**
- **0 failed / skipped / cancelled**
- **0 vulnerabilities**
- Vite production build **PASS**
- real-browser score runtime proof **PASS** using Google Chrome
- Package 8B-T1/T2/T3/T4 focused regressions PASS
- existing OMR/Audiveris, Render Blueprint and Dockerfile security regressions PASS

`main` remains protected and requires `test-and-build`.

## Completed foundations

Packages 0–7 remain Completed and provide the established PDF/OMR, MusicXML security, canonical note/time, structural and quality validation, Turkish rhythmic text/TTS/playback, MIDI, Basic Guitar TAB, Basic Violin, source-only chord presentation and verified score-view foundations.

Package 8 is **Completed**. Its T1–T6 teacher revision, controlled correction, exact approval, lossless history/undo, optimistic concurrency and accessible teacher UI contracts remain intact.

Structural validity, source verification, quality-gate acceptance, teacher correction, teacher approval, Audiveris-training approval, research-sample approval and later student-sharing authorization remain separate concepts.

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

T3 maps only five supplied annotation classes to the corresponding bounded Audiveris accidental-shape vocabulary:

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

The 2,714 mapped records are experimental mapping evidence only. They are not T1/T2 trainable samples. The supplied annotation XML is not represented as Audiveris `.omr`, engineering approval is not converted into training approval, and writer-independent evaluation is not claimed.

### 8B-T4 — research-only Audiveris training admission

Status: **Completed.**

T4 resolves the architecture/licence admission question without weakening T1:

- Audiveris classifier preparation is represented as glyph+shape evidence destined for the global `samples.zip` training repository;
- T1's stricter exact `.omr` evidence requirement remains unchanged;
- MUSCIMA++ / CVC-MUSCIMA evidence is bounded to non-commercial research use in this stage;
- commercial or production intent fails closed;
- a separate exact approval scope, `audiveris_classifier_research_sample`, binds sample id + Audiveris shape + decoded-mask SHA-256 + reviewer + exact time + fixed research licence profile;
- T4 engineering approval is not converted into per-sample research approval;
- full T4 approval can authorize only a later isolated `samples.zip` preparation step, not training execution or model replacement;
- `productionAuthorized` and `modelReplacementAuthorized` always remain false in T4.

Current 2,714-sample pilot result:

```text
mapped experimental samples:     2,714
T4 exact research approvals:          0
T4 research samples admitted:         0
T1/T2 trainable samples:              0
status: blocked_missing_sample_approvals
samples.zip built:                    NO
Audiveris training executed:          NO
production model changed:             NO
```

The page split remains page-disjoint only. Writer-independent evaluation remains not established / not claimed.

## 8B-T4 verification evidence

- stage-start protected main: `35d3e9f475d15922ee0eef77b9804467622e5e27`
- implementation branch: `feature/package-8b-t4-research-training-admission`
- implementation PR #115 final head: `9142e9b3f81f75e0f0f1e44450c0ee9294e1f640`
- exact-head CI #289: **SUCCESS**
- review threads before merge: **0 unresolved**
- protected-main exact-head squash merge: `08bb9a1d909c20445cc0dbcaf1a5514e48470ee8`
- exact-main CI #290 / run `33247398205`, job `99087145954`: **SUCCESS**
- exact-main: **1287/1287 tests**, 232 suites, 0 failed/skipped/cancelled, 0 vulnerabilities, build PASS, real-browser proof PASS

Detailed contract: `docs/package-8b-t4-research-training-admission.md`.  
Closure evidence: `docs/package-8b-t4-closure.md`.

## Next safe boundary

Package 8B is **not Completed**. T4 defines when mapped third-party evidence could become eligible for a later isolated research artifact-preparation step, but the current corpus has **0 exact T4 per-sample approvals** and **0 admitted research samples**.

A later package may be considered only after explicit sample authorization. Its bounded purpose would be to build and validate an **isolated, non-commercial research `samples.zip` adapter/harness**. That later work must still separately gate any actual Audiveris training run, evaluation, classifier artifact creation and any production-model comparison/replacement.

Do not start that later implementation merely because T4 is Completed.

## Protected OMR and deployment boundary

Without separate explicit authorization and measured evidence, do not change:

- production Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway or production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection;
- production model selection/replacement.
