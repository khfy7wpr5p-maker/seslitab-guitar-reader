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
2. Record the repository, branch, commit SHA, and git status.
3. Confirm the exact package and its prerequisites.
4. List the files allowed to change.
5. Identify mandatory tests and the production build command.
6. Wait for explicit write approval.

## Repository Map

- Frontend application: `src/`, `index.html`, `main.js`
- Music parsing and canonical model: root-level parser and theory modules
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

## Status Vocabulary

Use only these labels when reviewing packages:

- Completed
- Partially implemented
- Not started
- Not verified

A package is not completed merely because some related files or functions exist. Completion requires its acceptance criteria, focused tests, full regression tests, and production build evidence.

## Never Do

- Never modify `main` directly.
- Never work on more than one package at a time.
- Never invent missing notes, rhythms, measures, voices, pitches, or MusicXML data.
- Never treat valid XML as proof of musical correctness.
- Never overwrite original PDF, OMR, MusicXML, corrected, or approved data.
- Never present source-unverified OMR data as definitively correct.
- Never bypass the quality gate for TTS, playback, or Guitar TAB.
- Never merge, deploy, publish, or continue to a later package without explicit approval.
- Never describe skipped, unavailable, or unexecuted tests as successful.

## Current Development Rule

Use `docs/current-status.md` and `docs/package-status.md` only as orientation. Run a fresh read-only audit before starting any new implementation package.
