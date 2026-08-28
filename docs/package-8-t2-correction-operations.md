# Package 8-T2 — Controlled Teacher Correction Operations

Status: **Implementation candidate; closure requires protected-main merge plus exact-main CI.**

Baseline used for this bounded stage: `cd7e4686c88d2428d7a1a095539de2d87f9551e5`.

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
5. applies the replacements to a cloned parent snapshot only;
6. creates the new revision through T1 `createTeacherCorrectedRevision`;
7. returns the new revision plus a separate audit event.

Operations within one batch must target independent paths. Therefore the resulting content does not depend on operation order.

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
- overlapping operation paths;
- no-op corrections;
- `undefined`, non-finite numbers, functions, symbols, bigint, circular values, sparse arrays, accessors, and non-plain objects;
- extra/injected operation fields, including approval-like fields;
- invalid or approval-injected parent revisions.

No IDs or timestamps are generated internally.

## Protected integration boundary

This stage must not modify:

- `backend/` Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- Render service/deployment connection;
- Package 8 approval/history/concurrency/UI layers.

## Test scope

Focused tests cover:

- bounded immutable vocabulary;
- correction without parent overwrite;
- deterministic independent multi-operation batches;
- correction chains preserving root source identity;
- array-element replacement without insertion;
- invalid/missing/type-mismatched paths;
- prototype-pollution path protection;
- duplicate IDs and overlapping paths;
- no-op rejection;
- unsafe replacement values;
- field/accessor/sparse/unsupported-operation injection;
- caller-supplied IDs/timestamp behavior;
- deeply frozen audit event with no approval claim;
- audit validator fail-closed behavior;
- invalid/injected parent rejection.

Full repository regression and production build remain mandatory before merge.

## Explicitly deferred

- **8-T3:** teacher approval binding and invalidation
- **8-T4:** undo/version history storage
- **8-T5:** optimistic concurrency/stale-base conflict
- **8-T6:** accessible teacher correction UI
- **8B:** Audiveris training dataset
- **12:** approved teacher-to-student sharing
