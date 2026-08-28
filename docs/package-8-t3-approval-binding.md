# Package 8-T3 — Exact-Revision Teacher Approval Binding

Status: **Completed — final review-hardened closure.**

Original T3 baseline: `c426325af2ddeca9ae2341449f365f3667aaa3f0`.  
Final protected-main implementation: `c57966598d2d6fe34418119670bea42a9cdcf369`.  
Final implementation PR: **#95**.  
Exact-head CI: **#239 / run `33174812700` — SUCCESS**.  
Exact-main CI: **#240 / run `33175019324`, job `98861276737` — SUCCESS**.

## Purpose

Package 8-T3 represents explicit teacher approval as a separate immutable domain record bound to one exact Package 8 revision.

The source rule is preserved directly: approval records which exact revision was approved. A changed, recreated or replayed revision is not covered unless it has the same complete immutable revision identity, including recursive lineage.

Historical approval evidence is not mutated or deleted merely because it no longer applies to a later revision.

## Final public contracts

### Revision contract used by T3

`src/services/teacherRevisionModel.js`:

- `TEACHER_REVISION_SCHEMA_VERSION = 2`
- automatic and teacher-corrected immutable revisions
- deterministic `contentFingerprint`
- `parentLineageFingerprint`
- deterministic recursive `lineageFingerprint`

### Approval contract

`src/services/teacherApprovalModel.js` exports:

- `TEACHER_APPROVAL_SCHEMA_VERSION = 3`
- `TEACHER_APPROVAL_STATE = "teacher_approved"`
- immutable applicability vocabulary:
  - `APPROVED_EXACT_REVISION`
  - `NOT_APPLICABLE_TO_REVISION`
- `createTeacherApprovalRecord(...)`
- `isTeacherApprovalRecord(...)`
- `evaluateTeacherApprovalForRevision(...)`

## Approval record fields

A valid approval record contains exactly:

1. `schemaVersion`
2. `approvalState`
3. caller-supplied `approvalId`
4. caller-supplied `actorId`
5. exact `sourceId`
6. exact root `sourceRevisionId`
7. exact `approvedRevisionId`
8. exact `approvedRevisionKind`
9. exact `approvedParentRevisionId`
10. exact `approvedRevisionCreatedAt`
11. exact `approvedContentFingerprint`
12. exact `approvedLineageFingerprint`
13. caller-supplied/null approval `createdAt`

The record is flat, frozen and strict. `actorId` is caller-supplied audit evidence; T3 does not authenticate or authorize that actor.

## Exact-revision applicability

Approval applies only when all eight revision binding dimensions match the candidate revision:

1. `sourceId`
2. root `sourceRevisionId`
3. `revisionId`
4. `revisionKind`
5. `parentRevisionId`
6. revision `createdAt`
7. `contentFingerprint`
8. recursive `lineageFingerprint`

If any dimension differs, evaluation returns:

`NOT_APPLICABLE_TO_REVISION`

Only a complete exact match returns:

`APPROVED_EXACT_REVISION`

## Recursive lineage identity

A corrected revision's `lineageFingerprint` is deterministically derived from its own immutable revision metadata/content fingerprint and its exact `parentLineageFingerprint`.

The recursive chain therefore commits to the whole ancestor path transitively, not merely to the direct parent revision ID.

The lineage token is a deterministic version/drift identity. It is **not**:

- a cryptographic signature;
- tamper-proof authentication;
- actor authentication;
- authorization;
- a student-sharing credential.

## Review-hardening history

T3 was deliberately not closed merely because the first implementation passed CI.

### PR #91 — initial approval implementation

The first immutable approval model was implemented and green on CI #233/#234.

### PR #92 review — one-hop ancestor ID replay P1

Review found that an ancestor revision ID plus restored content could revive an earlier approval under the original binding. PR #92 was a docs closure attempt and was **closed without merge**.

### PR #93 — approval schema v2 hardening

Approval was expanded to bind source/root identity, revision ID/kind, direct parent ID, revision timestamp and content fingerprint. Exact-main CI #237 was green.

### PR #94 review — multi-hop replay P1

Review then found a deeper replay:

```text
A0 -> R1 -> R2 (approved)
              |
              v
          replay R1
              |
              v
          replay R2
```

The replayed R2 could reproduce every schema-v2 approval dimension:

- same source ID;
- same root source revision ID;
- same R2 revision ID;
- same revision kind;
- same parent revision ID R1;
- same revision timestamp;
- restored same content fingerprint.

Therefore direct-parent metadata alone was not enough. PR #94 was **closed without merge**.

### PR #95 — final recursive-lineage hardening

PR #95 solved the defect at the immutable revision-domain level:

1. T1 revision schema became v2.
2. Every corrected revision stores its parent's recursive lineage token.
3. Every corrected revision derives a new `lineageFingerprint` from that parent lineage plus its own immutable identity/content metadata.
4. T3 approval schema became v3 and stores `approvedLineageFingerprint`.
5. Applicability requires the candidate recursive lineage to match.

In the replay sequence, replay-R1 descends from R2 rather than from the original A0 path. Its lineage therefore differs from original R1. Replay-R2 inherits replay-R1's different lineage, so it cannot reconstruct original R2's lineage even when all previous schema-v2 fields are restored.

## Required regression

The focused regression explicitly creates:

```text
A0 -> R1 -> R2 approved -> replay R1 -> replay R2
```

It verifies that replay R2 matches all former schema-v2 binding dimensions while still having a different recursive lineage and therefore evaluates as:

`NOT_APPLICABLE_TO_REVISION`

Test name:

`multi-hop revisionId replay cannot reconstruct an approved revision`

Result:

- exact-head CI #239: **PASS**
- exact-main CI #240: **PASS**

## Other verified semantics

Focused tests also cover:

- immutable approval/applicability vocabulary;
- strict full corrected-revision binding;
- explicit approval of a valid automatic revision;
- exact applicability without mutation;
- later correction making old approval non-applicable;
- identical-content new revision not inheriting approval;
- one-hop ancestor ID reuse not reviving approval;
- cross-source non-applicability;
- forged/mismatched revision ID, parent, timestamp, content or lineage binding;
- caller-owned IDs/timestamps;
- invalid/injected revision rejection;
- mutable/extra/symbol/hidden/accessor approval rejection;
- unsupported schema/state/kind/binding values;
- fail-closed evaluator inputs;
- absence of quality, authorization or sharing claims.

## Final CI evidence

PR #95 final head:

`77f5035a85dfd6895490198d2160107b28479320`

Exact-head CI #239:

- **1154 / 1154 tests PASS**
- **232 suites**
- 0 failed/skipped/cancelled
- audit: **0 vulnerabilities**
- production build: **PASS**

Protected-main merge:

`c57966598d2d6fe34418119670bea42a9cdcf369`

Exact-main CI #240:

- **1154 / 1154 tests PASS**
- **232 suites**
- 0 failed/skipped/cancelled
- audit: **0 vulnerabilities**
- production build: **PASS**
- recursive lineage regression PASS
- multi-hop approval replay regression PASS
- existing OMR/Audiveris regressions PASS
- Render Blueprint and Dockerfile security regressions PASS

## Quality and sharing boundary

Teacher approval and quality safety remain independent.

T3 does **not**:

- convert quality-gate `ACCEPT` into teacher approval;
- make approval override structural/quality safety;
- return `safeToShare`, `shareAllowed` or authorization claims;
- activate Package 12 student sharing.

Package 12 must later require both the appropriate safety/quality evidence and exact teacher approval for the exact revision being shared.

## Protected boundaries

T3 did not modify:

- `backend/`;
- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection;
- dependencies;
- CI workflows;
- teacher UI.

## Explicitly deferred

- **8-T4 — NEXT:** lossless undo/version history
- **8-T5:** optimistic concurrency / stale-base conflict
- **8-T6:** accessible teacher UI
- **8B:** Audiveris training dataset
- **Package 12:** teacher-to-student sharing
- authentication/authorization implementation

T3 is therefore **Completed**, while parent Package 8 remains **Partially implemented** until the remaining required stages and parent acceptance criteria are closed.
