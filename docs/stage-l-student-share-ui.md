# Stage L — Student / Share UI (Bounded Readiness)

Status: implementation branch; merge requires CI/review closure and explicit user approval.

## Purpose

Stage L exposes the already-reviewed Package 12 teacher-to-student sharing contracts in the teacher product flow without pretending that SesliTab already has authenticated student delivery.

The bounded product action is:

**“Bu öğrenci için paylaşım izni oluştur ve uygunluğu kontrol et”**

This creates in-memory exact-revision authorization evidence for a caller-entered recipient label and evaluates the current exact revision against Package 12. It does **not** send the score.

## Security/product invariant

`READY_EXACT_REVISION != DELIVERED_TO_STUDENT`

A Stage L readiness result never means:

- an authenticated student account exists;
- the recipient label was identity-verified;
- the score was uploaded or transmitted;
- a public/private URL was created;
- a token, invite code or access grant was persisted;
- a student can open the score remotely.

Stage L therefore exposes `deliveryState = not_implemented` and `deliveryAllowed = false` even when Package 12 readiness is eligible.

## Existing authority reused unchanged

Stage L does not introduce a second sharing/safety authority. It composes:

1. **Package 8 exact-revision approval** — the current immutable revision must have an applicable teacher approval.
2. **Package 12-T1** — explicit exact revision + exact approval + recipient-label share authorization.
3. **Package 12-T2** — live exact automatic-source quality/provenance eligibility.
4. **Package 12-T3** — bounded pitch/position corrected-revision revalidation.
5. **Package 12-T4** — bounded structural/rhythmic corrected-revision revalidation, including its already-reviewed undo/history scope.

The Package 12 services are not modified by Stage L.

## Routing

### Automatic current revision

Exact approval
→ T1 authorization
→ live T2 exact-source quality evidence
→ T2 eligibility
→ `READY_EXACT_REVISION` only if T2 is eligible.

### Teacher-corrected current revision

Exact approval
→ T1 authorization
→ live root T2 evidence
→ T3 corrected revalidation where its bounded scope applies
→ otherwise T4 structural/rhythmic revalidation where its bounded scope applies
→ `READY_EXACT_REVISION` only when the applicable existing Package 12 evaluator is eligible.

Unsupported or unsafe corrected scopes fail closed.

## Readiness states

Stage L uses product-local readiness metadata:

- `ready_exact_revision`
- `approval_required`
- `source_quality_not_eligible`
- `corrected_revalidation_not_eligible`
- `unsupported_revision`

It also records which existing Package 12 route produced the result:

- `package12_t2`
- `package12_t3`
- `package12_t4`
- `none`

These are presentation/orchestration states only. They do not replace Package 12 status vocabularies.

## Stale result handling

Readiness evidence is bound to the exact current revision and exact source evidence. The UI clears its previous readiness result when teacher/source state changes, including:

- new teacher workspace;
- correction;
- approval change;
- undo;
- workspace refresh;
- reset;
- Package 3 exact source-note array replacement.

The service itself also replays the current Package 12 evidence, so stale source quality or stale corrected-state evidence fails closed.

## Accessibility

The Stage L teacher panel provides:

- native label/input/button controls;
- live status/alert feedback;
- visible focus;
- at least 44px input/button targets;
- mobile-width-safe controls at `<=640px`;
- explicit visible text that no student delivery occurs.

Color is not used as the only readiness signal.

## Explicit non-goals / still blocked

Stage L does not add or change:

- authentication or identity verification;
- student accounts;
- authorization server/session security;
- database or persistent grants;
- payload/content materialization for students;
- URLs, links, tokens or invite codes;
- backend/API delivery endpoints;
- network sending, email or messaging;
- OMR/Audiveris/provider behavior;
- MusicXML/canonical musical semantics;
- Package 2D quality policy;
- Package 8 approval semantics;
- Package 12 domain semantics;
- renderer contracts;
- dependencies or deployment configuration.

**Actual authenticated student delivery remains BLOCKED and requires a separately reviewed application/security stage.**

## Validation gates

Before merge, Stage L requires:

- focused readiness regressions;
- existing Package 8/12 regression suite through full repository tests;
- production build;
- real Chrome Stage L presentation/no-delivery proof;
- narrow/mobile breakpoint proof;
- 44px control proof;
- protected-branch required `test-and-build` CI;
- zero unresolved review blockers;
- explicit merge approval.
