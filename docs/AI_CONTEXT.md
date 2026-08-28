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
3. Confirm the exact package and its prerequisites.
4. List the files allowed to change.
5. Identify mandatory tests and the production build command.
6. Confirm protected boundaries and unrelated systems that must remain unchanged.
7. Obtain explicit write authority for the bounded task.

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

Fresh status must still be verified before work starts, but as of the 2026-08-28 architecture reconciliation:

- Package 0–7 are recorded as completed in the repository closure/status documents.
- Package 8 — Teacher correction, revision history and approval — is the next strict roadmap package.
- Package 8B — Audiveris training dataset — is a later, separate package and must not be confused with Package 8 implementation stages.

Package 8 should be implemented in small stages. The first safe stage is a dependency-free revision-domain contract: immutable automatic source, teacher-corrected revisions, exact-revision approval identity and no mutation of original OMR/MusicXML/canonical data.

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

A package is not completed merely because some related files or functions exist. Completion requires its acceptance criteria, focused tests, full regression tests, production build evidence and the repository's protected-main closure requirements.

## Never Do

- Never modify `main` directly.
- Never work on more than one implementation package at a time.
- Never invent missing notes, rhythms, measures, voices, pitches, or MusicXML data.
- Never treat valid XML as proof of musical correctness.
- Never overwrite original PDF, OMR, MusicXML, corrected, or approved data.
- Never present source-unverified OMR data as definitively correct.
- Never bypass the quality gate for TTS, playback, MIDI, Guitar TAB or other definitive consumers.
- Never turn an `ACCEPT` quality decision into teacher approval implicitly.
- Never make an approval survive a new corrected revision unless it is explicitly re-approved.
- Never describe skipped, unavailable, or unexecuted tests as successful.

## Current Development Rule

Use `docs/current-status.md` and `docs/package-status.md` only as orientation. Run a fresh read-only audit before starting any new implementation stage. Keep each stage on a dedicated branch, preserve unrelated behavior and use exact-head CI evidence before considering it ready for protected-main integration.
