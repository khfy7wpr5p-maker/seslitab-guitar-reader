# SesliTab Package Status

Last documentation review: 2026-08-28
Verified closure baseline reviewed: `99232915ebcd5089055d0f8695b6c1b08c697739`
Latest verified Package 7 implementation baseline: `fae1b102eae24926ac48f429124c96f8c58899fe`

This table is an orientation snapshot, not standalone completion evidence. A package is **Completed** only when its acceptance criteria, focused tests, full regression suite, production build, protected-main merge and required exact-main GitHub workflow evidence are satisfied, including any package-specific documentation closure gate. Dedicated closure documents remain authoritative for detailed evidence.

## Verified closure baselines

- Plan 0: `4945d5b3ae5b0e1a61138f58673047ae3dba3e2d`
- Package 2A: `47b3ad374fdd49fdd1898c5e0c1b085fde7b9959`
- Package 2B: `e2fa6f6947334388d6a08299220d31f6d8462ab1`
- Package 2C technical closure: `8292f82327b6290d182b029e5ba402ae16c31cff`
- Package 2D technical closure: `0c9df668ddcb1b16d1d5b4ca6dd1d3839d441d95`
- Package 2E closure: `f6b808f331a38047f64e82e395a93ed185737813`
- Package 3 documentation closure: `02dadf55f22505dc5527478f2f6ddb90c17621ff`; exact-main CI #136 / `33104428265` succeeded with 898/898 tests, 229 suites, audit 0 and production build PASS.
- Package 4 implementation baseline: `424653c60ff35326ae137cdf8b72b43eeb7d25e1`; exact-main CI #155 / `33111922206` succeeded with 961/961 tests, 229 suites, audit 0 and production build PASS.
- Package 5 implementation baseline: `0465dba0c40e66ad0d8c77ea47b62fbd421209de`; exact-main CI #177 / `33119971061` succeeded with 1031/1031 tests, 229 suites, audit 0 and production build PASS.
- Package 6 implementation baseline: `4417a32f3ddaa46dacf149dc1317f6a83d19403c`; implementation exact-main CI #184 / `33124708562` succeeded with 1057/1057 tests, 229 suites, audit 0 and production build PASS.
- Package 6 final closure baseline: `99232915ebcd5089055d0f8695b6c1b08c697739`; closure exact-main CI #188 / `33142995146`, job `98757771854`, succeeded with 1057/1057 tests, 229 suites, audit 0 and production build PASS.
- Package 7 implementation baseline: `fae1b102eae24926ac48f429124c96f8c58899fe`; exact-main CI #201 / `33145385541`, job `98765125632`, succeeded with 1103/1103 tests, 229 suites, audit 0 and production build PASS. Package-level documentation closure is still pending.

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0R-A — Verified CI baseline | Completed | Required `test-and-build` is part of the protected-main gate. |
| 0R-B — Main branch protection | Completed | `main` is protected; pull-request routing and required `test-and-build` are enforced. |
| 0 — Safe baseline | Completed | Approved golden references, integrity manifests, TTS/TAB golden regressions and recovery evidence are preserved. |
| 1A — Queue, retry, restart, cancellation | Completed | Retry/re-enqueue, duplicate prevention, cancellation, restart recovery, concurrency and retention-safe cleanup are verified. |
| 1B — File, XML and API security | Completed | PDF/XML/multipart/API/CORS/rate-limit/security boundaries are verified. |
| 2A — Canonical note and time model | Completed | `docs/package-2a-closure.md`; exact-array canonical pitch/time/source-verification contract verified. |
| 2B — Structural and rhythmic validator | Completed | `docs/package-2b-closure.md`; structural validity remains distinct from musical correctness. |
| 2C — Quality and error report | Completed | `docs/package-2c-closure.md`; merge `8292f82327b6290d182b029e5ba402ae16c31cff`. |
| 2D — Quality gate integration | Completed | `docs/package-2d-closure.md`; fail-closed `ACCEPT` / `REVIEW` / `BLOCK` consumer policy verified. |
| 2E — OMR benchmark | Completed | `docs/package-2e-closure.md`; benchmark/evidence framework completed without universal OMR-accuracy or winner claims. |
| 3A — `Müziği Dinle` change | Completed | PR #51; accessible visible/ARIA wording synchronized. |
| 3B — Playback state management | Completed | PR #52; truthful serialized playback lifecycle and single-session behavior verified. |
| 3C — Unique measure identity | Completed | PR #53; parser-supplied canonical `measureKey` is authoritative. |
| 3D — Rhythmic HTML measure buttons | Completed | PR #54; native accessible controls preserve exact note references. |
| 3E — Speak and play one measure | Completed | PR #55; exact full-array Package 2D gate precedes selected-measure consumption. |
| 3F — Playback regression package | Completed | PR #56; reviewed real-OMR fixtures remain regression evidence, not ground truth. |
| 3G — Real MIDI | Completed | PR #57; dependency-free deterministic SMF0 export is quality-gated. Package 3 closure PR #58 merged as `02dadf55f22505dc5527478f2f6ddb90c17621ff`; exact-main CI #136 succeeded. |
| 4 — Basic Guitar TAB | Completed | PRs #59–#64 implement candidates → deterministic basic policy → conservative projection → ASCII renderer → Package 2D-gated production consumer → accessible result UI. Final implementation main `424653c60ff35326ae137cdf8b72b43eeb7d25e1`; exact-main CI #155 passed 961/961 tests, 229 suites, audit 0 and build PASS. |
| 5 — Basic violin | Completed | PRs #66–#68 and #71–#73 implement first-position physical candidates → conservative finger-zone policy → fail-closed projection → Package 2D VIOLIN gate → production consumer → accessible result UI. Final implementation main `0465dba0c40e66ad0d8c77ea47b62fbd421209de`; exact-main CI #177 passed 1031/1031 tests, 229 suites, audit 0 and build PASS. `docs/package-5-closure.md` defines the conservative scope. |
| 6 — Chord-symbol parser | Completed | Implementation PR #75 plus closure PR #76 are verified on protected main. Final closure main `99232915ebcd5089055d0f8695b6c1b08c697739`; exact-main CI #188 passed 1057/1057 tests, 229 suites, audit 0 and build PASS. `docs/package-6-closure.md` records the final evidence. |
| 7 — Chord display and Turkish TTS | Closure pending | PRs #78–#80 implement source-only presentation → Turkish pronunciation → exact MusicXML source handoff → accessible Akorlar UI → shared-audio lifecycle → existing voiceService TTS. Implementation main `fae1b102eae24926ac48f429124c96f8c58899fe`; exact-main CI #201 passed 1103/1103 tests, 229 suites, audit 0 and build PASS. `docs/package-7-closure.md` remains closure-pending until its own protected-main gate succeeds. |
| 8 — Teacher correction and approval | Not started | Teacher correction, revision history and approval remain product requirements. |
| 8B — Audiveris training dataset | Not started | No teacher-approved reproducible training-dataset package. |
| 9 — Advanced Guitar TAB | Not started | Chord/polyphonic/pedagogical fingering remains intentionally outside Package 4. |
| 10 — Advanced violin | Not started | Advanced positions, alternatives and double stops remain planned. |
| 11 — Accessible tuner | Not started | No verified microphone pitch-detection and accessible-feedback package. |
| 12 — Teacher-to-student sharing | Not started | No verified approved-revision sharing and authorization system. |
| 13 — Simplified rhythm mode | Not started | City-name rhythm training remains planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web foundations exist; device-level VoiceOver/audio/privacy/productisation criteria remain incomplete. |

## Package 7 implementation and closure-pending evidence

Authoritative implementation detail:

- `docs/package-7ab-chord-presentation.md`
- `docs/package-7c-chord-source-handoff.md`
- `docs/package-7def-accessible-chord-ui-tts.md`
- `docs/package-7-closure.md`

Verified implementation evidence:

- 7A–7B PR #78; accepted head `7256806e06ccfa184a77f859e5c8de1714656281`; merge `ee9a95a02a75c357e74647a09b1c2b27dafdcc6c`; exact-main CI #197 / `33144443876`: success.
- 7C PR #79; accepted head `7e98787e881adb06e776b9e8b464d0eb81f39d27`; merge `56ba563d47f3eec45ea0de88435706c121316a0d`; exact-main CI #199 / `33145040418`: success.
- 7D–7F PR #80; accepted head `8b3d793f66b4c1ab98244ffd73cfadaa5ed934e7`; merge `fae1b102eae24926ac48f429124c96f8c58899fe`; exact-head CI #200 / `33145271095`: success; exact-main CI #201 / `33145385541`: success.
- full regression at final implementation main: 1103/1103 tests PASS; 229 suites; 0 failed/skipped/cancelled.
- dependency audit: 120 packages audited; 0 vulnerabilities.
- production build: PASS with Vite 8.2.0; 55 modules transformed.
- production Audiveris/OMR/gateway/E2E edits: none.
- external dependencies: none added.
- deployment: not performed.

Package 7 remains **source-only presentation**. A source-ready chord result is explicitly `sourceOnly=true`, `definitive=false`, `teacherApproved=false`. It does not infer chords from note content and does not prove that source harmony is musically correct.

## Package 6 closure evidence

Authoritative detail: `docs/package-6-chord-symbol-parser.md` and `docs/package-6-closure.md`.

- implementation PR #75
- accepted implementation head: `3bb822d2df750079359c2c8c9e43060f6b0fedd2`
- implementation merge: `4417a32f3ddaa46dacf149dc1317f6a83d19403c`
- exact-head CI #183 / `33124475810`: success
- implementation exact-main CI #184 / `33124708562`: success
- closure PR #76
- accepted closure head: `bf91a58951cbef79842b093656d3e75f61cb71b9`
- closure merge: `99232915ebcd5089055d0f8695b6c1b08c697739`
- closure exact-main CI #188 / `33142995146`: success
- full regression: 1057/1057; 229 suites; 0 failed/skipped/cancelled
- dependency audit: 120 packages audited; 0 vulnerabilities
- production build: PASS with Vite 8.2.0; 49 modules transformed
- production Audiveris/OMR/gateway/E2E edits: none
- deployment: not performed

Package 6 is source-only: it parses explicit MusicXML harmony evidence and does not infer chords from note content, claim OMR correctness, claim teacher approval, or implement chord presentation/TTS by itself.

## Interpretation rules

- **Completed:** acceptance criteria, focused tests, full regression, production build and required protected-main workflow evidence are satisfied, including any package-specific closure gate.
- **Closure pending:** implementation is verified on protected main, but the package-level documentation/status closure gate has not yet completed on protected main.
- **Partially implemented:** relevant implementation exists, but package acceptance or closure is incomplete.
- **Not started:** no meaningful verified package implementation evidence.
- **Not verified:** related code may exist, but available evidence is insufficient to assign another status safely.

Do not move to a later package solely because an earlier package is partially implemented or closure-pending. A later package may start only after the current package closure gate is satisfied on protected `main`, and any new architecture boundary must be audited before modification.
