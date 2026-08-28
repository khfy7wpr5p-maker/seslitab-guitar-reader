# SesliTab Current Status

Last documentation review: 2026-08-28  
Latest verified protected `main`: `f6d80b4614654ee63a4fd2d51101e4961476a1ee`  
Latest exact-main CI: **#230 / `33163126080`, job `98822108194` — SUCCESS**  
Current package state: **Package 8 — Partially implemented; 8-T1 and 8-T2 Completed.**  
Next safe implementation stage: **Package 8-T3 — exact-revision teacher approval binding and invalidation semantics.**

This file is a concise orientation document. Source code, tests, protected-main state and fresh GitHub Actions evidence remain authoritative.

## Verified current baseline

Exact-main CI #230 on `f6d80b4614654ee63a4fd2d51101e4961476a1ee` verified:

- **1136 / 1136 tests PASS**
- **231 suites**
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

T2 adds only a bounded, pure correction layer above T1:

- one supported operation kind: `replace_value`;
- existing paths only; no structural insertion/deletion;
- parent revision is never overwritten;
- each accepted correction batch creates a new immutable T1 corrected revision;
- a separate immutable audit event records actor/event identity, exact parent/result identities and fingerprints, and before/after values;
- duplicate operation IDs, overlapping paths, no-op changes, unsafe values, invalid paths and prototype-sensitive targets fail closed;
- correction does not imply teacher approval or musical verification.

Evidence:

- implementation baseline: `cd7e4686c88d2428d7a1a095539de2d87f9551e5`
- PR #89
- final accepted feature head after review hardening: `c47ce6ba259e50bee8c71453c044650538535a14`
- exact-head CI #229: SUCCESS
- protected-main merge: `f6d80b4614654ee63a4fd2d51101e4961476a1ee`
- exact-main CI #230: SUCCESS
- **1136/1136 tests, 231 suites, 0 fail/skipped/cancelled**
- audit: **0 vulnerabilities**
- production build: **PASS**
- detailed closure: `docs/package-8-t2-closure.md`

PR review found and T2 fixed two relevant edge cases before merge:

1. `-0` and `0` are canonicalized as the same array target so a batch cannot mutate one location twice while appearing independent.
2. Audit validation rejects unsupported primitive values such as `undefined`, non-finite numbers, bigint, symbols and functions.

Both review regressions pass on exact-main CI #230.

### Remaining Package 8 stages

- **8-T3 — Not started / NEXT:** exact-revision approval binding and changed-revision invalidation semantics.
- **8-T4 — Not started:** undo/version history.
- **8-T5 — Not started:** optimistic concurrency / stale-base conflict.
- **8-T6 — Not started:** accessible teacher UI.

Package 8 therefore remains **Partially implemented**, not Completed.

## Separate later roadmap package

**Package 8B — Audiveris training dataset** remains Not started and separate from Package 8-T1..T6. It must not be started as part of T3.

## Protected OMR and Render boundary

Current autonomous Package 8 work must not modify unless separately and explicitly authorized:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

Package 8-T1 and 8-T2 did not modify these areas. Exact-main CI #230 passed the existing Audiveris/OMR, Render Blueprint and Dockerfile security regressions.

## Maintenance closure since T1

Legacy PR #17 was safely superseded by PR #88 instead of merging its stale branch. The still-valid E2E MiniDOM whitespace fix was refreshed onto current main, regression-tested, merged and exact-main verified before T2 began. This maintenance work did not change the production MusicXML parser, OMR/Audiveris or Render connection.

## Remaining product areas

- Package 8-T3..T6 teacher approval/history/concurrency/UI workflow
- Package 8B Audiveris teacher-approved training dataset
- Package 9 Advanced Guitar TAB
- Package 10 Advanced violin
- Package 11 Accessible tuner
- Package 12 Teacher-to-student approved-revision sharing
- Package 13 Simplified rhythm mode
- Package 14 full mobile productisation/device-level VoiceOver verification
- user authentication, roles and job ownership where required by later packages

## Current safe next step

The next implementation stage is **8-T3 only**. T3 must define a separate immutable teacher-approval record bound to one exact revision identity/content fingerprint and make it impossible for a later corrected revision to inherit that approval implicitly. It must remain above the existing canonical/quality layers, must not bypass quality safety, and must not yet add persistence/history, optimistic concurrency, UI, student sharing, Audiveris training, OMR changes or Render/deployment changes.
