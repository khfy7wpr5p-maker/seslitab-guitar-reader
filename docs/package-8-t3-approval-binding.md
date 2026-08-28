# Package 8-T3 — Exact-Revision Teacher Approval Binding

Status: **Implementation candidate after review hardening; closure requires protected-main merge plus exact-main CI.**

Baseline: `c426325af2ddeca9ae2341449f365f3667aaa3f0`.  
Initial T3 merge requiring closure hardening: `70a02589206eeea9c3defec4d5f544e9222cbe3a`.

## Purpose

Package 8-T3 records an explicit teacher approval as a separate immutable domain record bound to one exact Package 8-T1 revision.

The project source rule is preserved directly: teacher approval records which version was approved, and a later data change makes that previous approval non-applicable to the changed/new version.

T3 therefore does not add a mutable `teacherApproved` flag to revision content. Historical approval evidence stays immutable; applicability is evaluated against the candidate revision.

## Public contract

`src/services/teacherApprovalModel.js` exports:

- `TEACHER_APPROVAL_SCHEMA_VERSION = 2`
- `TEACHER_APPROVAL_STATE = "teacher_approved"`
- immutable `TEACHER_APPROVAL_APPLICABILITY`
  - `APPROVED_EXACT_REVISION`
  - `NOT_APPLICABLE_TO_REVISION`
- `createTeacherApprovalRecord(...)`
- `isTeacherApprovalRecord(...)`
- `evaluateTeacherApprovalForRevision(...)`

Schema v2 is the review-hardened approval record. It supersedes the initial v1 four-dimension binding because v1 could not distinguish a later correction that reused an ancestor revision ID and restored the ancestor content.

## Approval record

An approval record contains exactly:

- schema version;
- approval state;
- caller-supplied `approvalId`;
- caller-supplied `actorId`;
- exact `sourceId`;
- exact root `sourceRevisionId`;
- exact `approvedRevisionId`;
- exact `approvedRevisionKind`;
- exact `approvedParentRevisionId`;
- exact `approvedRevisionCreatedAt`;
- exact `approvedContentFingerprint`;
- caller-supplied/null approval `createdAt`.

The record is frozen, flat and has no mutable nested data.

`actorId` is audit evidence supplied by the caller. T3 does not authenticate or authorize that identity.

## Exact-revision applicability

An approval applies only when all immutable revision binding dimensions match a valid candidate revision:

1. `sourceId`
2. root `sourceRevisionId`
3. exact `revisionId`
4. exact `revisionKind`
5. exact `parentRevisionId`
6. exact revision `createdAt`
7. exact `contentFingerprint`

If any dimension differs, the result is `NOT_APPLICABLE_TO_REVISION`.

This explicitly prevents the review regression:

```text
A0 -> R1 (approved) -> R2 -> later R1 id reused with R1 content restored
```

The later record has different parent lineage, so the historical R1 approval is not applicable even if source ID, root source revision ID, reused revision ID, timestamp and content fingerprint are deliberately made equal.

The historical approval record is not mutated or deleted. This preserves lossless history for T4 while satisfying the rule that approval does not carry into changed/new revision data.

## Automatic versus corrected revisions

T3 may explicitly approve any valid immutable T1 revision, including an automatic revision that a teacher reviewed without needing a correction. Automatic approvals require `approvedParentRevisionId = null`; corrected approvals preserve the exact non-null parent revision ID.

## Quality and sharing boundary

Teacher approval and quality safety remain separate.

T3 does **not**:

- turn quality-gate `ACCEPT` into teacher approval;
- make teacher approval override structural/quality safety;
- return a `safeToShare`, `shareAllowed`, authorization, or quality claim;
- activate student sharing.

`evaluateTeacherApprovalForRevision(...)` answers only whether this approval record applies to this exact revision.

Later Package 12 must separately require the appropriate quality/safety evidence and exact teacher approval before student sharing.

## Fingerprint meaning

`contentFingerprint` remains the deterministic T1 drift/version token. It is not a cryptographic signature, actor authentication mechanism or authorization credential. Schema v2 therefore binds fingerprint together with immutable lineage/record metadata rather than treating the fingerprint as a unique revision identity by itself.

## Fail-closed rules

T3 rejects or refuses to recognize:

- invalid/mutable T1 revisions;
- revision records with injected approval fields;
- missing/blank approval or actor identity;
- malformed approval or revision timestamps;
- mutable approval records;
- extra, hidden, symbol or accessor fields;
- unsupported schema/state/revision-kind values;
- malformed automatic/corrected parent binding;
- blank source/revision/fingerprint binding fields.

Applicability evaluation throws for invalid approval/revision inputs rather than treating invalid evidence as a normal non-applicable record.

## Tests

Focused tests cover:

- immutable approval/applicability vocabulary;
- full exact corrected-revision binding;
- explicit approval of a valid automatic revision;
- exact applicability without mutation;
- later correction invalidating applicability;
- new revision with identical content not inheriting approval;
- **ancestor revision-ID reuse + restored content cannot revive old approval**;
- cross-source non-applicability;
- revision-ID, parent-lineage, revision-timestamp and fingerprint mismatch;
- caller-owned IDs/timestamps;
- invalid/injected revision rejection;
- strict frozen record descriptors and field set;
- unsupported state/schema/revision-kind/binding values;
- fail-closed evaluator inputs;
- absence of quality/authorization/sharing claims.

Full repository regression and production build are mandatory before merge.

## Protected boundaries

T3 must not modify:

- `backend/`;
- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection;
- dependencies;
- CI workflows.

## Explicitly deferred

- **8-T4:** undo/version-history storage
- **8-T5:** optimistic concurrency/stale-base conflict
- **8-T6:** accessible teacher UI
- **8B:** Audiveris training dataset
- **12:** teacher-to-student sharing
- authentication/authorization implementation
