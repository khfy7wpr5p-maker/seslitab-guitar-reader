# SesliTab Current Status

Last documentation review: 2026-08-28  
Latest verified protected `main` implementation baseline: `4747210751c1c49295052f8cca7be58281b91023`  
Latest exact-main implementation CI: **#253 / run `33181815397`, job `98884637074` — SUCCESS**  
Current package state: **Package 8 — Partially implemented; 8-T1 through 8-T5 Completed.**  
Next bounded stage: **Package 8-T6 — accessible teacher UI — Not started.**

This file is a concise orientation document. Source code, tests, protected-main state and fresh GitHub Actions evidence remain authoritative. The documentation-only closure PR that carries this file does not change the T5 implementation baseline above.

## Verified current baseline

Exact-main CI #253 on `4747210751c1c49295052f8cca7be58281b91023` verified:

- **1186 / 1186 tests PASS**
- **232 suites**
- **0 failed / skipped / cancelled**
- `npm ci`: 119 packages installed; 120 packages audited
- **0 vulnerabilities**
- Vite 8.2.0 production build **PASS**
- 55 modules transformed
- all **13 Package 8-T5 optimistic-concurrency regressions PASS**
- T1–T4 revision/correction/approval/history/undo regressions PASS
- existing API cancellation regression PASS
- existing Audiveris/OMR, Render Blueprint and Dockerfile security regressions PASS

`main` remains protected and the required status check is `test-and-build`.

## Verified product foundations

Packages 0–7 remain Completed and provide the established foundations for PDF/OMR handling, MusicXML security, canonical note/time data, structural and quality validation, Turkish rhythmic text/TTS/playback, MIDI, Basic Guitar TAB, Basic Violin, and source-only MusicXML harmony/chord presentation.

Structural validity, source verification, quality-gate acceptance and teacher approval remain separate concepts.

## Package 8 current state

### 8-T1 — immutable revision domain

Status: **Completed.**

Automatic and teacher-corrected revisions are immutable. Revision schema v2 preserves deterministic content and recursive lineage identity. The lineage token is a version/drift identity, not a cryptographic signature or authorization credential.

Original bounded closure: PR #86 → protected-main `218c3e18eed3a82861a4a1c24efd5458445ea9ca` → exact-main CI #222 SUCCESS.

### 8-T2 — controlled teacher correction operations

Status: **Completed.**

T2 permits only bounded `replace_value` operations against existing paths. Parent revisions are never overwritten; each accepted correction creates a new immutable revision and separate correction audit event. Invalid/no-op/overlapping/prototype-sensitive operations fail closed.

Closure: PR #89 → protected-main `f6d80b4614654ee63a4fd2d51101e4961476a1ee` → exact-main CI #230 SUCCESS.

### 8-T3 — exact-revision teacher approval binding/invalidation

Status: **Completed.**

Approval is separate immutable evidence bound to exact revision metadata/content and recursive lineage. Later, replayed or undo-created revisions do not inherit an older approval automatically.

Final hardening: PR #95 → implementation main `c57966598d2d6fe34418119670bea42a9cdcf369` → exact-main CI #240 SUCCESS. Detailed evidence: `docs/package-8-t3-closure.md`.

### 8-T4 — lossless revision history and undo

Status: **Completed.**

T4 preserves the automatic root, corrected revisions, correction audits, approval records and undo evidence in immutable history snapshots. Undo never rewrites prior evidence; it creates a new corrected revision from exact historical content with new recursive lineage. Historical approval therefore does not silently resurrect.

Final implementation: PR #97 → merge `eaf967174d1cc0f2552cc97e7e0a6bf0a1715c64` → exact-main CI #248 SUCCESS. Detailed evidence: `docs/package-8-t4-closure.md`.

### 8-T5 — optimistic concurrency / stale-history conflict

Status: **Completed.**

T5 adds `src/services/teacherRevisionConcurrency.js` as a pure domain-level compare-and-apply guard over valid T4 histories.

Verified behavior:

- caller captures a strict immutable expectation from one exact T4 history;
- expectation binds history/source identity, complete deterministic history-state fingerprint, exact current revision identity/content/recursive lineage, and evidence counts;
- approval-only history changes invalidate an older expectation even when the current revision does not change;
- fresh guarded correction/approval/undo may apply using existing T2/T3/T4 rules;
- stale, history-mismatched or source-mismatched expectations return explicit conflict;
- conflict returns the exact unchanged current history plus a fresh expectation and creates **no revision, audit event or approval**;
- no automatic musical merge/rebase is attempted;
- no ID or timestamp is invented;
- malformed/mutable/injected expectation records fail closed.

### T5 authority boundary

T5 is a **domain compare-and-apply primitive**, not a database transaction or distributed lock.

The `history` supplied to T5 must be the integration layer's authoritative current valid T4 history at the commit boundary. If future persistence is added, the storage integration must preserve the compare-and-apply condition atomically with its own write.

The deterministic full-history fingerprint is a version/drift token, **not** authentication, authorization, a digital signature or cryptographic integrity credential.

Final code evidence:

- PR #99 final head: `6e151b94609ecf362b3bff0976479a6c2eda45b9`
- exact-head CI #252 / run `33181561159`, job `98883764663`: **SUCCESS**
- exact-head: **1186/1186 PASS**, 232 suites, 0 vulnerabilities, build PASS
- final pre-merge review threads/submitted reviews: none
- protected-main squash merge: `4747210751c1c49295052f8cca7be58281b91023`
- exact-main CI #253 / run `33181815397`, job `98884637074`: **SUCCESS**
- exact-main: **1186/1186 PASS**, 232 suites, 0 vulnerabilities, build PASS
- detailed contract: `docs/package-8-t5-optimistic-concurrency.md`
- detailed closure: `docs/package-8-t5-closure.md`

### Remaining Package 8 stage

- **8-T6 — Not started / NEXT:** accessible teacher UI.

Package 8 therefore remains **Partially implemented**, not Completed.

## Separate later roadmap package

**Package 8B — Audiveris training dataset** remains Not started and separate from Package 8-T1..T6.

## Protected OMR and Render boundary

Package 8 work must not modify without separate explicit authorization:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

PR #99 changed only the T5 concurrency domain, its focused tests and T5 contract document. Exact-main CI #253 confirms the existing OMR/Audiveris, Render Blueprint and Dockerfile security regressions remain green.

## Current next boundary

The next roadmap stage is **8-T6: accessible teacher UI**, but it has **not started** in this closure. T6 must consume the verified T1–T5 contracts without weakening history, approval or stale-state protections. No T6 source/UI change is part of the T5 closure.
