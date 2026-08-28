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

Fresh status must still be verified before work starts. As of the Package 8-T2 protected-main closure on 2026-08-28:

- Package 0–7 are Completed.
- Package 8 is **Partially implemented**.
- Package 8-T1 — immutable revision domain contract — is **Completed**.
- Package 8-T2 — controlled teacher correction operations — is **Completed**.
- Package 8-T3 — exact-revision approval binding/invalidation — is the **next safe implementation stage**.
- Package 8-T4..T6 are Not started.
- Package 8B — Audiveris training dataset — is a later, separate roadmap package and must not be confused with Package 8-T1..T6.

Verified Package 8-T2 implementation main:

`f6d80b4614654ee63a4fd2d51101e4961476a1ee`

Exact-main CI #230 / run `33163126080`, job `98822108194`:

- 1136/1136 tests PASS
- 231 suites
- 0 failed/skipped/cancelled
- audit 0 vulnerabilities
- production build PASS

See `docs/package-8-t2-closure.md`.

## Package 8 Domain Invariants

The Package 8 revision/approval architecture must preserve these invariants:

1. The automatic source revision is immutable.
2. A teacher correction creates a new immutable revision; it does not overwrite its parent.
3. Every revision preserves exact lineage to the original automatic source revision.
4. Correction operations are auditable and do not themselves imply approval.
5. Quality-gate `ACCEPT` is not teacher approval.
6. Teacher approval must be represented separately from revision content.
7. Approval must bind to one exact revision identity/content fingerprint.
8. A later revision must not inherit an older approval automatically.
9. Undo/history must preserve old revisions rather than deleting or rewriting them.
10. Stale concurrent edits must eventually fail with an explicit conflict instead of silent overwrite.
11. Package 12 may later share only an explicitly approved exact revision.

T1 enforces immutable revision snapshots and rejects approval-field injection. T2 enforces controlled replace-only corrections, creates a new T1 revision, and returns a separate immutable audit event.

## Verified Package 8-T1/T2 Boundary

### T1 already provides

- `automatic` and `teacher_corrected` immutable revision records;
- exact parent and root-source lineage;
- deterministic content fingerprints;
- strict deep-frozen plain-data snapshots;
- fail-closed revision recognition;
- no embedded teacher-approval field.

### T2 already provides

- one bounded operation kind: `replace_value`;
- replacement of existing paths only; no insertion/deletion;
- deterministic independent-path batches;
- no overwrite of the automatic/parent source;
- new corrected revision creation through T1;
- separate correction audit event with actor/event identity, exact parent/result identity and fingerprint, and before/after values;
- rejection of invalid/no-op/overlapping/prototype-sensitive/unsafe corrections;
- no approval claim, persistence, history, concurrency or UI.

T2 review hardening additionally canonicalizes `-0` and `0` as the same array target and rejects unsupported primitive values in audit validation.

## Package 8-T3 Allowed Direction

T3 should remain small, pure and dependency-free unless fresh evidence proves otherwise.

It may add:

- a separate immutable `TeacherApprovalRecord`-style domain record;
- an explicit versioned approval vocabulary/status if needed for exact binding semantics;
- approval creation bound to one valid exact revision ID and exact content fingerprint;
- preservation of source/root identity sufficient to prevent cross-source binding;
- caller-supplied approval/event/actor identity and optional timestamp; no generated identity;
- deterministic validation that an approval applies only to the exact bound revision/fingerprint;
- deterministic evaluation showing a later corrected revision is **not covered** by the older approval;
- explicit invalidation/non-applicability semantics when the candidate revision identity/fingerprint differs from the approved one;
- focused fail-closed tests.

T3 must not silently turn correction history or quality evidence into approval. Approval must be an explicit teacher action represented by its own record.

## Package 8-T3 Required Safety Questions

Before implementing T3, resolve in code/tests without broadening architecture:

1. What exact fields make an approval record valid and immutable?
2. How is the approval bound simultaneously to source identity, revision ID and content fingerprint?
3. How does validation distinguish `APPROVED_EXACT_REVISION` from `NOT_APPLICABLE_TO_REVISION` without mutating the old approval record?
4. How are forged fields, accessors, symbols, mutable records and unsupported primitive data rejected?
5. How is approval prevented from bypassing existing structural/quality safety?
6. How is it kept separate from authentication/authorization, which is not yet implemented?

## Package 8-T3 Explicitly Deferred

T3 must not yet add:

- persistence/backend APIs;
- undo/version-history storage — T4;
- optimistic concurrency/stale-base conflict — T5;
- teacher UI — T6;
- student sharing — Package 12;
- Audiveris training data — Package 8B;
- authentication/authorization implementation unless separately scoped later.

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
- Never make an approval survive a new corrected revision unless that exact revision is explicitly re-approved.
- Never mutate an old approval record merely to express that it does not apply to a later revision.
- Never describe skipped, unavailable, or unexecuted tests as successful.

## Current Development Rule

Run a fresh read-only audit before each new implementation stage. Keep each stage on a dedicated branch, preserve unrelated behavior, resolve review findings, require exact-head CI before merge and exact-main CI after merge before updating status or proceeding to the next stage.
