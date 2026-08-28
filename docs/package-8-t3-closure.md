# Package 8-T3 Final Closure — Exact-Revision Teacher Approval Binding

Date: 2026-08-28  
Status: **Completed / review-hardened / protected-main verified**

## Final closed scope

Package 8-T3 adds only a separate immutable teacher-approval domain record and exact-revision applicability evaluation above T1 revisions and T2 correction operations.

Production module:

- `src/services/teacherApprovalModel.js`

Focused regression module:

- `tests/teacherApprovalModel.test.js`

Contract:

- `docs/package-8-t3-approval-binding.md`

No persistence, T4 history, T5 concurrency, T6 UI, authentication/authorization, student sharing, OMR/Audiveris or deployment behavior is part of T3.

## Initial implementation and closure review

PR #91 introduced the initial T3 approval record.

- head: `d1805c054e490e71e3d266471ad158defbcd49e1`
- exact-head CI #233 / run `33164496653`, job `98826560680`: SUCCESS
- protected-main merge: `70a02589206eeea9c3defec4d5f544e9222cbe3a`
- exact-main CI #234 / run `33164575331`, job `98826810765`: SUCCESS
- 1150/1150 tests; 232 suites; 0 vulnerabilities; build PASS

A documentation closure was then attempted in PR #92. Its first CI #235 attempt had a single transient API DELETE-job 502; the same exact head rerun passed 1150/1150 tests and build without code changes.

More importantly, PR #92 review found a valid **P1 approval-safety gap** before formal T3 closure. The initial approval binding used only:

- source ID;
- root source revision ID;
- revision ID;
- content fingerprint.

T1 does not guarantee global uniqueness of every intermediate historical revision ID. Therefore this sequence could reproduce all four values:

```text
A0 -> R1 approved -> R2 -> later R1 id reused + old R1 content restored
```

The old approval could then appear applicable to a later revision. PR #92 was closed without merge and is explicitly superseded.

## Review hardening — PR #93

PR #93 upgraded T3 to approval schema **v2**.

Final approval applicability binds to:

1. `sourceId`
2. root `sourceRevisionId`
3. exact `revisionId`
4. exact `revisionKind`
5. exact `parentRevisionId`
6. exact revision `createdAt`
7. exact `contentFingerprint`

A regression constructs the full ancestor-ID reuse attack, deliberately restoring old content and old timestamp. The later record remains `NOT_APPLICABLE_TO_REVISION` because its parent lineage differs. The original approved revision remains `APPROVED_EXACT_REVISION`.

PR #93 evidence:

- final head: `ee215d3c1d53e2bb7a7323387c02a79223643e46`
- branch was 0 behind main at merge gate
- changed files: approval service, T3 tests, T3 contract only
- review threads: none at merge gate
- exact-head CI #236 / run `33165415557`, job `98829539401`: **SUCCESS**
- exact-head result: **1151/1151 tests; 232 suites; 0 fail/skipped/cancelled; 0 vulnerabilities; build PASS**
- all 15 T3 focused tests PASS

PR #93 was squash-merged using expected-head SHA protection.

Final hardened protected main:

`95f11139929d1e3d65bd6c295794c316bb04ca84`

## Final exact-main CI

Exact-main CI #237:

- run ID: `33165513082`
- job ID: `98829856646`
- head branch: `main`
- head SHA: `95f11139929d1e3d65bd6c295794c316bb04ca84`
- conclusion: **SUCCESS**

Verified:

- exact SHA checkout confirmed;
- 119 packages installed / 120 audited;
- **0 vulnerabilities**;
- **1151 tests / 232 suites / 1151 pass**;
- 0 fail / cancelled / skipped;
- all T1/T2/T3 tests PASS;
- ancestor-revision-ID reuse regression PASS;
- Vite 8.2.0 production build PASS;
- 55 modules transformed;
- Audiveris/OMR regressions PASS;
- Render Blueprint regressions PASS;
- Dockerfile security regressions PASS.

The GitHub Actions Node 20 action-runtime deprecation warning is informational; the workflow runner uses Node 24 and the job succeeds.

## Final T3 invariants

1. Approval is a separate immutable record, not a revision flag.
2. Approval applies only to the full exact immutable revision identity/lineage/fingerprint represented by schema v2.
3. A later revision does not inherit approval by reusing an old ID/content/timestamp.
4. Historical approval evidence is not mutated or deleted.
5. Quality-gate `ACCEPT` is not teacher approval.
6. Approval is not authentication/authorization or sharing permission.
7. T3 does not change persistence/history/concurrency/UI behavior.

## No-touch verification

T3 and its hardening did not modify:

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

## Package status after T3

- Package 0–7: Completed
- Package 8: **Partially implemented**
- Package 8-T1: Completed
- Package 8-T2: Completed
- Package 8-T3: **Completed after review hardening**
- Package 8-T4: **Not started / NEXT — lossless undo/version history**
- Package 8-T5: Not started
- Package 8-T6: Not started
- Package 8B: Not started and separate

This closure does **not** begin Package 8-T4.
