# Package 8-T2 — Controlled Correction Operations Closure Evidence

Date: 2026-08-28

Status: **Completed as a bounded Package 8 sub-stage. Package 8 itself remains Partially implemented.**

## Scope

Package 8-T2 established only the controlled correction-operation layer required on top of Package 8-T1 before teacher approval, history/undo, concurrency or teacher UI.

Implementation files:

- `src/services/teacherCorrectionOperations.js`
- `tests/teacherCorrectionOperations.test.js`
- `tests/teacherCorrectionReviewRegression.test.js`
- `docs/package-8-t2-correction-operations.md`

No OMR/Audiveris, backend, deployment or Render connection file was part of the implementation PR.

## Baseline and integration evidence

Verified protected main before T2 implementation:

`cd7e4686c88d2428d7a1a095539de2d87f9551e5`

Implementation pull request:

- PR #89 — `Package 8-T2: add controlled teacher correction operations`
- final accepted feature head after review hardening: `c47ce6ba259e50bee8c71453c044650538535a14`
- exact-head CI #229 / run `33162963010`: **SUCCESS**
- protected-main squash merge: `f6d80b4614654ee63a4fd2d51101e4961476a1ee`
- exact-main CI #230 / run `33163126080`, job `98822108194`: **SUCCESS**

Exact-main CI #230 verified:

- **1136 / 1136 tests PASS**
- **231 suites**
- **0 failed**
- **0 skipped**
- **0 cancelled**
- `npm ci`: 119 packages installed; 120 packages audited
- **0 vulnerabilities**
- production build: **PASS**
- Vite 8.2.0
- 55 modules transformed

The required protected-main status check remains `test-and-build`.

## Implemented T2 contract

T2 provides a small, pure correction domain above T1:

- schema version 1;
- one bounded correction kind: `replace_value`;
- explicit path arrays using property names and non-negative array indexes;
- replacement of already-existing locations only;
- no add/delete/structural insertion semantics;
- exact immutable parent revision required;
- parent snapshot cloned before correction;
- accepted correction creates a new immutable T1 `teacher_corrected` revision;
- separate deeply immutable correction audit event;
- caller-supplied event, actor, revision and timestamp identity;
- exact parent/result revision and content-fingerprint evidence;
- per-operation `before` and `after` values;
- deterministic independent-path batch behavior.

T2 does not generate IDs or timestamps.

## Review findings and fixes

PR #89 review identified two relevant edge cases. Neither was waived.

### 1. `-0` and `0` path aliasing

JavaScript treats `-0` and `0` as the same array index. The first implementation accepted both as numeric path segments but could compare them as distinct during overlap detection, allowing two operations in one batch to target the same location.

Fix:

- numeric path normalization canonicalizes `-0` to `0`;
- overlap detection therefore treats both forms as one target;
- a dedicated regression verifies a `[-0, ...]` and `[0, ...]` pair is rejected as overlapping.

### 2. Unsupported primitive values in forged audit records

The first audit validator could accept some unsupported non-object primitive values in a caller-constructed frozen record even though the correction API itself rejected them.

Fix:

- deep audit-data validation explicitly accepts only null, strings, booleans and finite numbers as primitives;
- `undefined`, non-finite numbers, bigint, symbols and functions are rejected;
- nested arrays/objects must remain strict frozen plain data;
- a dedicated regression covers forged frozen audit events carrying unsupported primitive values.

Both review threads were resolved after the fixes and the final head passed exact-head CI #229. Both regressions also pass on exact-main CI #230.

## Fail-closed behavior verified

T2 rejects:

- invalid, missing or type-mismatched paths;
- negative/fractional indexes;
- numeric-string indexes where an array index is required;
- protected path keys `__proto__`, `constructor`, `prototype`;
- duplicate operation IDs;
- overlapping or same-target batch operations;
- no-op corrections;
- unsupported operation kinds;
- unsafe/non-deterministic replacement values;
- sparse arrays, accessors, hidden/symbol injection and non-plain objects;
- extra operation fields, including approval-like fields;
- invalid or approval-injected parent revisions.

The automatic source and every parent revision remain unchanged.

## Approval boundary

Package 8-T2 deliberately does **not** implement teacher approval.

The correction audit event and corrected revision contain no `teacherApproved`, `approvalId` or equivalent approval claim. A correction also does not establish musical verification merely because its operation structure is valid.

Future Package 8-T3 must represent teacher approval separately and bind it to one exact revision identity/content fingerprint. A later corrected revision must not inherit an earlier approval automatically.

## Explicit protected boundaries

Package 8-T2 did not modify:

- `backend/`;
- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection;
- Package 8 approval/history/concurrency/UI layers;
- student sharing;
- Audiveris training data;
- dependencies;
- CI workflows.

Exact-main CI #230 exercised existing OMR/Audiveris, Render Blueprint and Dockerfile security regressions successfully.

## Package status after this closure

- Package 0–7: **Completed**.
- Package 8: **Partially implemented**.
- Package 8-T1: **Completed**.
- Package 8-T2: **Completed**.
- Package 8-T3 through 8-T6: **Not started**.
- Package 8B — Audiveris training dataset: **Not started and separate from 8-T1..T6**.

## Next safe implementation stage

**Package 8-T3 — exact-revision teacher approval binding and invalidation semantics.**

T3 must remain a bounded domain stage. It must not add history/undo storage, optimistic concurrency, teacher UI, student sharing, Audiveris training, OMR infrastructure changes or Render/deployment changes.
