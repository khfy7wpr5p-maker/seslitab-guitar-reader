# Package 8-T3 — Final Closure

Status: **Completed**  
Closure date: **2026-08-28**  
Final implementation PR: **#95**  
Final implementation head: `77f5035a85dfd6895490198d2160107b28479320`  
Protected-main code baseline: `c57966598d2d6fe34418119670bea42a9cdcf369`  
Exact-head CI: **#239 / run `33174812700` — SUCCESS**  
Exact-main CI: **#240 / run `33175019324`, job `98861276737` — SUCCESS**

## Closure decision

Package 8-T3 is closed only after two valid review-discovered replay defects were fixed and the final recursive-lineage design passed focused tests, the full repository regression suite and production build on both exact PR head and protected main.

This closure does not complete parent Package 8. T4–T6 remain unimplemented.

## Final implemented scope

PR #95 changed only:

- `src/services/teacherRevisionModel.js`
- `src/services/teacherApprovalModel.js`
- `tests/teacherRevisionModel.test.js`
- `tests/teacherApprovalModel.test.js`

No backend, persistence, UI, authentication/authorization, OMR/Audiveris, deployment, dependency or workflow code was changed.

## Final revision identity contract

T1's immutable revision schema is now **v2**.

Each revision contains deterministic content identity and recursive lineage identity:

- `contentFingerprint`
- `parentLineageFingerprint`
- `lineageFingerprint`

For an automatic revision, `parentLineageFingerprint` is `null`.

For a teacher-corrected revision:

```text
parent.lineageFingerprint
        |
        v
parentLineageFingerprint
        + current immutable revision metadata
        + current contentFingerprint
        |
        v
current lineageFingerprint
```

This creates a deterministic transitively chained version identity without requiring a persistence registry or global-ID service.

## Final approval contract

T3 teacher approval schema is **v3**.

Approval remains a separate immutable record and binds to:

1. source ID;
2. root source revision ID;
3. exact approved revision ID;
4. exact approved revision kind;
5. exact approved parent revision ID;
6. exact approved revision timestamp;
7. exact approved content fingerprint;
8. exact approved recursive lineage fingerprint.

Applicability returns only:

- `APPROVED_EXACT_REVISION`
- `NOT_APPLICABLE_TO_REVISION`

It does not return quality, authorization or sharing permission.

## Review findings that blocked premature closure

### Review finding 1 — one-hop ancestor ID reuse

The initial approval binding could be revived when a later corrected revision reused an ancestor revision ID and restored old content.

- surfaced during PR #92 docs closure review;
- PR #92 was closed unmerged;
- PR #93 hardened direct revision metadata binding.

### Review finding 2 — multi-hop ID replay

The direct-parent binding could still be reconstructed with:

```text
A0 -> R1 -> R2 (approved) -> replay R1 -> replay R2
```

The replayed R2 could recreate every schema-v2 field used by approval applicability:

- source ID;
- root source revision ID;
- revision ID;
- revision kind;
- parent revision ID;
- revision timestamp;
- content fingerprint.

- surfaced during PR #94 docs closure review;
- PR #94 was closed unmerged;
- T3 remained open;
- PR #95 moved replay resistance into the immutable revision lineage contract and bound approval schema v3 to that lineage.

## Why the final replay is rejected

Original R1's lineage is derived from A0.

Replay R1's parent is R2, therefore replay R1 necessarily receives a different `parentLineageFingerprint` and a different `lineageFingerprint`.

Replay R2 then inherits replay R1's different lineage. It can restore the old R2 ID, parent ID, timestamp and content, but it cannot reproduce original R2's recursive lineage through the normal T1 creator path.

Therefore the old R2 approval evaluates as:

`NOT_APPLICABLE_TO_REVISION`

## Focused regression evidence

Final focused tests include:

- deterministic recursive lineage identity;
- exact parent-lineage propagation;
- forged lineage metadata rejection;
- one-hop ancestor ID replay rejection;
- identical-content new revision non-inheritance;
- cross-source approval non-applicability;
- explicit multi-hop replay reconstruction attempt;
- strict approval schema and field descriptor validation;
- fail-closed malformed approval/revision inputs;
- no quality/auth/sharing claims.

Critical regression:

`multi-hop revisionId replay cannot reconstruct an approved revision`

Result:

- CI #239: **PASS**
- CI #240: **PASS**

## Exact-head acceptance evidence

PR #95 head:

`77f5035a85dfd6895490198d2160107b28479320`

CI #239:

- **1154 tests**
- **232 suites**
- **1154 pass**
- **0 fail**
- **0 skipped**
- **0 cancelled**
- npm audit: **0 vulnerabilities**
- Vite production build: **PASS**
- review threads: none at final merge gate
- branch: 0 behind protected main at merge gate

## Protected-main acceptance evidence

PR #95 was squash-merged with expected-head SHA protection.

Protected main became:

`c57966598d2d6fe34418119670bea42a9cdcf369`

Exact-main CI #240 checked out that exact SHA and verified:

- **1154 / 1154 tests PASS**
- **232 suites**
- **0 fail / skipped / cancelled**
- npm audit: **0 vulnerabilities**
- production build: **PASS**
- multi-hop replay regression: **PASS**
- recursive lineage regression: **PASS**
- existing T2 correction regressions: **PASS**
- Audiveris/OMR regressions: **PASS**
- Render Blueprint regressions: **PASS**
- Dockerfile security regressions: **PASS**

## Security interpretation

`contentFingerprint` and `lineageFingerprint` are deterministic version/drift tokens. They are not cryptographic signatures and must not be described or used as authentication or authorization credentials.

Teacher approval records audit evidence supplied by the caller. T3 does not implement identity authentication or authorization.

Quality-gate acceptance remains separate from teacher approval. Teacher approval cannot override structural/quality safety.

## Protected no-touch confirmation

T3 final hardening did **not** modify:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `backend/`;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection;
- dependencies;
- CI workflows.

## Package state after closure

- Package 8-T1: **Completed**
- Package 8-T2: **Completed**
- Package 8-T3: **Completed**
- Package 8-T4: **Not started / NEXT**
- Package 8-T5: **Not started**
- Package 8-T6: **Not started**
- Package 8B: **Not started, separate later package**
- Parent Package 8: **Partially implemented**

## Next safe stage

**Package 8-T4 only:** lossless revision/version history and undo semantics.

T4 must preserve old revisions, correction audit evidence and approval history. Undo must not silently mutate history or implicitly convert a non-applicable approval into an applicable one. T5 concurrency, T6 UI, Package 12 sharing, Package 8B Audiveris training, OMR/Audiveris changes and Render/deployment changes remain deferred.
