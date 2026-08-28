# SesliTab AI Context

## Official Project Name

SesliTab

## Product Purpose

SesliTab is an inclusive and accessible music education project for blind, low-vision, and sighted students. It supports individual teaching, group learning, inclusive classrooms, and independent student practice.

The product must remain teacher-supervised and semi-automatic. Unverified musical data must not be presented as definitively correct.

## Sources of Truth

### Product and safety rules

1. `docs/project-charter.md`
2. This file
3. Approved package instructions

### Current implementation facts

1. Source code
2. Tests and fresh test results
3. `docs/current-status.md`
4. `docs/package-status.md`
5. Architecture and package closure documents

If documentation conflicts with code, report the conflict. Do not silently choose one interpretation.

## Required First Step

Before every implementation task:

1. Perform a read-only repository inspection.
2. Record repository, branch, protected-main SHA, open PR/issue state and fresh CI evidence.
3. Confirm the exact package/bounded stage and prerequisites.
4. List files allowed to change.
5. Identify focused tests, full regression and production build commands.
6. Confirm protected boundaries and unrelated systems that must remain unchanged.
7. Confirm explicit or already-granted write authority.

## Repository Map

- Frontend application: `src/`, `index.html`, `main.js`
- Music parsing/canonical model: root-level music modules and `src/services/`
- Teacher revision/correction/approval/history/concurrency domain:
  - `src/services/teacherRevisionModel.js`
  - `src/services/teacherCorrectionOperations.js`
  - `src/services/teacherApprovalModel.js`
  - `src/services/teacherRevisionHistory.js`
  - `src/services/teacherRevisionConcurrency.js`
- Backend and OMR gateway: `backend/`
- Tests: `tests/`
- Architecture/project documents: `docs/`
- CI workflows: `.github/workflows/`
- Deployment: `Dockerfile`, `render.yaml`

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

Fresh status must still be verified before work starts. As of the final Package 8-T5 implementation closure on 2026-08-28:

- Package 0–7: **Completed**.
- Package 8: **Partially implemented**.
- Package 8-T1 — immutable revision domain: **Completed**.
- Package 8-T2 — controlled teacher correction operations: **Completed**.
- Package 8-T3 — exact-revision approval binding/invalidation: **Completed**.
- Package 8-T4 — lossless revision history and undo: **Completed**.
- Package 8-T5 — optimistic concurrency / stale-history conflict: **Completed**.
- Package 8-T6 — accessible teacher UI: **NEXT / Not started**.
- Package 8B — Audiveris training dataset: later separate package, Not started.

Verified T5 implementation main:

`4747210751c1c49295052f8cca7be58281b91023`

Exact-main CI #253 / run `33181815397`, job `98884637074`:

- **1186/1186 tests PASS**
- **232 suites**
- 0 failed/skipped/cancelled
- audit **0 vulnerabilities**
- production build **PASS**
- all 13 T5 concurrency regressions **PASS**
- T1–T4 teacher-domain regressions **PASS**
- existing Audiveris/OMR, Render Blueprint and Dockerfile security regressions **PASS**

See `docs/package-8-t5-closure.md`.

## Package 8 Domain Invariants

1. Automatic source revision is immutable.
2. A correction creates a new immutable revision and never overwrites its parent.
3. Every revision preserves root-source identity and deterministic recursive lineage identity.
4. Correction operations are auditable and do not imply approval.
5. Quality-gate `ACCEPT` is not teacher approval.
6. Teacher approval is a separate immutable record, never a mutable revision flag.
7. Approval binds to one exact revision identity/content and recursive lineage.
8. A later or replayed revision must not inherit an older approval automatically.
9. Historical approval evidence remains immutable when non-applicable to a later revision.
10. History preserves old revisions and transition evidence rather than rewriting/deleting them.
11. Every non-root history revision must have exactly one truthful correction or undo transition event.
12. Undo creates a new corrected revision from the current parent using exact historical content; it never moves a mutable pointer backward.
13. Restoring old content does not restore old lineage or old approval applicability.
14. A teacher mutation based on stale valid history must return explicit conflict before creating new domain evidence.
15. Approval-only history changes are concurrency-visible even when the current revision does not change.
16. T5 conflict must produce zero partial revision/audit/approval evidence.
17. Package 12 may later share only an exact approved revision together with required quality/safety evidence.

## Verified T1 / T2 / T3 / T4 / T5 Boundary

### T1 provides

- `automatic` and `teacher_corrected` immutable revision records;
- schema version **2**;
- root source identity and exact parent identity;
- deterministic `contentFingerprint`;
- deterministic `parentLineageFingerprint` and recursive `lineageFingerprint`;
- strict deep-frozen plain-data snapshots;
- fail-closed revision recognition;
- no embedded approval field.

The recursive lineage token is a deterministic drift/version identity, **not** a cryptographic signature or authorization credential.

### T2 provides

- bounded `replace_value` operations only;
- existing-path replacement, no insertion/deletion;
- parent source never overwritten;
- new corrected revision via T1;
- separate immutable correction audit event;
- rejection of invalid/no-op/overlapping/prototype-sensitive/unsafe corrections;
- no approval/persistence/history/concurrency/UI claim.

### T3 provides

- separate immutable teacher approval record;
- approval schema version **3**;
- caller-supplied `approvalId`, `actorId` and timestamp evidence;
- exact revision metadata/content and recursive lineage binding;
- deterministic `APPROVED_EXACT_REVISION` vs `NOT_APPLICABLE_TO_REVISION` evaluation;
- old approval evidence stays immutable when later revision is non-applicable;
- no quality, authorization or sharing claim.

### T4 provides

- immutable history schema version **1**;
- immutable undo-audit schema version **1**;
- exact automatic root and ordered T1 revision preservation;
- linearly linked corrected revisions with unique revision IDs and lineage fingerprints inside one history;
- exact preservation of T2 correction audit events and T3 approval records;
- deterministic replay of T2 audit operations against the exact parent before accepting history evidence;
- one transition event per non-root revision;
- undo as a new T1 corrected revision created from the current parent with exact historical target content;
- rejection of missing/current/no-op undo targets and reconstructed impossible undo histories;
- preservation of old approvals without silently applying them to the new undo revision;
- no persistence, concurrency, UI or sharing claim.

### T5 provides

- concurrency schema version **1**;
- strict immutable history expectations;
- explicit `current`, `applied`, `conflict` status vocabulary;
- explicit `history_mismatch`, `source_mismatch`, `stale_history` conflict reasons;
- deterministic full-history state fingerprint plus exact current revision/content/recursive-lineage binding;
- approval-only stale-state detection;
- guarded T2 correction, T3 approval append and T4 undo;
- zero-partial-domain-write conflict semantics;
- a fresh expectation for the authoritative current history after conflict;
- no automatic musical merge/rebase;
- no identifier/timestamp generation;
- malformed/mutable/injected expectation rejection.

The T5 full-history fingerprint is a deterministic version/drift token. It is **not** authentication, authorization, a digital signature or cryptographic integrity credential.

## T5 Authority Boundary

T5 is a **domain compare-and-apply primitive**, not a database transaction or distributed lock.

The `history` supplied to a guarded T5 operation must be the caller/integration layer's authoritative current valid T4 history at the commit boundary. T5 compares the submitted expectation to this state before creating any new revision, audit, approval or undo evidence.

A future persistent storage layer must preserve the compare-and-apply condition atomically with its own write. T5 itself does not claim:

- atomic database compare-and-swap wiring;
- distributed locking;
- cross-process serialization;
- authentication;
- authorization.

Passing an old local history as though it were authoritative current state is outside the guarantee of this pure domain layer.

## T5 Final Evidence

- PR #99 final head `6e151b94609ecf362b3bff0976479a6c2eda45b9`
- exact-head CI #252 / run `33181561159`, job `98883764663`: **SUCCESS**
- 1186/1186 tests, 232 suites, 0 vulnerabilities, production build PASS
- all 13 T5 focused regressions PASS
- final pre-merge review threads/submitted reviews: none
- protected-main merge `4747210751c1c49295052f8cca7be58281b91023`
- exact-main CI #253 / run `33181815397`, job `98884637074`: **SUCCESS**
- exact-main 1186/1186 tests, 232 suites, 0 vulnerabilities, production build PASS

## Package 8-T6 Allowed Direction

T6 is the next roadmap stage, but it is **not started in the T5 closure**. Any future T6 work requires fresh repository state and explicit stage authority.

T6 may later add an accessible teacher-facing UI that consumes the already-verified T1–T5 domain contracts. It must not create a parallel mutable truth model.

Likely required T6 boundaries include:

- display automatic, corrected and approved states distinctly;
- expose version/history and undo controls without rewriting old evidence;
- surface T5 conflict explicitly rather than silently retry/rebase;
- keyboard-native controls and screen-reader-readable state;
- never represent quality `ACCEPT` as teacher approval;
- never represent a stale edit as saved;
- preserve exact revision/history identity through UI actions.

This section is direction only. It is not authorization to implement T6 in this docs closure.

## Package 8-T6 Explicitly Deferred From T5 Closure

The current closure does not add:

- teacher UI code;
- persistence/backend APIs;
- automatic conflict resolution;
- student sharing — Package 12;
- Audiveris training data — Package 8B;
- authentication/authorization;
- OMR/Audiveris changes;
- deployment changes.

## Protected Integration Boundaries

Unless separately and explicitly authorized, do not change:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway and production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

Teacher revision/history/concurrency work sits above existing source/canonical/quality layers.

## Status Vocabulary

Use only:

- Completed
- Partially implemented
- Not started
- Not verified

Package 8 remains Partially implemented until T6 and the parent acceptance criteria are verified.

## Never Do

- Never modify `main` directly.
- Never work on more than one implementation stage at a time.
- Never invent missing notes, rhythms, measures, voices, pitches or MusicXML data.
- Never treat valid XML as proof of musical correctness.
- Never overwrite original PDF, OMR, MusicXML, corrected, approved or history data.
- Never bypass quality gates for definitive consumers.
- Never turn quality `ACCEPT` into teacher approval implicitly.
- Never add a mutable approval flag to revision content.
- Never make an old approval survive a new/replayed/undo revision unless the exact approved revision identity and recursive lineage match.
- Never treat revision/history fingerprints as cryptographic authentication or authorization.
- Never mutate old approval evidence merely to express non-applicability.
- Never silently accept a stale expected revision/history state.
- Never claim T5 provides database atomicity or distributed locking.
- Never describe skipped/unexecuted tests as successful.

## Current Development Rule

Run a fresh read-only audit before each stage. Use a dedicated branch, preserve unrelated behavior, resolve review findings, require exact-head CI before merge and exact-main CI after merge before status advancement.
