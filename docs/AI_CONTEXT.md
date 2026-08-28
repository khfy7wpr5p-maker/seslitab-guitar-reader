# SesliTab AI Context

## Official Project Name

SesliTab

## Product Purpose

SesliTab is an inclusive and accessible music education project for blind, low-vision, and sighted students. It supports individual teaching, group learning, inclusive classrooms, and independent student practice.

The product must be developed as a teacher-supervised, semi-automatic system. It must not present unverified musical data as definitively correct.

## Sources of Truth

Use different sources for different questions:

### Product and safety rules

1. `docs/project-charter.md`
2. This file
3. Approved package instructions

### Current implementation facts

1. Source code
2. Tests and fresh test results
3. `docs/current-status.md`
4. `docs/package-status.md`
5. Architecture and API documents

If documentation conflicts with code, report the conflict. Do not silently choose one interpretation.

## Required First Step

Before every implementation task:

1. Perform a read-only repository inspection.
2. Record the repository, branch, commit SHA, and repository/PR freshness state.
3. Confirm the exact package or bounded sub-stage and its prerequisites.
4. List the files allowed to change.
5. Identify mandatory tests and the production build command.
6. Confirm protected boundaries and unrelated systems that must remain unchanged.
7. Confirm explicit or already-granted write authority for the bounded task.

## Repository Map

- Frontend application: `src/`, `index.html`, `main.js`
- Music parsing and canonical model: root-level parser/theory/canonical modules and `src/services/`
- Backend and OMR gateway: `backend/`
- Tests: `tests/`
- Architecture and project documents: `docs/`
- CI workflows: `.github/workflows/`
- Deployment configuration: `Dockerfile`, `render.yaml`

## Main Commands

```bash
npm run dev
npm test
npm run build
npm run backend:start
npm run backend:dev
```

Node.js requirement: `>=24.0.0 <25`.

## Current Roadmap Position

Fresh status must still be verified before work starts. As of the Package 8-T1 protected-main closure on 2026-08-28:

- Package 0–7 are Completed.
- Package 8 is **Partially implemented**.
- Package 8-T1 — immutable revision domain contract — is **Completed**.
- Package 8-T2 — controlled correction operations — is the **next safe implementation stage**.
- Package 8-T3..T6 are Not started.
- Package 8B — Audiveris training dataset — is a later, separate roadmap package and must not be confused with Package 8-T1..T6.

Verified Package 8-T1 closure main:

`218c3e18eed3a82861a4a1c24efd5458445ea9ca`

Exact-main CI #222 / `33157031392`, job `98802158018`:

- 1118/1118 tests PASS
- 230 suites
- 0 failed/skipped/cancelled
- audit 0 vulnerabilities
- production build PASS

See `docs/package-8-t1-closure.md`.

## Package 8 Domain Invariants

The Package 8 revision/approval architecture must preserve these invariants:

1. The automatic source revision is immutable.
2. A teacher correction creates a new immutable revision; it does not overwrite its parent.
3. Every revision preserves exact lineage to the original automatic source revision.
4. Quality-gate `ACCEPT` is not teacher approval.
5. Teacher approval must be represented separately from revision content.
6. Approval must bind to one exact revision/fingerprint.
7. A later revision must not inherit an older approval automatically.
8. Undo/history must preserve old revisions rather than deleting or rewriting them.
9. Stale concurrent edits must eventually fail with an explicit conflict instead of silent overwrite.
10. Package 12 may later share only an explicitly approved exact revision.

T1 already enforces immutable revision snapshots and rejects approval-field injection. T2 must add controlled correction operations without weakening T1.

## Package 8-T2 Allowed Direction

T2 should remain small, pure and dependency-free unless evidence proves otherwise.

It may add:

- explicit correction-operation vocabulary;
- validation of correction operations;
- deterministic application of approved correction operations to a parent revision snapshot;
- creation of a new immutable corrected revision through the existing T1 model;
- audit-friendly operation metadata that does not claim approval;
- focused tests.

T2 must not yet add:

- teacher approval or approval invalidation;
- persistence/backend APIs;
- undo/version-history storage;
- optimistic concurrency;
- teacher UI;
- student sharing;
- Audiveris training data.

## Protected Integration Boundaries

Unless a separate task explicitly authorizes them, do not change:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway and production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

Teacher revision/approval work must sit above the existing source/canonical/quality layers rather than rewriting OMR or deployment infrastructure.

## Status Vocabulary

Use only these labels when reviewing packages:

- Completed
- Partially implemented
- Not started
- Not verified

A parent package is not Completed merely because one sub-stage is Completed. Package 8 stays Partially implemented until all required correction, approval, history, concurrency and accessible teacher-workflow criteria are verified.

## Never Do

- Never modify `main` directly.
- Never work on more than one implementation stage at a time.
- Never invent missing notes, rhythms, measures, voices, pitches, or MusicXML data.
- Never treat valid XML as proof of musical correctness.
- Never overwrite original PDF, OMR, MusicXML, corrected, or approved data.
- Never present source-unverified OMR data as definitively correct.
- Never bypass the quality gate for TTS, playback, MIDI, Guitar TAB or other definitive consumers.
- Never turn an `ACCEPT` quality decision into teacher approval implicitly.
- Never add a mutable approval flag to a T1 revision record.
- Never make an approval survive a new corrected revision unless it is explicitly re-approved.
- Never describe skipped, unavailable, or unexecuted tests as successful.

## Current Development Rule

Run a fresh read-only audit before each new implementation stage. Keep each stage on a dedicated branch, preserve unrelated behavior, resolve review findings, require exact-head CI before merge and exact-main CI after merge before updating status or proceeding to the next stage.
