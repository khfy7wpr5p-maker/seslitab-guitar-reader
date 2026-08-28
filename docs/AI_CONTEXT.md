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
- Teacher revision/correction/approval/history domain:
  - `src/services/teacherRevisionModel.js`
  - `src/services/teacherCorrectionOperations.js`
  - `src/services/teacherApprovalModel.js`
  - `src/services/teacherRevisionHistory.js`
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

Fresh status must still be verified before work starts. As of the final review-hardened Package 8-T4 implementation closure on 2026-08-28:

- Package 0–7: **Completed**.
- Package 8: **Partially implemented**.
- Package 8-T1 — immutable revision domain: **Completed**.
- Package 8-T2 — controlled teacher correction operations: **Completed**.
- Package 8-T3 — exact-revision approval binding/invalidation: **Completed**.
- Package 8-T4 — lossless revision history and undo: **Completed**.
- Package 8-T5 — optimistic concurrency / stale-base conflict: **NEXT / Not started**.
- Package 8-T6 — accessible teacher UI: Not started.
- Package 8B — Audiveris training dataset: later separate package, Not started.

Verified T4 implementation main:

`eaf967174d1cc0f2552cc97e7e0a6bf0a1715c64`

Exact-main CI #248 / run `33177550356`, job `98869988554`:

- **1173/1173 tests PASS**
- **232 suites**
- 0 failed/skipped/cancelled
- audit **0 vulnerabilities**
- production build **PASS**
- T4 lossless undo/history regressions **PASS**
- T4 forged correction-audit semantics regression **PASS**
- T4 reconstructed current-parent undo regression **PASS**
- T3 multi-hop revision-ID replay regression **PASS**

See `docs/package-8-t4-closure.md`.

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
14. Stale concurrent edits must fail with explicit conflict rather than silent overwrite.
15. Package 12 may later share only an exact approved revision together with required quality/safety evidence.

## Verified T1 / T2 / T3 / T4 Boundary

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
- caller-supplied `approvalId`, `actorId` and optional timestamp;
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
- exact parent/target/result content and lineage binding in undo audit evidence;
- rejection of missing/current/no-op undo targets and reconstructed impossible undo histories;
- preservation of old approvals without silently applying them to the new undo revision;
- no persistence, concurrency, UI or sharing claim.

## T4 Review-Hardening History

T4 was not merged at the first green CI result. Merge-side domain review and PR review closed two integrity findings:

1. T2 correction audit records could be shape-valid and bind the top-level parent/result fingerprints while lying about an operation's `before` evidence. T4 now deterministically replays recorded operations and requires the reproduced revision/audit semantics to match exactly.
2. An externally reconstructed history could encode the current parent/same-content state as an undo target even though the public creator rejects it. History validation now applies the same fail-closed undo semantics.

Final evidence:

- PR #97 final head `0c83c54b2353ff5b82a4acfa7bb64e0f23635b0b`
- exact-head CI #247 / run `33177095707`: first attempt had one unrelated existing API cancellation timing flake; same exact-head rerun **SUCCESS**
- same-head rerun: 1173/1173 tests, 232 suites, 0 vulnerabilities, build PASS
- protected-main merge `eaf967174d1cc0f2552cc97e7e0a6bf0a1715c64`
- exact-main CI #248 / run `33177550356`, job `98869988554`: **SUCCESS**
- 1173/1173 tests, 232 suites, 0 vulnerabilities, build PASS

## Package 8-T5 Allowed Direction

T5 is the next bounded stage. It should remain small, deterministic and fail-closed.

It may add:

- explicit expected-current revision/history identity supplied by the caller;
- deterministic stale-base detection before a correction, approval-history append, or undo history append is accepted;
- explicit conflict result/error rather than last-write-wins overwrite;
- exact current revision ID plus recursive lineage comparison to prevent replay/stale acceptance;
- conflict evidence that does not mutate the accepted history;
- focused two-writer/stale-base/retry regressions.

T5 should build on the immutable T4 history contract rather than introducing a second mutable history model.

## Package 8-T5 Explicitly Deferred

T5 must not yet add:

- accessible teacher UI — T6;
- student sharing — Package 12;
- Audiveris training data — Package 8B;
- authentication/authorization unless separately scoped;
- unrelated persistence/backend architecture unless a minimal bounded concurrency adapter is explicitly required and separately justified;
- OMR/Audiveris or deployment changes.

## Protected Integration Boundaries

Unless separately and explicitly authorized, do not change:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway and production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

Teacher revision/history work sits above existing source/canonical/quality layers.

## Status Vocabulary

Use only:

- Completed
- Partially implemented
- Not started
- Not verified

Package 8 remains Partially implemented until T5–T6 and the parent acceptance criteria are verified.

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
- Never treat lineage/content fingerprints as cryptographic authentication or authorization.
- Never mutate old approval evidence merely to express non-applicability.
- Never silently accept a stale expected revision/history state in T5.
- Never describe skipped/unexecuted tests as successful.

## Current Development Rule

Run a fresh read-only audit before each stage. Use a dedicated branch, preserve unrelated behavior, resolve review findings, require exact-head CI before merge and exact-main CI after merge before status advancement.
