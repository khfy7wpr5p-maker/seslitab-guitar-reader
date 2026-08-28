# Package 8-T1 — Immutable Teacher Revision Domain

Date: 2026-08-28

Status on this feature branch: **implementation candidate; not package closure**.

## Objective

Establish the smallest safe data-domain boundary required before teacher correction, approval, undo/version history, optimistic concurrency, persistence, or teacher UI is implemented.

## In scope

- immutable automatic revision snapshot;
- immutable teacher-corrected revision snapshot;
- exact parent revision identity;
- preservation of the original automatic source revision identity;
- deterministic content fingerprint for drift detection;
- strict JSON-like snapshot validation;
- deep immutability;
- fail-closed revision validation;
- focused regression tests.

## Out of scope

This stage does **not** implement:

- teacher approval;
- approval invalidation;
- correction operations/editor commands;
- undo;
- version-history store;
- concurrent-edit resolution;
- persistence/API/backend changes;
- teacher UI;
- student sharing;
- Package 8B Audiveris training dataset;
- any OMR/Audiveris change;
- any Render/deployment change.

## Files

Implementation:

- `src/services/teacherRevisionModel.js`

Tests:

- `tests/teacherRevisionModel.test.js`

## Domain contract

### Automatic revision

An automatic revision is created with:

- `revisionKind = automatic`;
- exact `revisionId`;
- exact `sourceId`;
- `sourceRevisionId = revisionId`;
- `parentRevisionId = null`;
- caller-supplied or null `createdAt`;
- deterministic `contentFingerprint`;
- deep-cloned, deep-frozen `content`.

The caller's original data is never frozen or mutated. Later caller-side mutation cannot change the stored revision snapshot.

### Teacher-corrected revision

A corrected revision:

- requires a valid immutable parent revision;
- must use a new `revisionId`;
- keeps the exact parent in `parentRevisionId`;
- inherits `sourceId` and the original `sourceRevisionId`;
- receives a fresh immutable content snapshot and fingerprint;
- never mutates its parent.

## Approval safety boundary

Approval is intentionally absent from the T1 schema. A strict revision record rejects extra fields, including an injected `teacherApproved` field.

Future Package 8-T3 approval must therefore be represented as a separate record bound to the exact revision identity (and its current fingerprint), not as a mutable flag added to canonical/source data.

The T1 fingerprint is a deterministic drift/version token, not a cryptographic authorization primitive. Security/authorization must not rely on the FNV fingerprint alone.

## Snapshot restrictions

T1 accepts only deterministic plain-data snapshots:

- arrays;
- plain objects;
- strings;
- booleans;
- finite numbers;
- null.

It rejects functions, symbols, bigint, undefined, non-finite numbers, accessors, non-enumerable custom properties, non-plain objects, sparse arrays, and circular references.

This conservative boundary avoids silently serializing or losing source data. If a later integration requires a broader representation, that must be a separately tested contract change rather than an implicit coercion.

## Protected boundaries

This stage must not modify or depend on:

- `backend/`;
- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- existing Render service/deployment connection;
- existing canonical parser/quality/playback/TAB/violin/chord behavior;
- dependencies.

## Acceptance evidence required before merge

1. Branch contains only the T1 implementation, tests and this stage document.
2. Focused T1 tests are included in the normal `npm test` suite.
3. Full `test-and-build` exact-head CI succeeds.
4. No unresolved review thread remains.
5. Branch is fresh against protected main.
6. Protected-main merge uses the exact accepted head.
7. Exact-main `test-and-build` succeeds after merge.

Only after those gates may Package 8 be described as **Partially implemented (T1 complete)**. Package 8 itself must not be marked Completed.
