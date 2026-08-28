# SesliTab Current Status

Last documentation review: 2026-08-28  
Latest verified protected `main`: `70a02589206eeea9c3defec4d5f544e9222cbe3a`  
Latest exact-main CI: **#234 / `33164575331`, job `98826810765` — SUCCESS**  
Current package state: **Package 8 — Partially implemented; 8-T1, 8-T2 and 8-T3 Completed.**  
Next safe implementation stage: **Package 8-T4 — undo/version history.**

This file is a concise orientation document. Source code, tests, protected-main state and fresh GitHub Actions evidence remain authoritative.

## Verified current baseline

Exact-main CI #234 on `70a02589206eeea9c3defec4d5f544e9222cbe3a` verified:

- **1150 / 1150 tests PASS**
- **232 suites**
- **0 failed / skipped / cancelled**
- `npm ci`: 119 packages installed; 120 packages audited
- **0 vulnerabilities**
- Vite 8.2.0 production build **PASS**
- 55 modules transformed

`main` remains protected and the required status check is `test-and-build`.

## Verified product foundations

Packages 0–7 remain completed and provide the established foundations for:

- PDF upload and safe OMR job handling;
- the existing Cloud OMR Gateway and Audiveris provider/runtime path;
- file, multipart, API and MusicXML security;
- canonical `NoteObject` pitch/time/source-verification data;
- structural/rhythmic validation and quality/error reporting;
- fail-closed `ACCEPT` / `REVIEW` / `BLOCK` quality gates;
- isolated OMR benchmark/evidence framework;
- Turkish rhythmic text and Rhythmic HTML;
- Turkish TTS and Web Audio playback;
- canonical measure selection and selected-measure TTS/playback;
- deterministic SMF0 MIDI export;
- conservative quality-gated Basic Guitar TAB;
- conservative quality-gated Basic Violin first-position guidance;
- source-only MusicXML `<harmony>` parsing, chord presentation and Turkish chord TTS.

Structural validity, source verification, quality-gate acceptance and teacher approval remain separate concepts.

## Package 8 current state

### 8-T1 — immutable revision domain

Status: **Completed.**

T1 provides immutable automatic and teacher-corrected revisions, exact parent/root-source lineage, deterministic content fingerprints, strict frozen plain-data snapshots and fail-closed revision validation. Approval fields cannot be injected into a valid revision.

Evidence:

- PR #86
- accepted feature head: `db32b9e24d4033fe308ab9b2fe7cdefb74ec593b`
- exact-head CI #221: SUCCESS
- protected-main merge: `218c3e18eed3a82861a4a1c24efd5458445ea9ca`
- exact-main CI #222: SUCCESS
- detailed closure: `docs/package-8-t1-closure.md`

### 8-T2 — controlled teacher correction operations

Status: **Completed.**

T2 adds a bounded, pure correction layer above T1:

- one supported operation kind: `replace_value`;
- existing paths only; no structural insertion/deletion;
- parent revision is never overwritten;
- each accepted correction batch creates a new immutable T1 corrected revision;
- a separate immutable audit event records actor/event identity, exact parent/result identities and fingerprints, and before/after values;
- duplicate operation IDs, overlapping paths, no-op changes, unsafe values, invalid paths and prototype-sensitive targets fail closed;
- correction does not imply teacher approval or musical verification.

Evidence:

- PR #89
- final accepted feature head: `c47ce6ba259e50bee8c71453c044650538535a14`
- exact-head CI #229: SUCCESS
- protected-main merge: `f6d80b4614654ee63a4fd2d51101e4961476a1ee`
- exact-main CI #230: SUCCESS
- detailed closure: `docs/package-8-t2-closure.md`

T2 review hardening canonicalizes `-0` and `0` as one array target and rejects unsupported primitive values in audit validation.

### 8-T3 — exact-revision teacher approval binding

Status: **Completed.**

T3 adds a separate immutable teacher approval record above T1/T2 without mutating revision content:

- approval is an explicit `teacher_approved` record, not a mutable revision flag;
- approval binds to exact `sourceId`, root `sourceRevisionId`, `approvedRevisionId` and `approvedContentFingerprint`;
- `APPROVED_EXACT_REVISION` is returned only for the exact bound valid revision;
- any later/new revision is `NOT_APPLICABLE_TO_REVISION`, even when its content fingerprint happens to match;
- historical approval evidence remains immutable and is not deleted or rewritten;
- caller supplies approval/actor identity and optional timestamp; T3 generates none;
- approval does not become a quality-gate decision, authentication/authorization proof, sharing permission or persistence record.

Evidence:

- PR #91
- final feature head: `d1805c054e490e71e3d266471ad158defbcd49e1`
- exact-head CI #233 / run `33164496653`, job `98826560680`: SUCCESS
- protected-main squash merge: `70a02589206eeea9c3defec4d5f544e9222cbe3a`
- exact-main CI #234 / run `33164575331`, job `98826810765`: SUCCESS
- **1150/1150 tests, 232 suites, 0 fail/skipped/cancelled**
- audit: **0 vulnerabilities**
- production build: **PASS**
- review threads: none at merge gate
- detailed closure: `docs/package-8-t3-closure.md`

T3 focused tests verify exact binding, later-revision non-applicability, identical-content non-inheritance, cross-source isolation, strict frozen-record validation and separation from quality/auth/sharing claims.

### Remaining Package 8 stages

- **8-T4 — Not started / NEXT:** undo/version history.
- **8-T5 — Not started:** optimistic concurrency / stale-base conflict.
- **8-T6 — Not started:** accessible teacher UI.

Package 8 therefore remains **Partially implemented**, not Completed.

## Separate later roadmap package

**Package 8B — Audiveris training dataset** remains Not started and separate from Package 8-T1..T6. It must not be started as part of T4.

## Protected OMR and Render boundary

Current autonomous Package 8 work must not modify unless separately and explicitly authorized:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

Package 8-T1, 8-T2 and 8-T3 did not modify these areas. Exact-main CI #234 passed the existing Audiveris/OMR, Render Blueprint and Dockerfile security regressions.

## Remaining product areas

- Package 8-T4..T6 teacher history/concurrency/UI workflow
- Package 8B Audiveris teacher-approved training dataset
- Package 9 Advanced Guitar TAB
- Package 10 Advanced violin
- Package 11 Accessible tuner
- Package 12 Teacher-to-student approved-revision sharing
- Package 13 Simplified rhythm mode
- Package 14 full mobile productisation/device-level VoiceOver verification
- user authentication, roles and job ownership where required by later packages

## Current safe next step

The next implementation stage is **8-T4 only**. T4 must add lossless undo/version-history semantics above the immutable T1/T2/T3 records: existing revisions and approval/audit evidence must remain preserved rather than overwritten or deleted. T4 must not yet add optimistic concurrency, teacher UI, student sharing, Audiveris training, OMR changes or Render/deployment changes.
