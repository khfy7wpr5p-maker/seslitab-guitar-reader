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

Fresh status must still be verified before work starts. As of the Package 8-T3 protected-main implementation closure on 2026-08-28:

- Package 0–7 are Completed.
- Package 8 is **Partially implemented**.
- Package 8-T1 — immutable revision domain contract — is **Completed**.
- Package 8-T2 — controlled teacher correction operations — is **Completed**.
- Package 8-T3 — exact-revision teacher approval binding/invalidation — is **Completed**.
- Package 8-T4 — undo/version history — is the **next safe implementation stage**.
- Package 8-T5..T6 are Not started.
- Package 8B — Audiveris training dataset — is a later, separate roadmap package and must not be confused with Package 8-T1..T6.

Verified Package 8-T3 implementation main:

`70a02589206eeea9c3defec4d5f544e9222cbe3a`

Exact-main CI #234 / run `33164575331`, job `98826810765`:

- 1150/1150 tests PASS
- 232 suites
- 0 failed/skipped/cancelled
- audit 0 vulnerabilities
- production build PASS

See `docs/package-8-t3-closure.md`.

## Package 8 Domain Invariants

The Package 8 revision/approval architecture must preserve these invariants:

1. The automatic source revision is immutable.
2. A teacher correction creates a new immutable revision; it does not overwrite its parent.
3. Every revision preserves exact lineage to the original automatic source revision.
4. Correction operations are auditable and do not themselves imply approval.
5. Quality-gate `ACCEPT` is not teacher approval.
6. Teacher approval is represented separately from revision content.
7. Approval binds to one exact source/revision/content fingerprint.
8. A later revision does not inherit an older approval automatically.
9. Historical approval evidence is not mutated merely because it does not apply to a later revision.
10. Undo/history must preserve old revisions rather than deleting or rewriting them.
11. Stale concurrent edits must eventually fail with an explicit conflict instead of silent overwrite.
12. Package 12 may later share only an explicitly approved exact revision and must still respect quality/safety policy.

T1 enforces immutable revision snapshots and rejects approval-field injection. T2 enforces controlled replace-only corrections, creates a new T1 revision, and returns a separate immutable audit event. T3 adds a separate immutable approval record and exact-revision applicability evaluation.

## Verified Package 8-T1/T2/T3 Boundary

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

T2 review hardening canonicalizes `-0` and `0` as the same array target and rejects unsupported primitive values in audit validation.

### T3 already provides

- `TEACHER_APPROVAL_SCHEMA_VERSION = 1`;
- explicit `teacher_approved` state;
- immutable applicability vocabulary: `APPROVED_EXACT_REVISION` and `NOT_APPLICABLE_TO_REVISION`;
- separate immutable approval record with caller-supplied approval/actor identity and optional timestamp;
- exact binding to `sourceId`, root `sourceRevisionId`, exact revision ID and exact content fingerprint;
- applicability only to the exact valid bound revision;
- non-applicability to later/new revisions even if the content fingerprint is identical;
- cross-source isolation;
- strict frozen-record/field validation;
- no quality-gate, authentication/authorization, persistence or sharing claim.

T3 does not mutate or delete an old approval to express that it is no longer applicable to a later revision.

## Package 8-T4 Allowed Direction

T4 must stay above the immutable T1/T2/T3 records and remain bounded to lossless history/undo semantics.

It may add, after fresh inspection:

- an explicit versioned history/ledger contract for one source;
- deterministic ordering/linkage of existing immutable revisions and related correction/approval evidence;
- a bounded undo operation that creates/selects a new current state without rewriting historical revision bytes;
- caller-supplied event identity/timestamp where audit evidence is needed;
- validation that history contains no duplicate or contradictory revision identity;
- fail-closed handling for missing ancestry or unknown revision targets;
- tests proving undo/history never overwrites automatic, corrected or approved historical records.

T4 must not infer a new approval when undoing to an older revision. Any approval applicability must continue to be evaluated by the T3 exact-revision contract.

## Package 8-T4 Required Safety Questions

Before implementing T4, resolve in code/tests without broadening architecture:

1. What exact immutable records form the history input and what is only an index/view over them?
2. How is one revision selected as current without deleting or mutating older revisions?
3. Does undo create a new auditable transition or only return a deterministic selection result, and how is that represented without rewriting history?
4. How are duplicate IDs, missing parents, cross-source records and broken ancestry rejected?
5. How does undo preserve T3 approval semantics instead of silently restoring or inventing approval?
6. How is T4 kept separate from T5 stale-write/concurrency handling?

## Package 8-T4 Explicitly Deferred

T4 must not yet add:

- optimistic concurrency/stale-base conflict — T5;
- teacher UI — T6;
- student sharing — Package 12;
- Audiveris training data — Package 8B;
- authentication/authorization implementation unless separately scoped later;
- OMR/Audiveris or deployment changes.

## Protected Integration Boundaries

Unless a separate task explicitly authorizes them, do not change:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway and production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

Teacher revision/approval/history work must sit above the existing source/canonical/quality layers rather than rewriting OMR or deployment infrastructure.

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
- Never overwrite original PDF, OMR, MusicXML, corrected, approved, audit, or history evidence.
- Never present source-unverified OMR data as definitively correct.
- Never bypass the quality gate for TTS, playback, MIDI, Guitar TAB or other definitive consumers.
- Never turn an `ACCEPT` quality decision into teacher approval implicitly.
- Never add a mutable approval flag to a T1 revision record.
- Never make an approval survive a new corrected revision unless that exact revision is explicitly approved.
- Never mutate an old approval record merely to express that it does not apply to a later revision.
- Never implement undo by deleting or rewriting historical revisions.
- Never describe skipped, unavailable, or unexecuted tests as successful.

## Current Development Rule

Run a fresh read-only audit before each new implementation stage. Keep each stage on a dedicated branch, preserve unrelated behavior, resolve review findings, require exact-head CI before merge and exact-main CI after merge before updating status or proceeding to the next stage.
