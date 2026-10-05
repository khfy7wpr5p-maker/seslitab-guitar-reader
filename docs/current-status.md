# SesliTab Current Status

Last documentation review: 2026-09-02
Protected production `main`: `a21c1533b919554dd00d0f9852ab865b52e8f475`
Required check: `test-and-build`.
Live production: `https://seslitab-app.onrender.com`
Observed live Render deploy: `dep-dabs5h0u01pc73f0utp0`, exact commit `a21c1533b919554dd00d0f9852ab865b52e8f475`.

## Current production result

Stage A–L bounded product roadmap production `main` üzerinde tamamlanmıştır. Buna ek olarak `SESLITAB-EDITOR-INTEGRATION-01` programında STI-00–16 production `main` üzerinde uygulanmış ve post-merge CI ile doğrulanmıştır.

Bu ifade yalnız uygulanmış bounded capability'leri kapsar; evrensel müzikal doğruluk, kaynak görüntüyle birebirlik, authenticated öğrenci teslimatı veya fiziksel iPhone/Safari acceptance sertifikasyonu anlamına gelmez.

Integration progress: **17/19**.

- STI-00–16: production code + required CI evidence complete.
- STI-17: **PENDING_HUMAN_DEVICE_GATE** — physical iPhone Safari, tracked by issue #191.
- STI-18: documentation/runtime-manifest synchronization may be prepared autonomously, but final production acceptance must not be marked complete until STI-17 passes.

Machine-readable integration snapshot: `docs/sti-18-runtime-integration-manifest.json`.

## Current pinned runtime baseline

SesliTab production build prepares and verifies these exact upstream sources:

- ST Score Rendering Layer: `a8961e0e68a950cbe980162e23c09f23f0ce5d0a`
  - contract `0.2.0`
  - OSMD `2.1.2`
  - required runtime features: `hitTestNoteDetailed`, `renderEpoch`
- ST Score Editor Core: `2e6b975b4b6b8b558593ca43132309848dc3ccab`
  - browser contract `ST_SCORE_EDITOR_CORE_BROWSER_BUNDLE`
  - browser/runtime version `1.0.0`
  - global `STScoreEditorCoreRuntime`
  - manifest bytes/SHA-256 must match; external imports and network/persistence/server-revision/approval/publication authority remain disabled.

Build entrypoints are `scripts/prepareScoreRuntime.js` and `scripts/prepareEditorRuntime.js`.

The older `docs/sti-01-02-runtime-authority-baseline.json` remains historical baseline evidence. It is not rewritten to pretend that its original observation date contained later integrations.

## Editor / renderer authority

The production editor-renderer path is bounded by these authorities:

- new SMuFL keypad mutation authority: **ST Score Editor Core only**;
- SesliTab Package 8 remains immutable product revision/audit authority;
- renderer authority: presentation, lifecycle and exact hit-test only;
- renderer does not mutate canonical score;
- legacy dual-write is forbidden;
- DOM/SVG identity, nearest-note, pitch-nearest and geometry/proximity fallback are forbidden;
- a stale, ambiguous or unprovable target fails closed.

Current interaction chain:

```text
physical tap
→ renderer hitTestNoteDetailed
→ current renderEpoch + source validation
→ ScoreNoteRef
→ exact Editor manifest token
→ Editor semantic selection
→ SMuFL keypad action
→ one Editor commit
→ MusicXML materialization
→ SesliTab structural revalidation
→ one immutable Package 8 product revision
→ rerender with fresh renderer correlation
→ exact surviving selection rebind or safe clear
```

## Advanced edit boundaries

Advanced keypad actions do not infer musical endpoints:

- tie/slur require exactly two explicit revision-bound note endpoints;
- triplet requires exactly three consecutive revision-bound `EVENT_RANGE` addresses inside one exact measure voice with canonical timing evidence;
- triplet removal/transformation that would require canonical onset/duration retiming is not implemented and fails closed;
- source-existing or current notation that cannot be represented from exact evidence is never invented or reconstructed by proximity.

## Current revision, quality, routing and recovery

- Ordinary direct note tap does not require a quality marker.
- Quality markers, where exact identity exists, feed the same current selection model.
- Source quality evidence is not silently cloned onto a corrected revision.
- Guitar TAB and Violin product routing is recomputed for the current revision; insufficient evidence remains REVIEW/BLOCK and the gate reason is exposed.
- Playback remains governed by its own playback policy and is not disabled merely because renderer/editor readiness is unavailable.
- Renderer-only recovery prefers the current revalidated product MusicXML, does not rerun OMR, creates fresh renderer correlation and rebinds highlight only if the exact selection still survives.

## Mobile/accessibility evidence

STI-16 production evidence includes:

- VoiceOver-oriented labels and disabled-state descriptions for keypad controls;
- minimum 44px covered keypad targets;
- safe-area and narrow-landscape bounds;
- focus retention across keypad busy/ready DOM replacement;
- supporting real-Chrome device-metrics regression at exact `320x568`, `568x320` and `1280x900` viewports;
- eight repeated exact selection → edit → revalidation → rerender/focus → immutable undo cycles.

This supporting Chrome evidence **does not close STI-17**. Physical iPhone Safari remains a separate human-device acceptance gate.

## Verification baseline

Production `main` commit `a21c1533b919554dd00d0f9852ab865b52e8f475` passed post-merge CI run #527.

The protected `test-and-build` workflow passed:

- full Node test suite;
- production build;
- score runtime real-browser proof;
- PR-C keypad browser proof;
- PR-D Editor→product pipeline browser proof;
- PR-E quality/routing/recovery coexistence browser proof;
- PR-F accessibility/mobile regression browser proof.

## Stage A–L production matrix

| Stage | Production status | Bounded capability |
|---|---|---|
| A — Teacher UI simplification | PRODUCTION | Teacher task-oriented shell, simplified copy, grouped technical details and accessible controls |
| B — Score runtime stabilization | PRODUCTION | Pinned renderer preparation, lifecycle cleanup, fail-closed retry and narrow-browser handling |
| C — Measure/note selection | PRODUCTION / BOUNDED | Exact canonical measure/note selection with renderer hit-test/highlight bridge |
| D — Quality overlay | PRODUCTION / BOUNDED | Exact-report-backed PASS/REVIEW/BLOCK and finding presentation |
| E — Visual/editor integration | PRODUCTION / BOUNDED | Exact current selection plus Editor Core SMuFL keypad; unsupported/ambiguous targets fail closed |
| F — Undo/revalidation/rerender | PRODUCTION / BOUNDED | Immutable product history, exact MusicXML materialization/revalidation, rerender and safe rebind |
| G — Product routing | PRODUCTION / BOUNDED | Current-revision consumer gate mapping to PASS/REVIEW/BLOCK |
| H — Review playback | PRODUCTION / BOUNDED | Playback remains a separate bounded policy; renderer/editor readiness is not its authority |
| I — Guitar TAB/Violin integration | PRODUCTION / BOUNDED | Current-revision quality-gated Guitar TAB and violin consumer actions |
| J — Discovery presentation | PRODUCTION / BOUNDED | Source-finding presentation, trust notice and safe external source actions |
| K — Compact tuner | PRODUCTION / BOUNDED | Compact accessible UI with explicit local microphone start/stop |
| L — Student/share readiness | PRODUCTION / BOUNDED | Exact-revision Package 12 readiness UI; delivery remains BLOCKED_BY_CONTRACT |

Detailed architecture: `docs/teacher-score-editor-architecture.md`.

## Package 12 boundary

T1 exact share authorization, T2 exact-revision quality eligibility, T3 bounded corrected pitch/position revalidation and T4 bounded structural/rhythmic revalidation are production contracts. Stage L evaluates the applicable existing contract and returns readiness only.

The following remain separate:

- teacher approval;
- exact revision identity;
- revalidation;
- share eligibility;
- share authorization/readiness;
- actual student delivery.

`READY_EXACT_REVISION != DELIVERED_TO_STUDENT`.

Stage L always keeps `deliveryState=not_implemented` and `deliveryAllowed=false`. It creates no authenticated account, persistent grant, token, URL, payload or network delivery.

## Quality and renderer boundaries

PASS is granted only by an exact consumer gate that explicitly authorizes allowed, definitive and automatic use. REVIEW remains non-definitive; BLOCK cannot proceed to a definitive downstream consumer. Teacher approval is not the same as quality routing.

The renderer is a presentation/interaction layer. It does not own canonical musical meaning, quality decisions, correction, teacher approval or sharing authority. Discovery is source finding, not source or musical verification.

## Research and out-of-scope state

Package 8B remains research-only: no genuine admitted training corpus, executed Audiveris training run or production model replacement is claimed. Authenticated student accounts, persistent student identity, backend/cloud delivery, permanent share authorization, share token/URL, student portal, cloud persistence and server-side authorization require a separate security/application program. They are not unfinished Stage L work.

## Protected infrastructure

Without a separately reviewed change, preserve the production Audiveris provider/runtime/preflight, OMR worker/provider selection, Cloud OMR Gateway, backend OMR path, Docker/Render wiring, framework, dependencies and public API contracts.
