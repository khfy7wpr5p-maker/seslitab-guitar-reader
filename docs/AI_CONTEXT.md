# SesliTab AI Context

## Official Project Name

SesliTab

## Product Purpose

SesliTab is an inclusive and accessible music education project for blind, low-vision, and sighted students. It supports individual teaching, group learning, inclusive classrooms, and independent student practice.

The product must be developed as a teacher-supervised, semi-automatic system. It must not present unverified musical data as definitively correct.

## Sources of Truth

### Product and safety rules

1. `docs/project-charter.md`
2. This file
3. Approved package instructions

### Current implementation facts

1. Source code
2. Tests and fresh CI results
3. `docs/current-status.md`
4. `docs/package-status.md`
5. Architecture and package closure documents

If documentation conflicts with code, report the conflict. Do not silently choose one interpretation.

## Required First Step

Before every implementation task:

1. Perform a fresh read-only repository inspection.
2. Record repository, branch, commit SHA, open PR/issues and CI freshness.
3. Confirm the exact package/bounded stage and prerequisites.
4. List allowed files and protected no-touch boundaries.
5. Identify mandatory tests and production build command.
6. Confirm explicit/already-granted write authority for the bounded task.
7. Use a dedicated branch, exact-head CI, review cleanup, expected-head merge and exact-main CI.

## Repository Map

- Frontend application: `src/`, `index.html`, `main.js`
- Music parsing/canonical model: root-level music modules and `src/services/`
- Backend and OMR gateway: `backend/`
- Tests: `tests/`
- Architecture/project documents: `docs/`
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

As of the review-hardened Package 8-T3 implementation closure on 2026-08-28:

- Package 0–7 are Completed.
- Package 8 is **Partially implemented**.
- Package 8-T1 — immutable revision domain contract — **Completed**.
- Package 8-T2 — controlled teacher correction operations — **Completed**.
- Package 8-T3 — exact-revision approval binding/invalidation — **Completed after review hardening**.
- Package 8-T4 — undo/version history — **Not started / next safe stage**.
- Package 8-T5..T6 are Not started.
- Package 8B — Audiveris training dataset — is separate and later.

Final verified T3 main:

`95f11139929d1e3d65bd6c295794c316bb04ca84`

Exact-main CI #237 / run `33165513082`, job `98829856646`:

- 1151/1151 tests PASS
- 232 suites
- 0 failed/skipped/cancelled
- 0 vulnerabilities
- production build PASS
- 15 T3 focused tests PASS
- ancestor-revision-ID reuse regression PASS

See `docs/package-8-t3-closure.md`.

## Package 8 Domain Invariants

1. Automatic source revision is immutable.
2. Teacher correction creates a new immutable revision; it never overwrites its parent.
3. Every revision preserves parent and root-source lineage.
4. Correction operations are auditable and do not imply approval.
5. Quality-gate `ACCEPT` is not teacher approval.
6. Teacher approval is represented separately from revision content.
7. Approval applicability must bind to the exact immutable revision, not merely content similarity or a reusable ID.
8. A later revision must not inherit an older approval automatically.
9. Historical approval evidence remains immutable when it is not applicable to a later revision.
10. Undo/history must preserve old revisions/evidence rather than deleting or rewriting them.
11. Stale concurrent edits must eventually fail explicitly instead of silently overwriting data.
12. Package 12 may later share only an explicitly approved exact revision and must still respect quality/safety policy.

## Verified T1/T2/T3 Boundary

### T1 provides

- immutable `automatic` and `teacher_corrected` revision records;
- exact parent/root-source lineage;
- deterministic content fingerprints;
- strict deep-frozen plain-data snapshots;
- fail-closed revision recognition;
- no embedded approval field.

T1 rejects immediate parent and root-source ID reuse, but it does not globally guarantee uniqueness of every intermediate historical revision ID. Later layers must not assume otherwise.

### T2 provides

- one bounded operation kind: `replace_value`;
- existing-path replacement only; no insertion/deletion;
- deterministic independent-path batches;
- no parent/source overwrite;
- new T1 corrected revision creation;
- separate immutable correction audit event;
- rejection of invalid/no-op/overlapping/prototype-sensitive/unsafe corrections;
- no approval, persistence, history, concurrency or UI.

T2 review hardening canonicalizes `-0`/`0` as one array target and rejects unsupported primitive audit values.

### T3 provides

- `TEACHER_APPROVAL_SCHEMA_VERSION = 2`;
- explicit `teacher_approved` state;
- applicability vocabulary:
  - `APPROVED_EXACT_REVISION`
  - `NOT_APPLICABLE_TO_REVISION`;
- separate immutable approval records;
- caller-supplied approval/actor identity and optional timestamp;
- exact binding to:
  - `sourceId`
  - root `sourceRevisionId`
  - exact `revisionId`
  - exact `revisionKind`
  - exact `parentRevisionId`
  - exact revision `createdAt`
  - exact `contentFingerprint`;
- non-applicability to later/new revisions even when IDs/content/timestamps are deliberately reused where T1 permits;
- cross-source isolation;
- strict frozen-record validation;
- no quality-gate, authentication/authorization, persistence or sharing claim.

### T3 review history that must not be forgotten

PR #91 introduced the initial T3 implementation and passed CI #233/#234. During docs PR #92 review, a valid P1 showed that the initial four-dimension binding could be revived by reusing an intermediate ancestor ID and restoring old content. PR #92 was closed unmerged. PR #93 upgraded approval to schema v2 and added parent-lineage/revision-metadata binding. CI #236 and exact-main CI #237 verify the hardened result.

Do not regress T3 back to the four-dimension `(sourceId, sourceRevisionId, revisionId, contentFingerprint)` rule.

## Package 8-T4 Allowed Direction

T4 must remain a bounded, lossless history/undo domain layer above T1/T2/T3.

It may add after a new fresh-read:

- an explicit versioned history/ledger contract for one source;
- deterministic ordering/linkage of immutable revisions and relevant audit/approval evidence;
- bounded undo semantics that select/create a new current state without rewriting historical bytes;
- caller-supplied event identity/timestamp where audit evidence is needed;
- duplicate/contradictory revision identity checks across history;
- fail-closed missing ancestry/cross-source/unknown-target handling;
- tests proving undo/history never overwrites automatic, corrected or approved historical records.

T4 must not infer or restore approval implicitly. T3 exact-revision applicability remains authoritative.

## Package 8-T4 Required Safety Questions

1. What exact immutable records form history input versus derived index/view state?
2. How is a current revision selected without deleting/mutating older revisions?
3. Is undo represented as a new auditable transition or deterministic selection, and how is it immutable?
4. How are duplicate IDs, ancestor-ID reuse, missing parents, cross-source records and broken ancestry detected?
5. How does undo preserve T3 approval semantics without inventing/restoring approval?
6. How is T4 kept separate from T5 optimistic concurrency?

## Explicitly Deferred From T4

- T5 optimistic concurrency/stale-base conflict;
- T6 teacher UI;
- Package 12 student sharing;
- Package 8B Audiveris training data;
- authentication/authorization implementation unless separately scoped;
- OMR/Audiveris/deployment changes.

## Protected Integration Boundaries

Unless a separate task explicitly authorizes them, do not change:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway and production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

Teacher revision/correction/approval/history work must sit above the existing source/canonical/quality layers.

## Status Vocabulary

Use only:

- Completed
- Partially implemented
- Not started
- Not verified

A parent package is not Completed merely because one sub-stage is Completed. Package 8 stays Partially implemented until its remaining required stages are verified.

## Never Do

- Never modify `main` directly.
- Never work on more than one implementation stage at a time.
- Never invent missing musical data.
- Never treat valid XML as proof of musical correctness.
- Never overwrite original PDF, OMR, MusicXML, revision, correction audit or approval evidence.
- Never present source-unverified OMR data as definitive truth.
- Never bypass quality gates for definitive consumers.
- Never turn quality `ACCEPT` into teacher approval implicitly.
- Never add a mutable approval flag to revision content.
- Never let approval survive a later revision merely because an old ID/content was reused.
- Never implement undo by deleting/rewriting history.
- Never describe skipped/unexecuted tests as successful.

## Current Development Rule

T3 documentation closure may be completed, but **T4 implementation is not authorized by T3 approval alone**. A new T4 implementation must begin with a fresh read-only audit and explicit/already-granted authority for that next bounded stage.
