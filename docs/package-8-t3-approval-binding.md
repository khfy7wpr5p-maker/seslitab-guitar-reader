# Package 8-T3 — Exact-Revision Teacher Approval Binding

Status: **Completed and protected-main verified.**

Implementation baseline: `c426325af2ddeca9ae2341449f365f3667aaa3f0`.  
Final feature head: `d1805c054e490e71e3d266471ad158defbcd49e1`.  
Protected-main implementation merge: `70a02589206eeea9c3defec4d5f544e9222cbe3a`.

## Purpose

Package 8-T3 records an explicit teacher approval as a separate immutable domain record bound to one exact Package 8-T1 revision.

The project source rule is preserved directly: teacher approval records which version was approved, and a later data change makes that previous approval non-applicable to the changed/new version.

T3 therefore does not add a mutable `teacherApproved` flag to revision content. Historical approval evidence stays immutable; applicability is evaluated against the candidate revision.

## Public contract

`src/services/teacherApprovalModel.js` exports:

- `TEACHER_APPROVAL_SCHEMA_VERSION = 1`
- `TEACHER_APPROVAL_STATE = "teacher_approved"`
- immutable `TEACHER_APPROVAL_APPLICABILITY`
  - `APPROVED_EXACT_REVISION`
  - `NOT_APPLICABLE_TO_REVISION`
- `createTeacherApprovalRecord(...)`
- `isTeacherApprovalRecord(...)`
- `evaluateTeacherApprovalForRevision(...)`

## Approval record

An approval record contains exactly:

- schema version;
- approval state;
- caller-supplied `approvalId`;
- caller-supplied `actorId`;
- exact `sourceId`;
- exact root `sourceRevisionId`;
- exact `approvedRevisionId`;
- exact `approvedContentFingerprint`;
- caller-supplied/null `createdAt`.

The record is frozen, flat and has no mutable nested data.

`actorId` is audit evidence supplied by the caller. T3 does not authenticate or authorize that identity.

## Exact-revision applicability

An approval applies only when all four binding dimensions match a valid candidate revision:

1. `sourceId`
2. root `sourceRevisionId`
3. exact `revisionId`
4. exact `contentFingerprint`

If any dimension differs, the result is `NOT_APPLICABLE_TO_REVISION`.

A later corrected revision therefore does not inherit approval even if:

- it belongs to the same source;
- it descends from the approved revision; or
- its content happens to produce the same fingerprint.

The historical approval record is not mutated or deleted. This preserves lossless history for T4 while satisfying the rule that approval does not carry into changed/new revision data.

## Automatic versus corrected revisions

T3 may explicitly approve any valid immutable T1 revision, including an automatic revision that a teacher reviewed without needing a correction. The project rule requires approval to identify **which version** was approved; it does not require a correction to exist before approval.

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

`contentFingerprint` remains the deterministic T1 drift/version token. It is not a cryptographic signature, actor authentication mechanism or authorization credential.

A syntactically valid caller-constructed approval record with a different fingerprint is therefore structurally recognizable but does not apply to the real revision.

## Fail-closed rules

T3 rejects or refuses to recognize:

- invalid/mutable T1 revisions;
- revision records with injected approval fields;
- missing/blank approval or actor identity;
- malformed timestamps;
- mutable approval records;
- extra, hidden, symbol or accessor fields;
- unsupported schema/state values;
- blank source/revision/fingerprint binding fields.

Applicability evaluation throws for invalid approval/revision inputs rather than treating invalid evidence as a normal non-applicable record.

## Verified tests

Focused tests cover and pass:

- immutable approval/applicability vocabulary;
- exact binding to corrected revision;
- explicit approval of a valid automatic revision;
- exact applicability without mutation;
- later correction invalidating applicability;
- new revision with identical content not inheriting approval;
- cross-source non-applicability;
- revision-ID and fingerprint mismatch;
- caller-owned IDs/timestamps;
- invalid/injected revision rejection;
- strict frozen record descriptors and field set;
- unsupported state/schema/binding values;
- fail-closed evaluator inputs;
- absence of quality/authorization/sharing claims.

## Closure evidence

- PR: **#91 — Package 8-T3: bind teacher approval to exact revision**
- final PR head: `d1805c054e490e71e3d266471ad158defbcd49e1`
- exact-head CI: **#233 / run `33164496653`, job `98826560680` — SUCCESS**
- review threads at merge gate: **none**
- protected-main squash merge: `70a02589206eeea9c3defec4d5f544e9222cbe3a`
- exact-main CI: **#234 / run `33164575331`, job `98826810765` — SUCCESS**
- exact-main result: **1150/1150 tests PASS; 232 suites; 0 fail/skipped/cancelled**
- dependency audit: **0 vulnerabilities**
- production build: **PASS**
- Vite 8.2.0; 55 modules transformed

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
- CI workflows.

Existing Audiveris/OMR, Render Blueprint and Dockerfile security regressions passed on exact-main CI #234.

## Explicitly deferred / next

- **8-T4 — NEXT:** undo/version-history storage
- **8-T5:** optimistic concurrency/stale-base conflict
- **8-T6:** accessible teacher UI
- **8B:** Audiveris training dataset
- **12:** teacher-to-student sharing
- authentication/authorization implementation

Package 8 remains **Partially implemented** until its remaining required stages are verified.
