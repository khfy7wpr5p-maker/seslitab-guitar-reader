# SesliTab Current Status

Last documentation review: 2026-08-28  
Latest verified protected `main` implementation baseline: `eaf967174d1cc0f2552cc97e7e0a6bf0a1715c64`  
Latest exact-main implementation CI: **#248 / run `33177550356`, job `98869988554` — SUCCESS**  
Current package state: **Package 8 — Partially implemented; 8-T1, 8-T2, 8-T3 and 8-T4 Completed.**  
Next safe implementation stage: **Package 8-T5 — optimistic concurrency / stale-base conflict.**

This file is a concise orientation document. Source code, tests, protected-main state and fresh GitHub Actions evidence remain authoritative. The documentation-only closure PR that carries this file does not change the T4 implementation baseline above.

## Verified current baseline

Exact-main CI #248 on `eaf967174d1cc0f2552cc97e7e0a6bf0a1715c64` verified:

- **1173 / 1173 tests PASS**
- **232 suites**
- **0 failed / skipped / cancelled**
- `npm ci`: 119 packages installed; 120 packages audited
- **0 vulnerabilities**
- Vite 8.2.0 production build **PASS**
- 55 modules transformed
- T4 lossless history/undo regressions **PASS**
- T4 forged correction-audit replay regression **PASS**
- T4 reconstructed current-parent undo regression **PASS**
- T3 multi-hop revision-ID replay regression **PASS**
- existing Audiveris/OMR, Render Blueprint and Dockerfile security regressions **PASS**

`main` remains protected and the required status check is `test-and-build`.

## Verified product foundations

Packages 0–7 remain Completed and provide the established foundations for PDF/OMR handling, MusicXML security, canonical note/time data, structural and quality validation, Turkish rhythmic text/TTS/playback, MIDI, Basic Guitar TAB, Basic Violin, and source-only MusicXML harmony/chord presentation.

Structural validity, source verification, quality-gate acceptance and teacher approval remain separate concepts.

## Package 8 current state

### 8-T1 — immutable revision domain

Status: **Completed.**

The original bounded T1 closure remains PR #86 → protected-main `218c3e18eed3a82861a4a1c24efd5458445ea9ca` → exact-main CI #222 SUCCESS.

During T3 security hardening, the revision schema was deliberately upgraded from v1 to **v2** without changing the T1 mutation model. It carries:

- `parentLineageFingerprint`;
- deterministic recursive `lineageFingerprint`.

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

### 8-T3 — exact-revision teacher approval binding/invalidation

Status: **Completed.**

Final verified contract:

- approval is a separate immutable record, never a mutable field on revision content;
- approval schema is **v3**;
- approval binds exact source/root source, revision metadata, content fingerprint and recursive lineage fingerprint;
- a later or replayed revision does not inherit an older approval;
- historical approval evidence remains immutable;
- approval does not override quality safety and does not authorize student sharing.

Final T3 hardening: PR #95 → implementation main `c57966598d2d6fe34418119670bea42a9cdcf369` → exact-main CI #240 SUCCESS. Detailed evidence: `docs/package-8-t3-closure.md`.

### 8-T4 — lossless revision history and undo

Status: **Completed.**

T4 adds `src/services/teacherRevisionHistory.js` as a pure, immutable domain layer over T1/T2/T3 evidence.

Verified behavior:

- automatic revision is preserved as immutable history root;
- corrected revisions are appended linearly and must extend the exact current revision;
- revision IDs and recursive lineage identities are unique within one history;
- every non-root revision has exactly one correction or undo transition event;
- T2 correction audit evidence is replayed against the exact parent before history accepts it;
- T3 approval records remain immutable historical evidence bound to exact preserved revisions;
- undo never deletes or rewrites history;
- undo restores historical content by creating a **new corrected revision** from the current parent;
- restored content may reuse a historical `contentFingerprint`, but receives a new recursive `lineageFingerprint`;
- an old approval is therefore not resurrected by undo;
- malformed, non-linear, duplicate, cross-source, mutable or forged history evidence fails closed;
- T4 does not implement persistence, concurrency or UI.

Review hardening before merge closed two valid integrity findings:

1. correction audit operations are now deterministically replayed, so a shape-valid forged `before` value cannot be preserved as truthful history;
2. reconstructed history cannot represent the current parent or same-content current state as a valid undo target.

Final code evidence:

- PR #97 final head: `0c83c54b2353ff5b82a4acfa7bb64e0f23635b0b`
- exact-head CI #247 / run `33177095707`: first attempt hit one unrelated existing API cancellation timing flake; **same exact head rerun SUCCESS**
- same-head rerun: **1173/1173 PASS**, 232 suites, 0 vulnerabilities, build PASS
- protected-main squash merge: `eaf967174d1cc0f2552cc97e7e0a6bf0a1715c64`
- exact-main CI #248 / run `33177550356`, job `98869988554`: **SUCCESS**
- exact-main: **1173/1173 PASS**, 232 suites, 0 vulnerabilities, build PASS
- detailed closure: `docs/package-8-t4-closure.md`

### Remaining Package 8 stages

- **8-T5 — Not started / NEXT:** optimistic concurrency / stale-base conflict.
- **8-T6 — Not started:** accessible teacher UI.

Package 8 therefore remains **Partially implemented**, not Completed.

## Separate later roadmap package

**Package 8B — Audiveris training dataset** remains Not started and separate from Package 8-T1..T6. It must not be started as part of T5.

## Protected OMR and Render boundary

Package 8 work must not modify without separate explicit authorization:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

PR #97 changed only the teacher history/undo domain, focused tests and its T4 contract document. Exact-main CI #248 confirms the existing OMR/Audiveris, Render Blueprint and Dockerfile security regressions remain green.

## Current safe next step

The next implementation stage is **8-T5 only**: bounded optimistic concurrency / stale-base conflict handling over the verified T4 immutable history contract. T5 must fail closed on stale expected history/revision state rather than silently overwrite a newer revision. It must not yet add teacher UI, student sharing, Audiveris training, OMR changes or Render/deployment changes.
