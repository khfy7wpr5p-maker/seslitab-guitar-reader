# SesliTab Current Status

Last documentation review: 2026-08-29  
Latest verified protected `main` implementation baseline: `5acafbd420cb9e54b4fb5b36f590db882c3300c3`  
Latest exact-main implementation CI: **#297 / run `33249268267`, job `99091994669` — SUCCESS**  
Current package state: **Package 0–8 Completed. Package 8B Partially implemented; 8B-T1 through 8B-T5 Completed.**

Current verified Package 8B research state:

- T1/T2 admitted real trainable samples: **0**;
- T3 bounded accidental mappings: **2,714** from 100 matched pages;
- T4 exact research approvals / admitted samples: **0 / 0**;
- T5 real native serializer-ready samples: **0**;
- `samples.zip` built: **NO**;
- Audiveris training executed: **NO**;
- production model changed: **NO**.

## Verified baseline

Exact-main CI #297 checked out exact protected-main SHA `5acafbd420cb9e54b4fb5b36f590db882c3300c3` and verified:

- **1299 / 1299 tests PASS**;
- **232 suites**;
- **0 failed / skipped / cancelled**;
- **0 vulnerabilities**;
- Vite production build **PASS**;
- real-browser score runtime proof **PASS** using Google Chrome.

`main` remains protected and requires `test-and-build`.

## Package 8B-T5 — isolated native sample staging harness

Status: **Completed.**

T5 adds a fail-closed research-only staging boundary before any Audiveris-native serializer or training execution. Fresh upstream verification was pinned to Audiveris `master` revision `7a36078e7ba0c006052c1f661b949cf9b729f505`.

The verified Audiveris native sample contract requires more than a label and mask hash: a native sample includes shape, explicit interline, glyph location and `RunTable` pixel evidence. T3 intentionally retained only mapped identity/shape/bbox/decoded-mask SHA-256, not the raw mask/RLE payload or Audiveris interline. T5 therefore never fabricates those fields.

T5 states are:

- `blocked_research_admission` — T4 admission is incomplete;
- `blocked_native_evidence` — T4 approval is complete but exact raw glyph/interline evidence is incomplete;
- `ready_for_audiveris_native_serializer` — exact T4 approval plus matching raw mask evidence and explicit interline are present.

Even the final state is **serializer-ready staging only**. T5 always keeps:

```text
samplesZipBuilt: false
trainingExecuted: false
t1TrainableSampleCount: 0
t1OmrEvidenceSatisfied: false
writerIndependentEvaluation: false
productionAuthorized: false
modelReplacementAuthorized: false
```

The stricter T1 `.omr` requirement remains unchanged. Page-disjoint evaluation is not represented as writer-independent evaluation.

## 8B-T5 verification evidence

- stage-start protected main: `51d505ea8c1e098c193b1f4525b1fb9a59326854`;
- implementation branch: `feature/package-8b-t5-isolated-native-samples-harness`;
- implementation PR #118 final head: `075984105476fbd815a700201ccb5ae2cd0e169b`;
- exact-head CI #296: **SUCCESS — 1299/1299 tests, 232 suites, 0 vulnerabilities, build PASS, browser proof PASS**;
- review threads before merge: **0 unresolved**;
- protected-main expected-head-locked squash merge: `5acafbd420cb9e54b4fb5b36f590db882c3300c3`;
- exact-main CI #297 / run `33249268267`, job `99091994669`: **SUCCESS — 1299/1299 tests, 232 suites, 0 vulnerabilities, build PASS, browser proof PASS**.

Detailed contract: `docs/package-8b-t5-isolated-native-samples-harness.md`.  
Closure evidence: `docs/package-8b-t5-closure.md`.

## Next safe boundary

Package 8B remains **Partially implemented**. The current 2,714 mapped records cannot be serialized into a valid native Audiveris repository from the retained T3 evidence, and T4 exact per-sample approvals remain 0.

A future package may implement or invoke a pinned Audiveris-native serializer only after separate explicit authorization and exact native evidence. Archive creation, Audiveris acceptance validation, training execution, evaluation and production-model adoption remain separate gates.

## Protected OMR and deployment boundary

Without separate explicit authorization and measured evidence, do not change production Audiveris provider/runtime/preflight, OMR worker/provider selection, Cloud OMR Gateway, backend production OMR path, `Dockerfile`, `render.yaml`, current Render service/deployment connection, or production model selection/replacement.
