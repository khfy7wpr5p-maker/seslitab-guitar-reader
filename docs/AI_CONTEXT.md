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
- Teacher revision/correction/approval domain: `src/services/teacherRevisionModel.js`, `teacherCorrectionOperations.js`, `teacherApprovalModel.js`
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

Fresh status must still be verified before work starts. As of the final review-hardened Package 8-T3 protected-main closure on 2026-08-28:

- Package 0–7: **Completed**.
- Package 8: **Partially implemented**.
- Package 8-T1 — immutable revision domain: **Completed**.
- Package 8-T2 — controlled teacher correction operations: **Completed**.
- Package 8-T3 — exact-revision approval binding/invalidation: **Completed**.
- Package 8-T4 — lossless undo/version history: **NEXT / Not started**.
- Package 8-T5 — optimistic concurrency: Not started.
- Package 8-T6 — accessible teacher UI: Not started.
- Package 8B — Audiveris training dataset: later separate package, Not started.

Verified T3 final implementation main:

`c57966598d2d6fe34418119670bea42a9cdcf369`

Exact-main CI #240 / run `33175019324`, job `98861276737`:

- **1154/1154 tests PASS**
- **232 suites**
- 0 failed/skipped/cancelled
- audit **0 vulnerabilities**
- production build **PASS**
- multi-hop revision-ID replay regression **PASS**
- recursive lineage regression **PASS**

See `docs/package-8-t3-closure.md`.

## Package 8 Domain Invariants

1. Automatic source revision is immutable.
2. A correction creates a new immutable revision and never overwrites its parent.
3. Every revision preserves root-source identity and deterministic recursive lineage identity.
4. Correction operations are auditable and do not imply approval.
5. Quality-gate `ACCEPT` is not teacher approval.
6. Teacher approval is a separate immutable record, never a mutable revision flag.
7. Approval binds to one exact revision identity/content **and recursive lineage**.
8. A later or replayed revision must not inherit an older approval automatically.
9. Historical approval evidence remains immutable when non-applicable to a later revision.
10. Undo/history must preserve old revisions rather than rewriting/deleting them.
11. Stale concurrent edits must eventually fail with explicit conflict rather than silent overwrite.
12. Package 12 may later share only an exact approved revision together with required quality/safety evidence.

## Verified T1 / T2 / T3 Boundary

### T1 now provides

- `automatic` and `teacher_corrected` immutable revision records;
- schema version **2**;
- root source identity and exact parent identity;
- deterministic `contentFingerprint`;
- deterministic `parentLineageFingerprint` and recursive `lineageFingerprint`;
- strict deep-frozen plain-data snapshots;
- fail-closed revision recognition;
- no embedded approval field.

The recursive lineage token incorporates exact parent lineage plus the current revision metadata/content fingerprint. It is a deterministic drift/version identity, **not** a cryptographic signature or authorization credential.

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
- exact source/root-source, revision ID/kind, parent revision ID, revision timestamp and content fingerprint binding;
- `approvedLineageFingerprint` binding to recursive T1 lineage;
- deterministic `APPROVED_EXACT_REVISION` vs `NOT_APPLICABLE_TO_REVISION` evaluation;
- old approval evidence stays immutable when later revision is non-applicable;
- no quality, authorization or sharing claim.

## T3 Security Review History

T3 required two review-hardening cycles before final acceptance:

1. Initial approval implementation PR #91 was green, but PR #92 review found a one-hop ancestor revision-ID reuse path. PR #92 was not merged.
2. PR #93 hardened approval schema to v2, but PR #94 review found a deeper replay:

```text
A0 -> R1 -> R2 (approved) -> replay R1 -> replay R2
```

The replayed R2 could reconstruct all former schema-v2 approval dimensions.
3. PR #95 fixed this at the revision-domain level with recursive lineage identity and approval schema v3 binding.

Final evidence:

- PR #95 head `77f5035a85dfd6895490198d2160107b28479320`
- exact-head CI #239 SUCCESS
- protected-main merge `c57966598d2d6fe34418119670bea42a9cdcf369`
- exact-main CI #240 SUCCESS
- 1154/1154 tests, 232 suites, 0 vulnerabilities, build PASS

## Package 8-T4 Allowed Direction

T4 is now the next bounded stage. It should remain small, deterministic and fail-closed.

It may add:

- explicit lossless revision-history representation;
- ordering/linkage validation over immutable T1 revisions;
- undo as selection/creation of explicit revision state without rewriting old revisions;
- preservation of T2 audit and T3 approval historical evidence;
- deterministic validation that undo does not silently resurrect an approval that is not applicable to the exact selected revision;
- focused history/undo regressions.

## Package 8-T4 Explicitly Deferred

T4 must not yet add:

- optimistic concurrency/stale-base conflict — T5;
- accessible teacher UI — T6;
- student sharing — Package 12;
- Audiveris training data — Package 8B;
- authentication/authorization implementation unless separately scoped;
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

Package 8 remains Partially implemented until T4–T6 and the parent acceptance criteria are verified.

## Never Do

- Never modify `main` directly.
- Never work on more than one implementation stage at a time.
- Never invent missing notes, rhythms, measures, voices, pitches or MusicXML data.
- Never treat valid XML as proof of musical correctness.
- Never overwrite original PDF, OMR, MusicXML, corrected or approved data.
- Never bypass quality gates for definitive consumers.
- Never turn quality `ACCEPT` into teacher approval implicitly.
- Never add a mutable approval flag to revision content.
- Never make an old approval survive a new/replayed revision unless the exact approved revision identity and recursive lineage match.
- Never treat lineage/content fingerprints as cryptographic authentication or authorization.
- Never mutate old approval evidence merely to express non-applicability.
- Never describe skipped/unexecuted tests as successful.

## Current Development Rule

Run a fresh read-only audit before each stage. Use a dedicated branch, preserve unrelated behavior, resolve review findings, require exact-head CI before merge and exact-main CI after merge before status advancement.
