# Package 8-T3 Closure — Exact-Revision Teacher Approval Binding

Date: 2026-08-28  
Status: **Completed / protected-main verified**

## Scope closed

Package 8-T3 adds only the exact-revision teacher approval domain boundary above the already verified T1 revision model and T2 correction operations.

Implemented production module:

- `src/services/teacherApprovalModel.js`

Focused regression module:

- `tests/teacherApprovalModel.test.js`

Contract document:

- `docs/package-8-t3-approval-binding.md`

## Verified behavior

T3 verifies that:

1. teacher approval is a separate immutable record, never a mutable revision flag;
2. approval binds to exact `sourceId`, root `sourceRevisionId`, exact revision ID and exact content fingerprint;
3. the exact valid bound revision evaluates as `APPROVED_EXACT_REVISION`;
4. a later/new revision evaluates as `NOT_APPLICABLE_TO_REVISION` under the old approval;
5. identical content/fingerprint on a new revision does not transfer approval because revision identity must also match;
6. cross-source records cannot reuse an approval;
7. historical approval evidence is not mutated or deleted when it no longer applies to a candidate revision;
8. caller supplies approval/actor identity and optional timestamp; no identity/time is generated;
9. mutable, injected, malformed, hidden, symbol or accessor approval/revision evidence fails closed;
10. approval does not imply quality-gate acceptance, authentication/authorization or student-sharing permission.

## Pull request evidence

PR: **#91 — Package 8-T3: bind teacher approval to exact revision**

- base at PR creation: `c426325af2ddeca9ae2341449f365f3667aaa3f0`
- final accepted feature head: `d1805c054e490e71e3d266471ad158defbcd49e1`
- changed files: 3
  - `src/services/teacherApprovalModel.js`
  - `tests/teacherApprovalModel.test.js`
  - `docs/package-8-t3-approval-binding.md`
- review threads before merge: none
- branch was 0 commits behind `main` at merge gate
- merge used expected-head SHA protection

## Exact-head CI

Required workflow on final PR head/merge candidate:

- workflow: `CI`
- run: **#233**
- run ID: `33164496653`
- job ID: `98826560680`
- result: **SUCCESS**

Verified result:

- 1150 tests
- 232 suites
- 1150 pass
- 0 fail
- 0 cancelled
- 0 skipped
- dependency audit: 0 vulnerabilities
- production build: PASS
- Vite 8.2.0
- 55 modules transformed
- all 14 Package 8-T3 focused tests PASS

## Protected-main merge

PR #91 was squash-merged with final expected head `d1805c054e490e71e3d266471ad158defbcd49e1`.

Protected-main implementation commit:

`70a02589206eeea9c3defec4d5f544e9222cbe3a`

`main` remained protected with required status check `test-and-build`.

## Exact-main CI

Direct push workflow for the exact merged main SHA:

- workflow: `CI`
- run: **#234**
- run ID: `33164575331`
- job ID: `98826810765`
- head branch: `main`
- head SHA: `70a02589206eeea9c3defec4d5f544e9222cbe3a`
- result: **SUCCESS**

Verified result:

- exact SHA checkout confirmed
- 119 packages installed
- 120 packages audited
- 0 vulnerabilities
- 1150 tests / 232 suites
- 1150 pass
- 0 fail / cancelled / skipped
- all T1/T2/T3 tests PASS
- production Vite build PASS
- 55 modules transformed
- existing Audiveris/OMR regression tests PASS
- Render Blueprint tests PASS
- Dockerfile security tests PASS

The GitHub Actions warning that `actions/checkout@v4` and `actions/setup-node@v4` target the deprecated Node 20 action runtime while the runner forces Node 24 is informational and did not fail CI.

## No-touch verification

T3 did not change:

- `backend/`;
- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- Render service/deployment connection;
- dependencies;
- CI workflows;
- student sharing.

## Package status after closure

- Package 0–7: Completed
- Package 8: **Partially implemented**
- Package 8-T1: Completed
- Package 8-T2: Completed
- Package 8-T3: **Completed**
- Package 8-T4: **Not started / NEXT — undo/version history**
- Package 8-T5: Not started
- Package 8-T6: Not started
- Package 8B: Not started and separate

T3 closure does not authorize T4 implementation by itself. T4 requires a new fresh-read and the same protected branch/PR/CI process.
