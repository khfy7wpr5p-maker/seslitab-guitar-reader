# SesliTab Current Status

Last documentation review: 2026-08-29  
Fresh-read protected `main`: `2a6fa9c981b85861895692df99887d46e768822e`  
Main protection: enabled; required check `test-and-build`; linear history enforced.  
Current package state: **Packages 0–11 Completed. Package 12 Partially implemented with T1–T3 merged. T4 remains a separate open PR (#138). Package 8B remains deferred/partial research.**

## Verified baseline

The current protected-main merge commit itself does not expose a separate exact-main workflow run in the GitHub Actions query used for this review. The latest verified code-equivalent implementation evidence is the successful PR #140 CI for head `2c684b7ffb1bdb4cef9e8f5b0de408800cce0534`, whose merge produced current protected `main` `2a6fa9c981b85861895692df99887d46e768822e`.

Verified PR #140 `test-and-build` evidence:

- **1411 / 1411 tests PASS**;
- **235 suites**;
- **0 failed / skipped / cancelled / todo**;
- `npm ci` PASS;
- **0 vulnerabilities**;
- Vite production build **PASS**;
- pinned ST Score Rendering Layer runtime prepared successfully;
- real-browser score render + cursor proof **PASS** using Google Chrome.

Do not describe this as an exact-main workflow run; it is the latest verified CI tied to the code merged into the current protected main.

## Open pull requests at fresh-read

### PR #138 — Package 12-T4 structural/rhythmic corrected-revision revalidation

Status: **OPEN / separate domain-security work.**

This PR is not part of Stage A UI simplification and must not be duplicated or silently merged into the UI branch. Until merged with its own green evidence, Package 12-T4 remains incomplete in protected main.

No other open PR was identified by the fresh-read used for this Stage A branch.

## Stage A — Teacher UI simplification

Status on branch `stage-a/teacher-ui-simplification`: **IMPLEMENTED, pending PR CI/merge.**

Bounded changes:

- primary app shell navigation is reduced to implemented product surfaces: **Çalışma Alanı / Nota Ara / Akort**;
- technical `Öğretmen` and `Sonuçlar` entries are removed from primary shell navigation without deleting their underlying features;
- the demo-oriented **Özellik testi** card is replaced with product language;
- teacher actions are presented as **Düzeltmeyi Kaydet / Eseri Onayla / Geri Al**;
- exact revision IDs, raw revision JSON and detailed history are moved away from the primary task into **Detaylar**;
- the current audit actor requirement is retained and renamed in user language rather than silently invented;
- teacher controls retain/receive approximately 44px mobile targets, visible focus and width-safe mobile form layout.

Not changed by Stage A:

- Package 8 revision/history/approval semantics;
- MusicXML parser/canonical model;
- quality-gate decisions;
- Package 12 sharing authorization;
- renderer contract;
- Audiveris/Render/OMR infrastructure;
- dependencies/framework.

Detailed target architecture: `docs/teacher-score-editor-architecture.md`.

## Product decision — Auto-Pass / Review / Block

Official decision recorded on 2026-08-29:

**Teacher approval is not universally mandatory.**

- **PASS:** bounded automatic consumer routing may proceed only where the existing quality/consumer gate authorizes it. User copy: **Otomatik kontrollerden geçti**.
- **REVIEW:** teacher review/correction is required for definitive downstream use. User copy: **Kontrol gerekiyor**.
- **BLOCK:** definitive downstream output remains prohibited. User copy: **Bu eserde önce düzeltilmesi gereken yapısal bir sorun bulundu.**

Invariant: `Auto-Pass != teacher-approved`.

This policy does not retroactively bypass current Package 12 approval-based sharing contracts. A safe Auto-Pass student-sharing route, if adopted, requires a separately reviewed Package 12 contract change.

## Package 10 — Advanced Violin

Status: **Completed.**

Package 10 provides bounded generated violin alternatives, double stops, simultaneous voices/staves, sustained-string locking and exact tie continuity behind the shared quality gate. Detailed contract: `docs/package-10-advanced-violin.md`.

## Package 11 — Accessible Chromatic Tuner

Status: **Completed.**

Package 11 provides a browser-local 12-note chromatic tuner with Hz/cents guidance, A4 calibration, accessible live status and local-only microphone processing. Detailed contract: `docs/package-11-chromatic-tuner.md`.

Stage K may later compact tuner presentation; microphone privacy/runtime semantics are not changed by Stage A.

## Package 12 — Teacher-to-Student Sharing

Status: **Partially implemented.**

### T1 — Exact Share Authorization

Status: **Completed.**

T1 separates explicit sharing authorization from Package 8 teacher approval and binds authorization to exact immutable revision/approval/recipient evidence.

Detailed contract: `docs/package-12-t1-share-authorization.md`.

### T2 — Exact-Revision Share Safety / Quality Eligibility

Status: **Completed.**

T2 live-rechecks exact source/provenance/quality evidence and fails closed on missing or stale evidence.

Detailed contract: `docs/package-12-t2-share-quality-eligibility.md`.

### T3 — Bounded Teacher-Corrected Revalidation / Provenance

Status: **Completed.**

T3 establishes bounded post-correction evidence for its supported pitch/position correction set without pretending that the original raw MusicXML contains the teacher edit. Unsupported structural/rhythmic correction classes fail closed.

Detailed contract: `docs/package-12-t3-corrected-revalidation.md`.

### T4 — Structural/Rhythmic Post-Correction Revalidation

Status: **Not merged; open PR #138.**

T4 is expected to cover correction classes intentionally excluded from T3. Its implementation and CI must be reviewed independently from Stage A before protected-main status changes.

## Package 8B — deferred research state

Package 8B remains **Partially implemented** research and does not block the product UI branch.

Do not fabricate sample approval, native mask/interline evidence, acceptance receipts, training results or production model changes.

## UI / renderer GAP summary at this baseline

- App shell before Stage A was technical/demo-oriented: **teacher/results** were primary navigation items and **Özellik testi** exposed implementation readiness.
- Package 8 UI safely supported revision/correction/approval/undo, but exposed actor label, exact revision IDs, raw JSON and revision-selection language as primary workflow.
- Score view currently has a real rendered score and canonical measure cursor; a verified note-level hit-test/stable note-selection contract is not yet present.
- Quality overlay on rendered notes is not implemented.
- Visual bounded pitch/accidental/octave/duration editor is not implemented.
- Single-action safe undo UI is not complete; immutable domain undo exists.
- REVIEW provisional playback is not implemented as a distinct product route.
- Guitar TAB and violin already have quality-gated consumer behavior but need later PASS/REVIEW/BLOCK product routing integration.
- Discovery exists as a bounded source-finding surface and is not a verification authority.
- Tuner behavior is implemented but compact product presentation belongs to Stage K.
- Package 12 has no complete auth/persistence/network delivery product; UI must not claim otherwise.

## Next safe UI stage after Stage A

**Stage B — Score renderer runtime stabilization and responsive scaling**, only after Stage A focused/full tests, production build and required CI are green.

Stage B must:

1. reproduce any real score runtime failure, including the reported `Invalid note initialization object: {}` symptom if it still occurs;
2. identify the true source rather than fabricate missing note semantics;
3. improve responsive score sizing/controlled overflow for iPhone Safari;
4. preserve the renderer's presentation-only authority;
5. avoid any cross-repository contract change unless separately reported and approved.

Stage C note hit-test/stable identity work may require a fresh-read of `st-score-rendering-layer`; no such contract change is authorized by Stage A.

## Protected OMR and deployment boundary

Stage A and later UI stages must not silently change production Audiveris provider/runtime/preflight, OMR worker/provider selection, Cloud OMR Gateway, backend production OMR path, `Dockerfile`, `render.yaml`, Render service/deployment connection, Package 8B research/training state or production model selection/replacement.
