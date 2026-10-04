# SES-170 Student Work Request Queue Implementation Plan

## Goal

Create a separate, teacher-controlled pending work-request authority for Student `Eser İste`. It must not reuse `public_pool` or `/student/pool`, and a student request must not create an ACTIVE Piece automatically.

## Guardrails

- Branch from exact verified `main` SHA `9949abb0d03212998935927005b3e4b7568ba828`.
- Preserve current Render service/domain, offline behavior, VoiceOver surfaces, OMR/rendering paths and existing `public_pool` behavior.
- Teacher owns every transition out of PENDING.
- Removal is one-way revoke/recall; no hard delete or unrevoke.
- Request-to-Piece conversion acknowledgement is idempotent and fail closed: it may advance only when the referenced Piece already exists and belongs to the same student.
- Direct target is bounded to ACTIVE or REPERTOIRE; SES-170 defines the queue contract/foundation, while SES-155/156 consume it for teacher management/API/UI.
- Do not expose provider subjects, emails, auth tokens or raw diagnostics in response DTOs.

## Red-Green Sequence

1. Add focused tests for the request record contract and in-memory store behavior. Verify CI fails because SES-170 modules/methods do not exist.
2. Add `studentWorkRequestRecord` domain contract with PENDING, CONVERTED and REVOKED lifecycle rules.
3. Extend Secure Delivery stores with separate work-request persistence and active-grant lookup for a student. Keep `poolPublications` untouched.
4. Add `studentWorkRequestService`:
   - student creates request;
   - server derives exactly one active teacher grant or fails closed;
   - teacher lists own pending requests;
   - teacher may revoke a pending request;
   - conversion acknowledgement requires an existing same-student Piece and is idempotent for the same target/reference.
5. Wire composition/router under separate `/student/work-requests` and `/teacher/work-requests` surfaces. Do not change `/student/pool`.
6. Add browser API client methods without rendering new UI in SES-170.
7. Run focused tests, full `npm test`, build, CI, Regression Quality and Sonar. Open PR only after fresh evidence is green.

## Acceptance

- Student request is persisted independently of public pool.
- No Piece is created by student request creation.
- Teacher sees only requests within teacher authority.
- Wrong-role, missing/ambiguous grant and cross-student conversion attempts fail closed.
- Repeating the same conversion acknowledgement returns the same terminal result; conflicting second transition fails.
- Revoked requests cannot be converted or restored.
- Existing `/student/pool` contract and tests remain unchanged.
