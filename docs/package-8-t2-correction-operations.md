# Package 8-T2 — Controlled Teacher Correction Operations

Status: **Completed.**

Implementation baseline: `cd7e4686c88d2428d7a1a095539de2d87f9551e5`.  
Protected-main closure: `f6d80b4614654ee63a4fd2d51101e4961476a1ee`.  
Exact-main CI: **#230 / `33163126080`, job `98822108194` — SUCCESS**.

## Purpose

Package 8-T2 adds the first controlled correction operation layer on top of the immutable Package 8-T1 revision model. It does not add teacher approval, persistence, history storage, concurrency, UI, student sharing, or Audiveris training.

The central invariant remains:

> A teacher correction never overwrites the automatic source or its parent revision. It creates a new immutable corrected revision and a separate immutable audit event.

## Public contract

`src/services/teacherCorrectionOperations.js` exports:

- `TEACHER_CORRECTION_SCHEMA_VERSION = 1`
- `TEACHER_CORRECTION_OPERATION_KIND.REPLACE_VALUE`
- `TEACHER_CORRECTION_AUDIT_EVENT_TYPE = "teacher_correction"`
- `applyTeacherCorrectionBatch(...)`
- `isTeacherCorrectionAuditEvent(...)`

### Supported operation

T2 intentionally supports only one bounded operation kind:

`replace_value`

Each operation requires exactly:

- `operationId`
- `kind`
- `path`
- `value`

A path is an explicit array of object-property names and/or non-negative array indexes. T2 may replace only an already-existing location. It cannot add or delete score structure.

The prototype-sensitive keys `__proto__`, `constructor`, and `prototype` are not valid correction targets. This restriction is explicit even though T1 can safely preserve an existing own JSON `__proto__` data key.

## Batch semantics

A correction batch:

1. requires a valid immutable T1 parent revision;
2. requires caller-supplied `eventId`, `actorId`, and new `revisionId`;
3. accepts one or more strict replacement operations;
4. rejects sparse arrays, unsupported/plain-data shapes, hidden/accessor/symbol injection, invalid paths, no-op replacements, duplicate operation IDs, and overlapping paths;
5. applies replacements to a cloned parent snapshot only;
6. creates the new revision through T1 `createTeacherCorrectedRevision`;
7. returns the new revision plus a separate audit event.

Operations within one batch must target independent paths. Numeric `-0` is canonicalized to `0` so JavaScript-equivalent array targets cannot bypass overlap detection. Therefore accepted independent operations remain order-independent at the content level.

## Audit event

The audit event is separate from the revision and records:

- event identity and actor identity;
- exact source and parent revision identity;
- parent content fingerprint;
- exact result revision identity and result fingerprint;
- caller-supplied/null timestamp;
- each operation with path plus `before` and `after` values.

The audit event is deeply frozen and contains no `teacherApproved` or `approvalId` field. Approval remains Package 8-T3.

`actorId` is caller-supplied audit identity only. T2 does not implement authentication or authorization.

Audit validation accepts only the same safe plain-data family used by the correction contract. Unsupported primitives such as `undefined`, non-finite numbers, bigint, symbols and functions fail closed even in a caller-forged frozen audit record.

## Validation responsibility

T2 deliberately does not invent a musical schema or silently correct invalid musical values. It provides deterministic revision mechanics. Existing structural/canonical/quality validation remains responsible for evaluating corrected musical content before later approval or definitive downstream use.

A corrected revision is therefore not automatically teacher-approved or musically verified merely because the correction operation itself is structurally valid.

## Security and fail-closed rules

T2 rejects:

- nonexistent paths or attempted insertion/deletion;
- negative/fractional array indexes;
- numeric-string array indexes;
- protected prototype-related path keys;
- duplicate operation IDs;
- overlapping/same-target operation paths, including `-0` versus `0` aliases;
- no-op corrections;
- `undefined`, non-finite numbers, functions, symbols, bigint, circular values, sparse arrays, accessors, and non-plain objects;
- extra/injected operation fields, including approval-like fields;
- invalid or approval-injected parent revisions;
- forged audit records containing unsupported primitive or mutable/non-plain data.

No IDs or timestamps are generated internally.

## Review hardening

PR #89 review produced two valid findings before merge:

1. `-0` and `0` could otherwise appear as distinct paths while addressing the same array element. Path normalization now canonicalizes them and a regression requires rejection of the overlapping batch.
2. Audit validation initially treated all non-object values as safe. It now accepts only null/string/boolean/finite-number primitives and recursively strict frozen plain data; a regression rejects undefined, NaN, Infinity, bigint, symbol and function payloads.

Both review threads were resolved before merge. The final accepted head `c47ce6ba259e50bee8c71453c044650538535a14` passed exact-head CI #229.

## Closure evidence

PR #89 was squash-merged to protected main as:

`f6d80b4614654ee63a4fd2d51101e4961476a1ee`

Exact-main CI #230 verified:

- **1136 / 1136 tests PASS**
- **231 suites**
- **0 failed / skipped / cancelled**
- **0 audit vulnerabilities**
- production Vite build **PASS**
- T2 focused tests PASS
- both review regression tests PASS
- T1 regressions PASS
- existing OMR/Audiveris, Render Blueprint and Dockerfile security regressions PASS

Detailed integration evidence: `docs/package-8-t2-closure.md`.

## Protected integration boundary

T2 did not modify:

- `backend/` Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- Render service/deployment connection;
- Package 8 approval/history/concurrency/UI layers.

## Explicitly deferred

- **8-T3:** teacher approval binding and invalidation — next safe stage
- **8-T4:** undo/version history storage
- **8-T5:** optimistic concurrency/stale-base conflict
- **8-T6:** accessible teacher correction UI
- **8B:** Audiveris training dataset
- **12:** approved teacher-to-student sharing
