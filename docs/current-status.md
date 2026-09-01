# SesliTab Current Status

Last documentation review: 2026-09-01
STI-01/02 branch base: `4bb5ae76a63935fd6ec7f827e3b7fc7dc4d548ed`
Observed branch metadata at start: `main` protected; required check `test-and-build`.

## Current production result

Stage A–L bounded product roadmap production main üzerinde tamamlanmıştır. Bu ifade yalnız uygulanan bounded capability'leri kapsar; evrensel müzikal doğruluk, kaynak görüntüyle birebirlik veya authenticated öğrenci teslimatı anlamına gelmez.

## S12 mobile-score acceptance baseline

S12 accepted the renderer revision
`5ac49bf5483fe6ab0d4ba0cbd09978054ff8af4f` for the then-current exact mobile note-hit bridge. Pointer, Touch and synthetic click delivery resolve only through:

```text
renderer hit-test → exact ScoreNoteRef → canonical note resolver → S06 selection
```

There is no nearest-note, pitch-label, SVG-proximity or DOM-element fallback.
If identity cannot be proven, selection and editing remain unchanged. The mobile
toolbar projects an already verified S06/S07 selection only; it does not create
musical, revision, quality, approval or routing truth.

This is production code and CI evidence, not a claim that the final JSON 3
physical iPhone/Safari acceptance has been completed. The final real-device gate
remains STI-17.

## STI-01/02 integration baseline

The JSON 3 integration branch repins the exact ST Score Rendering Layer source to
`a8961e0e68a950cbe980162e23c09f23f0ce5d0a`, contract `0.2.0`, OSMD `2.1.2`.
Runtime admission additionally verifies that the built artifact contains the
reviewed `hitTestNoteDetailed` and `renderEpoch` surfaces. Consumption of the
detailed hit result remains STI-04 and is not enabled early by STI-01/02.

The same production build preparation path now admits ST Score Editor Core only
from exact source revision `b9fcad22568c55184aab5d3e345f74f1c8dc311e`.
The browser bundle's upstream manifest, byte size and SHA-256 must match exactly;
network, persistence, server-revision, approval and publication authority must
all remain disabled.

STI-02 freezes the new keypad authority before any keypad UI is wired:

- new keypad mutation authority: ST Score Editor Core only;
- renderer mutation authority: none;
- legacy SesliTab keypad dual-write: forbidden;
- Package 8 remains SesliTab product revision/audit authority;
- Package 3 and Package 8 must match exact `sourceId`, `sourceRevisionId`,
  `revisionId` and `contentFingerprint` before Editor initialization;
- Editor document/revision/parent revision must match the bound SesliTab
  revision exactly;
- Editor Core history navigation is not yet a SesliTab product undo authority.
  Undo reconciliation remains STI-12.

The machine-readable baseline is `docs/sti-01-02-runtime-authority-baseline.json`.

## Verification baseline

The protected CI workflow is `test-and-build`; it runs dependency installation,
the full test suite, production build and browser runtime verification. STI-01/02
must not be merged until its exact PR head passes this workflow and the normal
pre-merge fresh-read gate.

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

Detailed historical matrix and primary files: `docs/teacher-score-editor-architecture.md`.
Full architecture synchronization for the completed JSON 3 program remains STI-18.

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
