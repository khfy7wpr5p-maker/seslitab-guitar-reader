# SesliTab Current Status

Last documentation review: 2026-08-28  
Latest verified protected `main`: `c57966598d2d6fe34418119670bea42a9cdcf369`  
Latest exact-main CI: **#240 / run `33175019324`, job `98861276737` — SUCCESS**  
Current package state: **Package 8 — Partially implemented; 8-T1, 8-T2 and 8-T3 Completed.**  
Next safe implementation stage: **Package 8-T4 — lossless undo/version history.**

This file is a concise orientation document. Source code, tests, protected-main state and fresh GitHub Actions evidence remain authoritative.

## Verified current baseline

Exact-main CI #240 on `c57966598d2d6fe34418119670bea42a9cdcf369` verified:

- **1154 / 1154 tests PASS**
- **232 suites**
- **0 failed / skipped / cancelled**
- `npm ci`: 119 packages installed; 120 packages audited
- **0 vulnerabilities**
- Vite 8.2.0 production build **PASS**
- 55 modules transformed
- T3 multi-hop revision-ID replay regression **PASS**
- T1 recursive-lineage regression **PASS**
- existing Audiveris/OMR, Render Blueprint and Dockerfile security regressions **PASS**

`main` remains protected and the required status check is `test-and-build`.

## Verified product foundations

Packages 0–7 remain Completed and provide the established foundations for PDF/OMR handling, MusicXML security, canonical note/time data, structural and quality validation, Turkish rhythmic text/TTS/playback, MIDI, Basic Guitar TAB, Basic Violin, and source-only MusicXML harmony/chord presentation.

Structural validity, source verification, quality-gate acceptance and teacher approval remain separate concepts.

## Package 8 current state

### 8-T1 — immutable revision domain

Status: **Completed.**

The original bounded T1 closure remains PR #86 → protected-main `218c3e18eed3a82861a4a1c24efd5458445ea9ca` → exact-main CI #222 SUCCESS.

During T3 security hardening, the revision schema was deliberately upgraded from v1 to **v2** without changing the T1 mutation model. It now also carries:

- `parentLineageFingerprint`;
- deterministic recursive `lineageFingerprint`.

Each corrected revision derives its lineage token from the exact parent lineage plus its own immutable identity metadata and content fingerprint. This prevents a later multi-hop replay from reconstructing an earlier revision merely by reusing revision IDs, timestamps and content.

The lineage token is a deterministic drift/version identity, **not** a cryptographic signature or authorization credential.

### 8-T2 — controlled teacher correction operations

Status: **Completed.**

T2 remains unchanged in behavior:

- bounded `replace_value` operations only;
- existing paths only;
- parent revision never overwritten;
- every accepted correction creates a new immutable revision;
- separate immutable correction audit event;
- duplicate/overlapping/no-op/unsafe/prototype-sensitive corrections fail closed;
- correction does not imply approval.

Original closure: PR #89 → protected-main `f6d80b4614654ee63a4fd2d51101e4961476a1ee` → exact-main CI #230 SUCCESS.

T2 regressions remain green on exact-main CI #240 after T1 schema-v2 lineage hardening.

### 8-T3 — exact-revision teacher approval binding/invalidation

Status: **Completed.**

Final verified contract:

- approval is a separate immutable record, never a mutable field on revision content;
- approval schema is **v3**;
- approval binds to exact source/root-source identity, revision ID/kind, parent revision ID, revision timestamp, content fingerprint and **recursive lineage fingerprint**;
- a later revision does not inherit an older approval;
- a historical approval record is not mutated when it becomes non-applicable;
- approval does not override quality safety and does not authorize student sharing;
- actor identity is caller-supplied audit evidence; authentication/authorization remains separate.

### T3 review-hardening history

T3 was not accepted at the first green build. Review gates found two valid replay cases and both were fixed before final closure:

1. **PR #92 review:** one-hop ancestor revision-ID reuse could revive a schema-v1 approval. PR #92 was not merged. PR #93 hardened approval binding to schema v2.
2. **PR #94 review:** schema v2 could still be reconstructed with a multi-hop replay: `A0 -> R1 -> R2 (approved) -> replay R1 -> replay R2`. PR #94 was not merged.
3. **PR #95 final hardening:** T1 schema v2 recursive lineage + T3 approval schema v3 lineage binding closes the multi-hop replay path.

Final evidence:

- PR #95 final head: `77f5035a85dfd6895490198d2160107b28479320`
- exact-head CI #239 / run `33174812700`: **SUCCESS**
- exact-head tests: **1154/1154 PASS**, 232 suites, 0 fail/skipped/cancelled
- audit: **0 vulnerabilities**
- production build: **PASS**
- protected-main squash merge: `c57966598d2d6fe34418119670bea42a9cdcf369`
- exact-main CI #240 / run `33175019324`, job `98861276737`: **SUCCESS**
- exact-main: **1154/1154 PASS**, 232 suites, 0 vulnerabilities, build PASS
- regression `multi-hop revisionId replay cannot reconstruct an approved revision`: **PASS**
- detailed closure: `docs/package-8-t3-closure.md`

### Remaining Package 8 stages

- **8-T4 — Not started / NEXT:** lossless undo/version history.
- **8-T5 — Not started:** optimistic concurrency / stale-base conflict.
- **8-T6 — Not started:** accessible teacher UI.

Package 8 therefore remains **Partially implemented**, not Completed.

## Separate later roadmap package

**Package 8B — Audiveris training dataset** remains Not started and separate from Package 8-T1..T6. It must not be started as part of T4.

## Protected OMR and Render boundary

Package 8 work must not modify without separate explicit authorization:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

PR #95 changed only the teacher revision/approval domain and focused tests. Exact-main CI #240 confirms the existing OMR/Audiveris, Render Blueprint and Dockerfile security regressions remain green.

## Current safe next step

The next implementation stage is **8-T4 only**: lossless revision/version history and undo semantics. T4 must preserve immutable T1/T2/T3 evidence rather than rewriting old revisions or approvals. It must not yet add optimistic concurrency, teacher UI, student sharing, Audiveris training, OMR changes or Render/deployment changes.
