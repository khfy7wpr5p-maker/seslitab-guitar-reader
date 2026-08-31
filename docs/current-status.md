# SesliTab Current Status

Last documentation review: 2026-08-31
Fresh-read protected main: e40e3b3e8d9029673efd780d44c6eefe34ba1e18
Observed branch metadata: main protected; required check test-and-build.
Open PRs/issues at fresh-read: none identified.

## Current production result

Stage A–L bounded product roadmap production main üzerinde tamamlanmıştır. Bu ifade yalnız uygulanan bounded capability'leri kapsar; evrensel müzikal doğruluk, kaynak görüntüyle birebirlik veya authenticated öğrenci teslimatı anlamına gelmez.

## Verification baseline

Fresh local verification with Node 24:

- npm ci: PASS
- npm test: 1519/1519 tests, 236 suites, 0 failed/skipped/cancelled/todo
- npm run build: PASS
- node scripts/verifyScoreRuntimeBrowser.js: UNVERIFIED locally because Chrome/Chromium is not installed

The protected CI workflow is test-and-build; it runs dependency installation, the full test suite, production build and the real-browser proof script. The current exact-main docs-only commit had no separate workflow run/status exposed by the available connector query, so old PR runs are not presented as an exact-main run.

## Stage A–L production matrix

| Stage | Production status | Bounded capability |
|---|---|---|
| A — Teacher UI simplification | PRODUCTION | Teacher task-oriented shell, simplified copy, grouped technical details and accessible controls |
| B — Score runtime stabilization | PRODUCTION | Pinned renderer preparation, lifecycle cleanup, fail-closed retry and narrow-browser handling |
| C — Measure/note selection | PRODUCTION / BOUNDED | Exact canonical measure/note selection with renderer hit-test/highlight bridge |
| D — Quality overlay | PRODUCTION / BOUNDED | Exact-report-backed PASS/REVIEW/BLOCK and finding presentation |
| E — Visual bounded note editor | PRODUCTION / BOUNDED | Teacher intent edits limited to step/alter/octave/durationValue |
| F — Undo/revalidation/rerender | PRODUCTION / BOUNDED | Immutable undo, canonicalization, corrected MusicXML materialization and product-local revalidation |
| G — Product routing | PRODUCTION / BOUNDED | Existing consumer gate mapping to PASS/REVIEW/BLOCK |
| H — Review playback | PRODUCTION / BOUNDED | Explicit non-definitive REVIEW preview or withheld playback |
| I — Guitar TAB/Violin integration | PRODUCTION / BOUNDED | PASS-gated existing Guitar TAB and violin consumer actions |
| J — Discovery presentation | PRODUCTION / BOUNDED | Source-finding presentation, trust notice and safe external source actions |
| K — Compact tuner | PRODUCTION / BOUNDED | Compact accessible UI with explicit local microphone start/stop |
| L — Student/share readiness | PRODUCTION / BOUNDED | Exact-revision Package 12 readiness UI; delivery remains BLOCKED_BY_CONTRACT |

Detailed matrix and primary files: docs/teacher-score-editor-architecture.md.

## Package 12 boundary

T1 exact share authorization, T2 exact-revision quality eligibility, T3 bounded corrected pitch/position revalidation and T4 bounded structural/rhythmic revalidation are production contracts. Stage L evaluates the applicable existing contract and returns readiness only.

The following remain separate:

- teacher approval;
- exact revision identity;
- revalidation;
- share eligibility;
- share authorization/readiness;
- actual student delivery.

READY_EXACT_REVISION != DELIVERED_TO_STUDENT.

Stage L always keeps deliveryState=not_implemented and deliveryAllowed=false. It creates no authenticated account, persistent grant, token, URL, payload or network delivery.

## Quality and renderer boundaries

PASS is granted only by an exact consumer gate that explicitly authorizes allowed, definitive and automatic use. REVIEW remains non-definitive; BLOCK cannot proceed to a definitive downstream consumer. Teacher approval is not the same as quality routing.

The renderer is a presentation/interaction layer. It does not own canonical musical meaning, quality decisions, correction, teacher approval or sharing authority. Discovery is source finding, not source or musical verification.

## Research and out-of-scope state

Package 8B remains research-only: no genuine admitted training corpus, executed Audiveris training run or production model replacement is claimed. Authenticated student accounts, persistent student identity, backend/cloud delivery, permanent share authorization, share token/URL, student portal, cloud persistence and server-side authorization require a separate security/application program. They are not unfinished Stage L work.

## Protected infrastructure

Without a separately reviewed change, preserve the production Audiveris provider/runtime/preflight, OMR worker/provider selection, Cloud OMR Gateway, backend OMR path, Docker/Render wiring, framework, dependencies and public API contracts.
