# Package 8-T4 — Final Closure Evidence

Status: **Completed**  
Closure date: 2026-08-28

## Scope closed

Package 8-T4 adds a pure, dependency-free, lossless teacher revision history and undo domain on top of completed T1/T2/T3.

The completed stage includes:

- immutable linear teacher history snapshots;
- exact preservation of T1 revisions;
- exact preservation and validation of T2 correction audit evidence;
- exact preservation of T3 approval records as historical evidence;
- explicit immutable T4 undo audit events;
- undo by creating a new corrected revision from exact historical content;
- recursive-lineage protection so restored content does not silently resurrect an older approval;
- fail-closed validation of malformed, non-linear, duplicate, mutable, injected, cross-source, semantically forged or impossible history evidence.

## Explicit non-scope

T4 does not implement:

- persistent history storage or backend APIs;
- optimistic concurrency / stale-base conflict handling — Package 8-T5;
- accessible teacher UI — Package 8-T6;
- student sharing — Package 12;
- authentication/authorization;
- Audiveris training data — Package 8B;
- OMR/Audiveris/provider/gateway/runtime changes;
- Dockerfile, render.yaml or Render deployment connection changes;
- dependency or CI workflow changes.

## Implementation PR

PR #97 — `Package 8-T4: add lossless revision history and undo`

Final PR head:

`0c83c54b2353ff5b82a4acfa7bb64e0f23635b0b`

Changed files were limited to:

- `src/services/teacherRevisionHistory.js`
- `tests/teacherRevisionHistory.test.js`
- `tests/teacherRevisionHistoryIntegrity.test.js`
- `tests/teacherRevisionHistoryUndoIntegrity.test.js`
- `docs/package-8-t4-lossless-history-undo.md`

No backend, OMR/Audiveris, Docker/Render, dependency, workflow or teacher UI file was changed.

## Review-hardening findings

T4 was not accepted merely because the first implementation compiled.

### 1. Forged correction audit semantics

A caller-constructed history could provide correction audit metadata whose parent/result IDs and fingerprints matched while the recorded operation semantics did not actually produce the result revision.

Fix:

- T4 validation replays the exact T2 operations against the exact parent through the existing correction engine;
- reproduced revision identity/lineage must match the recorded result;
- audit operation evidence, including `before`, must match;
- regression `Package 8-T4 review regression: shape-valid forged correction audit semantics are rejected` added.

### 2. Impossible current-parent/no-op undo reconstruction

An externally reconstructed history could represent an undo whose target was the current parent or had the same content as the current parent even though the T4 creator API rejects that operation.

Fix:

- history validation rejects current-parent undo targets;
- same-content/no-op targets are rejected;
- regression `Package 8-T4 review regression: reconstructed history cannot undo to its current parent` added.

Both review threads were replied to with evidence and resolved before merge.

## Exact-head CI

Required CI run #247 used the final exact PR head `0c83c54b2353ff5b82a4acfa7bb64e0f23635b0b`.

The first attempt had one failure in an existing API cancellation timing test: a queued/processing cancellation request observed provider ownership before it was available and returned 502. All deterministic T4 regressions passed in that attempt.

No code was changed for that failure. The failed job was rerun on the **same exact head SHA**.

Same-head rerun result:

- **1173 / 1173 tests PASS**
- **232 suites**
- **0 failed / skipped / cancelled**
- `npm ci`: 119 packages installed; 120 packages audited
- **0 vulnerabilities**
- production Vite build **PASS**
- T4 forged-correction-audit regression **PASS**
- T4 impossible-current-parent-undo regression **PASS**

The initial timing failure is retained as CI history and is not represented as a T4 deterministic failure.

## Protected-main merge

PR #97 was squash-merged with the expected exact head SHA.

Protected-main implementation commit:

`eaf967174d1cc0f2552cc97e7e0a6bf0a1715c64`

`main` remained protected with required check `test-and-build`.

## Exact-main CI

CI #248 / run `33177550356` checked out exact main SHA:

`eaf967174d1cc0f2552cc97e7e0a6bf0a1715c64`

Result:

- **SUCCESS**
- **1173 / 1173 tests PASS**
- **232 suites**
- **0 failed / skipped / cancelled**
- **0 vulnerabilities**
- production build **PASS**
- Vite 8.2.0; 55 modules transformed
- existing Audiveris/OMR regressions **PASS**
- Render Blueprint regressions **PASS**
- Dockerfile security regressions **PASS**
- API queued/processing cancellation regression **PASS**

The only workflow warning was the existing GitHub Actions Node.js 20 deprecation notice for `actions/checkout@v4` and `actions/setup-node@v4`, which GitHub forced to Node 24. It did not fail CI.

## Final T4 invariants

1. History never overwrites the automatic source or any prior corrected revision.
2. Every successful correction/undo extends history with a new immutable revision.
3. Historical correction, approval and undo evidence remains immutable.
4. T2 audit evidence must be semantically reproducible, not merely metadata-compatible.
5. Undo restores exact historical content by creating a new revision; it does not move a mutable pointer backward.
6. Restored content may reuse the old content fingerprint but receives new recursive lineage from the exact current parent.
7. Historical approval never silently becomes approval of the undo result.
8. Impossible current-parent/no-op undo evidence fails closed even when externally reconstructed.
9. Duplicate IDs, broken lineage, mutable/injected shapes and cross-source evidence fail closed.
10. T4 makes no persistence, authorization, concurrency, UI or deployment claim.

## Protected boundary confirmation

Package 8-T4 did not modify:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

Exact-main CI #248 confirms their existing regressions remain green.

## Status advancement

Package 8 remains **Partially implemented**.

- 8-T1 — Completed
- 8-T2 — Completed
- 8-T3 — Completed
- **8-T4 — Completed**
- **8-T5 — NEXT / Not started**
- 8-T6 — Not started
- Package 8B — separate / Not started

The next bounded implementation stage is Package 8-T5: optimistic concurrency / stale-base conflict. It must prevent silent overwrite without adding automatic musical merge, teacher UI, persistence, OMR changes or Render/deployment changes.
