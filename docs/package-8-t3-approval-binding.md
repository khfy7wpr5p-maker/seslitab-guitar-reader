# Package 8-T3 — Exact-Revision Teacher Approval Binding

Status: **Completed and protected-main verified after review hardening.**

Initial T3 main: `70a02589206eeea9c3defec4d5f544e9222cbe3a`  
Final review-hardened T3 main: `95f11139929d1e3d65bd6c295794c316bb04ca84`

## Purpose

Package 8-T3 records explicit teacher approval as a separate immutable domain record bound to one exact Package 8-T1 revision.

Teacher approval records which version was approved. A later/new revision does not inherit the old approval automatically, and historical approval evidence is not mutated or deleted merely because it does not apply to a later revision.

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

## Why schema v2 is required

The initial v1 implementation bound approval to:

- `sourceId`
- root `sourceRevisionId`
- `revisionId`
- `contentFingerprint`

PR #91 and CI #233/#234 verified that implementation, but docs closure PR #92 review found a valid P1: T1 does not globally prevent reuse of every intermediate ancestor `revisionId`. Therefore a later correction could reuse an older intermediate ID and restore the older content, recreating the four v1 values and reviving an old approval incorrectly.

PR #92 was closed unmerged. PR #93 hardened T3 to schema v2.

## Final approval record

The v2 approval record contains exactly:

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

`actorId` is audit evidence only. T3 does not authenticate or authorize that identity.

## Exact-revision applicability

Approval applies only when all seven immutable revision-binding dimensions match a valid candidate revision:

1. `sourceId`
2. root `sourceRevisionId`
3. exact `revisionId`
4. exact `revisionKind`
5. exact `parentRevisionId`
6. exact revision `createdAt`
7. exact `contentFingerprint`

Any mismatch returns `NOT_APPLICABLE_TO_REVISION`.

The review regression is explicitly tested:

```text
A0 -> R1 (approved) -> R2 -> later R1 id reused + old R1 content + old R1 timestamp
```

The later record still has a different parent lineage, so the old R1 approval remains non-applicable to the later record. The original R1 remains `APPROVED_EXACT_REVISION`.

## Automatic versus corrected revisions

T3 may explicitly approve any valid immutable T1 revision, including a reviewed automatic revision. Automatic approval requires `approvedParentRevisionId = null`; corrected approval preserves its exact non-null parent revision ID.

## Quality, authorization and sharing boundary

Teacher approval and quality safety remain separate.

T3 does **not**:

- turn quality-gate `ACCEPT` into teacher approval;
- let approval override structural/quality safety;
- authenticate or authorize `actorId`;
- return `safeToShare` / `shareAllowed`;
- activate Package 12 student sharing;
- add backend persistence/history/concurrency/UI behavior.

## Fingerprint meaning

`contentFingerprint` is the deterministic T1 drift/version token. It is not a cryptographic signature or authorization credential. Schema v2 therefore combines fingerprint with immutable revision metadata and lineage rather than treating fingerprint plus reusable ID as a globally unique revision identity.

## Fail-closed rules

T3 rejects or refuses to recognize:

- invalid/mutable T1 revisions;
- revision records with injected approval fields;
- missing/blank approval or actor identity;
- malformed approval/revision timestamps;
- mutable approval records;
- extra, hidden, symbol or accessor fields;
- unsupported schema/state/revision-kind values;
- malformed automatic/corrected parent binding;
- blank source/revision/fingerprint binding fields.

Applicability evaluation throws for invalid approval/revision inputs rather than treating invalid evidence as normal non-applicability.

## Verified tests

The final hardened T3 has **15 focused tests**, including:

- immutable approval/applicability vocabulary;
- full exact corrected-revision binding;
- automatic-revision approval;
- exact applicability without mutation;
- later correction invalidating applicability;
- same-content new revision not inheriting approval;
- **ancestor revision-ID reuse + restored content/timestamp cannot revive old approval**;
- cross-source isolation;
- revision ID / parent lineage / revision timestamp / fingerprint mismatch;
- caller-owned identities/timestamps;
- invalid/injected revision rejection;
- strict frozen record descriptors/field set;
- unsupported schema/state/revision-kind/binding values;
- fail-closed evaluator inputs;
- absence of quality/authorization/sharing claims.

## Closure evidence

Initial implementation:

- PR #91 final head: `d1805c054e490e71e3d266471ad158defbcd49e1`
- exact-head CI #233 / run `33164496653`, job `98826560680`: SUCCESS
- initial protected-main merge: `70a02589206eeea9c3defec4d5f544e9222cbe3a`
- exact-main CI #234 / run `33164575331`, job `98826810765`: SUCCESS

Review hardening:

- superseded docs PR #92: closed unmerged after P1 discovery
- hardening PR #93 final head: `ee215d3c1d53e2bb7a7323387c02a79223643e46`
- exact-head CI #236 / run `33165415557`, job `98829539401`: SUCCESS
- final protected-main merge: `95f11139929d1e3d65bd6c295794c316bb04ca84`
- exact-main CI #237 / run `33165513082`, job `98829856646`: SUCCESS
- final result: **1151/1151 tests PASS; 232 suites; 0 fail/skipped/cancelled**
- dependency audit: **0 vulnerabilities**
- production Vite build: **PASS**
- existing Audiveris/OMR, Render Blueprint and Dockerfile security regressions: **PASS**

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

## Next / explicitly deferred

- **8-T4 — NEXT but Not started:** lossless undo/version history
- **8-T5:** optimistic concurrency/stale-base conflict
- **8-T6:** accessible teacher UI
- **8B:** Audiveris training dataset
- **12:** teacher-to-student sharing
- authentication/authorization implementation

Package 8 remains **Partially implemented**.
