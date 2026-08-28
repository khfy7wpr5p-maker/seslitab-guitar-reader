# SesliTab Current Status

Last documentation review: 2026-08-28  
Latest verified protected `main`: `218c3e18eed3a82861a4a1c24efd5458445ea9ca`  
Latest exact-main CI: **#222 / `33157031392`, job `98802158018` — SUCCESS**  
Current package state: **Package 8 — Partially implemented; 8-T1 Completed.**  
Next safe implementation stage: **Package 8-T2 — controlled teacher correction operations.**

This file is a concise orientation document. Source code, tests, protected-main state and fresh GitHub Actions evidence remain authoritative.

## Verified current baseline

Exact-main CI #222 on `218c3e18eed3a82861a4a1c24efd5458445ea9ca` verified:

- **1118 / 1118 tests PASS**
- **230 suites**
- **0 failed / skipped / cancelled**
- `npm ci` completed successfully
- **0 vulnerabilities** in the audit result
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

Status: **Completed as a bounded sub-stage.**

Evidence:

- baseline before implementation: `eff2fbdd77cdd47dd811d306cf546a295096a653`
- PR #86
- accepted feature head: `db32b9e24d4033fe308ab9b2fe7cdefb74ec593b`
- exact-head CI #221: SUCCESS
- protected-main merge: `218c3e18eed3a82861a4a1c24efd5458445ea9ca`
- exact-main CI #222: SUCCESS
- all review threads resolved before merge

T1 introduced only:

- immutable automatic source revisions;
- immutable teacher-corrected revisions;
- exact parent and root-source lineage;
- deterministic content fingerprinting;
- strict deep-frozen plain-data snapshots;
- fail-closed revision validation.

Approval is deliberately absent from the T1 revision schema. A `teacherApproved` field cannot be injected into a valid revision record.

Detailed evidence: `docs/package-8-t1-closure.md`.

### Remaining Package 8 stages

- **8-T2 — Not started:** controlled correction operations and deterministic corrected-revision creation.
- **8-T3 — Not started:** exact-revision approval binding and invalidation.
- **8-T4 — Not started:** undo/version history.
- **8-T5 — Not started:** optimistic concurrency / stale-base conflict.
- **8-T6 — Not started:** accessible teacher UI.

Package 8 must therefore remain **Partially implemented**, not Completed.

## Separate later roadmap package

**Package 8B — Audiveris training dataset** remains Not started and is separate from Package 8-T1..T6. It must not be started merely because T1 is complete.

## Protected OMR and Render boundary

Current autonomous Package 8 work must not modify unless separately and explicitly authorized:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

Package 8-T1 did not modify any of those areas. The existing OMR/Audiveris/Render tests passed as part of the full regression suite.

## Remaining product areas

- Package 8-T2..T6 teacher correction/approval workflow
- Package 8B Audiveris teacher-approved training dataset
- Package 9 Advanced Guitar TAB
- Package 10 Advanced violin
- Package 11 Accessible tuner
- Package 12 Teacher-to-student approved-revision sharing
- Package 13 Simplified rhythm mode
- Package 14 full mobile productisation/device-level VoiceOver verification
- user authentication, roles and job ownership where required by later packages

## Current safe next step

The next implementation stage is **8-T2 only**. It must build controlled, auditable correction operations on top of `teacherRevisionModel.js`, produce a new immutable corrected revision rather than mutating an existing source, add focused tests, then pass the full regression suite and production build before any work on 8-T3 begins.
