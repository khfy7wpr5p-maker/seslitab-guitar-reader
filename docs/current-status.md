# SesliTab Current Status

Last documentation review: 2026-08-29  
Latest verified protected `main` implementation baseline: `eb711fa0483b87d841b4381e242b4d19ae95d189`  
Latest exact-main implementation CI: **#308 / run `33251255425`, job `99097200088` — SUCCESS**  
Current package state: **Package 0–8 Completed. Package 8B Partially implemented; 8B-T1 through 8B-T6 Completed.**

Current verified Package 8B research state:

- T1/T2 admitted real trainable samples: **0**;
- T3 bounded accidental mappings: **2,714** from 100 matched pages;
- T4 exact research approvals / admitted samples: **0 / 0**;
- T5 real native serializer-ready samples: **0**;
- real-data `samples.zip` built: **NO**;
- real-data pinned-Audiveris acceptance receipt: **NO**;
- Audiveris training executed: **NO**;
- production model changed: **NO**.

## Verified baseline

Exact-main CI #308 checked out exact protected-main SHA `eb711fa0483b87d841b4381e242b4d19ae95d189` and verified:

- **1315 / 1315 tests PASS**;
- **232 suites**;
- **0 failed / skipped / cancelled**;
- **0 vulnerabilities**;
- Vite production build **PASS**;
- real-browser score render + cursor runtime proof **PASS** using Google Chrome.

`main` remains protected and requires `test-and-build`.

## Package 8B-T6 — pinned native serializer + acceptance gate

Status: **Completed.**

T6 adds the isolated serializer/acceptance boundary after T5. It is pinned to Audiveris revision `7a36078e7ba0c006052c1f661b949cf9b729f505` and accepts only an exact valid T5 `ready_for_audiveris_native_serializer` report.

For qualifying evidence T6 can deterministically construct Audiveris-native `samples.zip` bytes containing:

- `META-INF/container.xml`;
- deterministic per-page sample sheets;
- per-sheet `samples.xml`;
- horizontal `RunTable` RLE derived from exact T5 mask evidence;
- explicit empty `<runs/>` rows where a bbox row contains no foreground pixels.

Archive construction and acceptance are separate states. A built archive is only `archive_built_pending_pinned_acceptance`. Acceptance requires a receipt from an exact, clean checkout at the pinned Audiveris revision using the real `SampleRepository.getInstance(Path, true)` API and an exact loaded-sample-count check.

T6 binds acceptance to the exact archive SHA-256, T5 staging-manifest fingerprint, pinned revision and sample count. It rejects revision drift, dirty pinned checkouts, archive mutation, path/API mismatch, count mismatch, malformed receipts and authorization escalation.

Even an accepted archive keeps:

```text
trainingExecuted: false
productionAuthorized: false
modelReplacementAuthorized: false
```

The current real Package 8B population cannot enter the serializer because T4 exact approvals and T5 serializer-ready real samples remain 0. T6 tests therefore prove the bounded serializer/acceptance contract without fabricating a real-data archive or acceptance claim.

## 8B-T6 verification evidence

- stage-start protected main: `a771c27d9359c2fbcd4b126272287cf0ca82d875`;
- implementation branch: `feature/package-8b-t6-pinned-native-serializer`;
- implementation PR #120 final head: `9f7806c6eb6079dfc5ee929d270dfb39b063e8a4`;
- exact-head CI #307 / run `33251176354`, job `99096993296`: **SUCCESS**;
- final merge gate: **0 behind**, mergeable, **0 unresolved review threads**;
- protected-main expected-head-locked squash merge: `eb711fa0483b87d841b4381e242b4d19ae95d189`;
- exact-main CI #308 / run `33251255425`, job `99097200088`: **SUCCESS — 1315/1315 tests, 232 suites, 0 vulnerabilities, build PASS, browser proof PASS**.

Detailed contract: `docs/package-8b-t6-pinned-native-serializer.md`.  
Closure evidence: `docs/package-8b-t6-closure.md`.

## Next safe boundary

Package 8B remains **Partially implemented**. The engineering path through T6 now exists, but the real evidence gates still block execution: 2,714 mapped records have **0 exact T4 approvals** and **0 T5 serializer-ready real samples**.

The next evidence-supported step is to acquire and verify genuine per-sample approval/native evidence required by T4/T5. No classifier training, evaluation or production-model adoption is justified until real evidence passes those gates and a real archive receives a matching pinned-Audiveris acceptance receipt.

Do not invent a further Package 8B substage merely to bypass missing evidence. Package 9 remains sequentially blocked while Package 8B is incomplete unless the roadmap is explicitly changed.

## Protected OMR and deployment boundary

Without separate explicit authorization and measured evidence, do not change production Audiveris provider/runtime/preflight, OMR worker/provider selection, Cloud OMR Gateway, backend production OMR path, `Dockerfile`, `render.yaml`, current Render service/deployment connection, CI workflow/dependencies, or production model selection/replacement.
