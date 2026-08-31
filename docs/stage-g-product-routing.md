# Stage G — PASS / REVIEW / BLOCK Product Routing

Date: 2026-08-31

## Purpose

Stage G does not create a new quality engine. It maps the existing Package 2D exact-consumer quality-gate decisions into product routing states.

Flow:

`exact canonical NoteObject[] -> existing consumer gate -> PASS / REVIEW / BLOCK product route`

Supported Stage G consumers:

- TTS
- playback
- Guitar TAB
- violin

## Mapping

- `ACCEPT -> PASS` — product copy: **Otomatik kontrollerden geçti**. Only an exact consumer gate that explicitly authorizes `allowed`, `definitive`, and `automaticAllowed` may become PASS.
- `REVIEW -> REVIEW` — product copy: **İnceleme gerekiyor**. Teacher review is required; no definitive/automatic consumer authorization is created.
- `BLOCK/invalid/unknown -> BLOCK` — product copy: **Kullanım engellendi**. No definitive consumer authorization is created.

The aggregate score route uses the strictest state among the requested existing consumer gates: `BLOCK > REVIEW > PASS`.

A malformed `ACCEPT` result is fail-closed. Stage G must not infer automatic or definitive permission from the decision label alone if the exact gate permission flags do not explicitly allow it.

## Authority boundaries

Stage G never claims or creates:

- teacher approval;
- Package 12 share authorization;
- Package 12 share-quality eligibility;
- student delivery authorization;
- source verification beyond the existing gate result;
- musical correction or canonical data;
- renderer semantic authority.

Therefore every Stage G route explicitly keeps `teacherApproved`, `shareAuthorized`, and `studentDeliveryAuthorized` false.

`Auto-Pass != teacher-approved` remains an invariant.

## Fail-closed behavior

Stage G returns BLOCK when:

- the canonical note array is missing/invalid;
- the requested consumer is outside the bounded Stage G consumer set;
- the underlying quality-gate resolver throws or fails;
- a gate result is absent or does not contain an ACCEPT/REVIEW decision;
- an ACCEPT decision does not explicitly authorize the exact consumer for allowed, definitive, and automatic use.

Stage G cannot upgrade REVIEW/BLOCK and cannot bypass a consumer-specific quality gate.

## Package 12 isolation

Package 12 T2/T3/T4 and teacher-to-student authorization contracts are unchanged. Stage G product PASS is not sharing eligibility and cannot activate student delivery.

## Verification

Required before completion:

- Stage G focused routing regressions;
- full repository test suite;
- production build;
- existing real Chrome runtime proof;
- protected PR CI;
- exact-main CI after merge.
