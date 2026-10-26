# SES-189 — Request-Bound Composer Authority Bridge

Date: 2026-10-04
Status: Design approved; implementation not started
Parent: SES-156
Related: SES-154, SES-155, SES-170

## Problem

SES-170 pending Havuz read model intentionally exposes only a bounded action key, title, display name, and request state. It does not expose `studentId`, provider identity, email, or SCORE/CHORD child authority to the browser.

SES-155 conversion authority intentionally requires a real Piece with at least one supported SCORE/CHORD child and revalidates same-student Piece evidence before acknowledging a work-request conversion.

The existing Assignment Composer can already:

- authorize recipients through the teacher roster,
- prepare real SCORE/CHORD assignments,
- deliver those assignments,
- create a Piece from exact delivered child assignment IDs.

The missing link is a safe binding from a selected Havuz request to the exact composer recipient and resulting Piece evidence without guessing by display name or leaking internal identity.

## Decision

Introduce a server-owned **request-bound composer authority**.

The browser will never derive the recipient from `displayNameOrNickname`, never receive request `studentId`, and never invent Piece/content evidence.

Canonical flow:

```text
Havuz actionKey
  -> server resolves owned pending request
  -> server verifies current teacher + active roster authority
  -> bounded request-bound composer authority
  -> existing Assignment Composer prepares real SCORE/CHORD content
  -> exact student delivery
  -> exact Piece creation from delivered child assignment IDs
  -> optional server-side PLACE_IN_REPERTOIRE via SES-154
  -> exact request acknowledgement using Piece evidence
```

## Browser contract

The browser may submit only:

- request `actionKey`,
- target `ACTIVE` or `REPERTOIRE`,
- normal prepared composer content (SCORE upload and/or CHORD snapshots),
- title and teacher note fields already supported by the composer.

The browser must not receive or submit as authority:

- request `studentId`,
- teacher/provider subject,
- email,
- raw grant IDs,
- raw persistence keys,
- guessed child assignment IDs,
- guessed Piece IDs,
- tokens.

## Server responsibilities

The server must:

1. Resolve `actionKey` to the exact work request.
2. Verify the request belongs to the current teacher.
3. Verify the request is still `PENDING` unless handling a safe idempotent retry.
4. Verify the request student is still in the current teacher's active roster authority.
5. Lock composer recipient authority to that server-resolved student.
6. Create and deliver real SCORE/CHORD child assignments for that exact student.
7. Create a real Piece from exact delivered child assignment IDs.
8. For `REPERTOIRE`, apply SES-154 server-side lifecycle authority.
9. Revalidate exact Piece/lifecycle evidence.
10. Acknowledge the same request as `CONVERTED` using SES-155/170 evidence rules.

## Idempotency

Business idempotency is explicit and must not rely only on Firestore SDK retries.

For the same request + target + deterministic composer draft/content identity:

- repeated delivery must not create duplicate child assignments,
- repeated conversion must not create a second Piece,
- repeated acknowledgement of the same exact Piece/target may return the existing result,
- a retry with a different Piece or target must fail closed with an idempotency conflict,
- `REVOKED` or otherwise incompatible terminal state must fail closed.

Existing deterministic ID patterns in `teacherAssignmentComposerService.js` should be preserved where possible. The browser must not generate a fake Piece as a workaround.

## Transaction ordering

Firestore transaction reads must happen before writes.

Authoritative transaction read phase should include the records needed to prove the transition, including as applicable:

- current request snapshot,
- current teacher/student authority snapshot,
- current Piece/lifecycle evidence snapshot.

Only after validation should the transition/acknowledgement write occur.

The Firestore SDK may retry transactions under contention, but correctness still depends on application-level idempotency and exact-state checks.

## Direct Repertoire

`Havuz -> Doğrudan Repertuara Al` must not perform a browser-side lifecycle cascade.

Server sequence:

1. create the real Piece,
2. apply SES-154 `PLACE_IN_REPERTOIRE`,
3. verify lifecycle state is `REPERTOIRE` and non-revoked,
4. acknowledge the request with `targetState=REPERTOIRE`.

## Fail-closed cases

The operation must stop without guessing when:

- request does not exist,
- request belongs to another teacher,
- request student is no longer under active roster authority,
- two students share the same display name,
- SCORE/CHORD evidence is missing,
- child evidence belongs to another student,
- Piece evidence belongs to another student,
- lifecycle target does not match,
- concurrent terminal state changed,
- the browser submits invented recipient/content evidence.

Display name is presentation only, never identity.

## Existing seams in scope

Likely production seams:

- `backend/delivery/services/studentWorkRequestService.js`
- `backend/delivery/services/teacherPieceManagementService.js`
- `backend/delivery/firebase/firestoreStudentWorkRequestStore.js`
- secure-delivery HTTP router/client boundary
- `src/services/teacherAssignmentComposerService.js`
- SES-156 workspace integration only after the bridge is complete

The existing composer remains the single content preparation/delivery engine. SES-189 must not introduce a parallel assignment engine.

## TDD acceptance matrix

1. Duplicate display names cannot cause a recipient mix-up.
2. Wrong-teacher request fails closed.
3. Request student removed from active roster fails closed.
4. SCORE-only Havuz -> Aktif creates exactly one same-student Piece.
5. CHORD-only Havuz -> Aktif creates exactly one same-student Piece.
6. SCORE+CHORD Piece contains all exact delivered child refs.
7. Havuz -> Repertuar creates one Piece, performs server-side repertoire lifecycle, and acknowledges exact evidence.
8. Retry creates no duplicate child assignments or Piece.
9. Retry with a different target fails with conflict and creates nothing new.
10. Browser-invented recipient/content evidence is rejected.
11. Existing SES-154/155/170 tests remain green.
12. Existing Assignment Composer, VoiceOver, and consecutive-send regressions remain green.
13. Full CI, Regression, Security, and exact-SHA qualification must pass before completion.

## Non-goals

- changing `public_pool`,
- hard delete or unrevoke,
- exposing internal IDs in normal UI,
- introducing a new persistence domain,
- changing OMR/Audiveris/Render behavior,
- redesigning SES-156 management cache/performance behavior.

## Integration order

1. Implement and verify SES-189 independently.
2. Obtain separate merge approval for SES-189.
3. Refresh/rebase SES-156 from current `main` after SES-189 merge.
4. Enable the currently disabled `Aktife Al` and `Doğrudan Repertuara Al` actions by binding them to the SES-189 bridge.
5. Re-run SES-156 full verification.
6. Obtain separate SES-156 merge approval.

## Completion gate

SES-189 is complete only with fresh evidence for:

- exact same-student binding,
- duplicate-name isolation,
- idempotent retry,
- direct repertoire server-side lifecycle,
- wrong-teacher/mismatch fail-closed behavior,
- full regression and CI health.

Merge and deploy remain separate user approvals.
