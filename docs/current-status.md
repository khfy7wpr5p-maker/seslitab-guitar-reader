# SesliTab Current Status

Last documentation review: 2026-08-28  
Latest verified protected `main`: `95f11139929d1e3d65bd6c295794c316bb04ca84`  
Latest exact-main CI: **#237 / `33165513082`, job `98829856646` — SUCCESS**  
Current package state: **Package 8 — Partially implemented; 8-T1, 8-T2 and 8-T3 Completed.**  
Next safe implementation stage: **Package 8-T4 — undo/version history.**

This file is a concise orientation document. Source code, tests, protected-main state and fresh GitHub Actions evidence remain authoritative.

## Verified current baseline

Exact-main CI #237 on `95f11139929d1e3d65bd6c295794c316bb04ca84` verified:

- **1151 / 1151 tests PASS**
- **232 suites**
- **0 failed / skipped / cancelled**
- `npm ci`: 119 packages installed; 120 packages audited
- **0 vulnerabilities**
- Vite 8.2.0 production build **PASS**
- 55 modules transformed
- Package 8-T3 ancestor-revision-ID reuse regression **PASS**
- existing Audiveris/OMR, Render Blueprint and Dockerfile security regressions **PASS**

`main` remains protected and the required status check is `test-and-build`.

## Verified product foundations

Packages 0–7 remain completed and provide the established foundations for:

- PDF upload and safe OMR job handling;
- the existing Cloud OMR Gateway and Audiveris provider/runtime path;
- file, multipart, API and MusicXML security;
- canonical `NoteObject` pitch/time/source-verification data;
- structural/rhythmic validation and quality/error reporting;
- fail-closed `ACCEPT` / `REVIEW` / `BLOCK` quality gates;
- isolated OMR benchmark/evidence framework;
- Turkish rhythmic text and Rhythmic HTML;
- Turkish TTS and Web Audio playback;
- canonical measure selection and selected-measure TTS/playback;
- deterministic SMF0 MIDI export;
- conservative quality-gated Basic Guitar TAB;
- conservative quality-gated Basic Violin first-position guidance;
- source-only MusicXML `<harmony>` parsing, chord presentation and Turkish chord TTS.

Structural validity, source verification, quality-gate acceptance and teacher approval remain separate concepts.

## Package 8 current state

### 8-T1 — immutable revision domain

Status: **Completed.**

T1 provides immutable automatic and teacher-corrected revisions, exact parent/root-source lineage, deterministic content fingerprints, strict frozen plain-data snapshots and fail-closed revision validation. Approval fields cannot be injected into a valid revision.

Evidence:

- PR #86
- final feature head: `db32b9e24d4033fe308ab9b2fe7cdefb74ec593b`
- exact-head CI #221: SUCCESS
- protected-main merge: `218c3e18eed3a82861a4a1c24efd5458445ea9ca`
- exact-main CI #222: SUCCESS
- closure: `docs/package-8-t1-closure.md`

### 8-T2 — controlled teacher correction operations

Status: **Completed.**

T2 provides bounded `replace_value` corrections on existing paths only, creates a new immutable corrected revision, preserves the parent revision, and emits a separate immutable correction audit event. Correction does not imply approval.

Evidence:

- PR #89
- final review-hardened head: `c47ce6ba259e50bee8c71453c044650538535a14`
- exact-head CI #229: SUCCESS
- protected-main merge: `f6d80b4614654ee63a4fd2d51101e4961476a1ee`
- exact-main CI #230: SUCCESS
- closure: `docs/package-8-t2-closure.md`

T2 review hardening canonicalizes `-0`/`0` as one array target and rejects unsupported primitive audit data.

### 8-T3 — exact-revision teacher approval binding

Status: **Completed after review hardening.**

T3 represents teacher approval as a separate immutable record; it does not mutate revision content or convert quality-gate `ACCEPT` into approval.

Final safe approval schema: **v2**.

Approval applicability binds to the exact immutable revision using:

1. `sourceId`
2. root `sourceRevisionId`
3. exact `revisionId`
4. exact `revisionKind`
5. exact `parentRevisionId`
6. exact revision `createdAt`
7. exact `contentFingerprint`

The initial PR #91 implementation passed CI but its four-dimension binding was not accepted as final closure. During docs-closure PR #92 review, a valid P1 was found: a later revision could reuse an intermediate ancestor `revisionId`, restore the ancestor content and potentially revive the older approval.

PR #92 was therefore closed without merge. PR #93 hardened the approval schema to v2 by including immutable revision kind, parent lineage and revision timestamp in the binding. The regression explicitly verifies:

```text
A0 -> R1 approved -> R2 -> later R1 id reused + old content + old timestamp
```

The later record is **NOT_APPLICABLE_TO_REVISION** because its parent lineage differs. The original R1 remains approved and the historical approval record is not mutated.

Final evidence:

- initial implementation PR #91, head `d1805c054e490e71e3d266471ad158defbcd49e1`
- initial exact-head CI #233: SUCCESS
- initial main `70a02589206eeea9c3defec4d5f544e9222cbe3a`
- initial exact-main CI #234: SUCCESS
- review finding surfaced during superseded docs PR #92; PR #92 closed unmerged
- hardening PR #93, final head `ee215d3c1d53e2bb7a7323387c02a79223643e46`
- exact-head CI #236 / run `33165415557`, job `98829539401`: SUCCESS
- final protected-main T3 commit: `95f11139929d1e3d65bd6c295794c316bb04ca84`
- exact-main CI #237 / run `33165513082`, job `98829856646`: SUCCESS
- **1151/1151 tests, 232 suites, 0 fail/skipped/cancelled**
- **0 vulnerabilities**
- production build: **PASS**
- 15 focused T3 tests: **PASS**
- closure: `docs/package-8-t3-closure.md`

T3 still does not implement authentication/authorization, persistence, history/undo, concurrency, teacher UI or student sharing.

### Remaining Package 8 stages

- **8-T4 — Not started / NEXT:** lossless undo/version history.
- **8-T5 — Not started:** optimistic concurrency / stale-base conflict.
- **8-T6 — Not started:** accessible teacher UI.

Package 8 therefore remains **Partially implemented**, not Completed.

## Separate later roadmap package

**Package 8B — Audiveris training dataset** remains Not started and separate from Package 8-T1..T6. It must not be started as part of T4.

## Protected OMR and Render boundary

Current Package 8 work must not modify unless separately and explicitly authorized:

- Audiveris provider/runtime/preflight;
- OMR worker/provider selection;
- Cloud OMR Gateway;
- production OMR path;
- `Dockerfile`;
- `render.yaml`;
- current Render service/deployment connection.

Package 8-T1/T2/T3 did not modify these areas. Exact-main CI #237 passed the existing Audiveris/OMR, Render Blueprint and Dockerfile security regressions.

## Current safe next step

The next implementation stage is **8-T4 only**, but it is **not started** by this closure. T4 must provide lossless undo/version-history semantics above the existing immutable revision/correction/approval records. Historical revisions, correction audit evidence and approval records must not be overwritten or deleted, and undo must not silently invent or restore teacher approval. T4 must remain separate from T5 concurrency, T6 UI, Package 12 sharing, Package 8B training data, OMR/Audiveris and Render/deployment changes.
