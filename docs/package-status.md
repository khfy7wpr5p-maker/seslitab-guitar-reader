# SesliTab Package Status

Last documentation review: 2026-08-27
Implementation baseline reviewed: `424653c60ff35326ae137cdf8b72b43eeb7d25e1`

This table is an orientation snapshot, not standalone completion evidence. A package is **Completed** only when its acceptance criteria, focused tests, full regression suite, production build, protected-main merge and required exact-main GitHub workflow evidence are satisfied. Dedicated closure documents remain authoritative for detailed evidence.

## Verified closure baselines

- Plan 0: `4945d5b3ae5b0e1a61138f58673047ae3dba3e2d`
- Package 2A: `47b3ad374fdd49fdd1898c5e0c1b085fde7b9959`
- Package 2B: `e2fa6f6947334388d6a08299220d31f6d8462ab1`
- Package 2C technical closure: `8292f82327b6290d182b029e5ba402ae16c31cff`
- Package 2D technical closure: `0c9df668ddcb1b16d1d5b4ca6dd1d3839d441d95`
- Package 2E closure: `f6b808f331a38047f64e82e395a93ed185737813`
- Package 3 documentation closure: `02dadf55f22505dc5527478f2f6ddb90c17621ff`; exact-main CI #136 / `33104428265` succeeded with 898/898 tests, 229 suites, audit 0 and production build PASS.
- Package 4 implementation baseline: `424653c60ff35326ae137cdf8b72b43eeb7d25e1`; exact-main CI #155 / `33111922206` succeeded with 961/961 tests, 229 suites, audit 0 and production build PASS.

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
| 4 — Basic Guitar TAB | Completed | PRs #59–#64 implement candidates → deterministic basic policy → conservative projection → ASCII renderer → Package 2D-gated production consumer → accessible result UI. Final implementation main `424653c60ff35326ae137cdf8b72b43eeb7d25e1`; exact-main CI #155 passed 961/961 tests, 229 suites, audit 0 and build PASS. `docs/package-4-closure.md` is authoritative after this docs-only closure gate reaches protected main and exact-main CI passes. |
| 5 — Basic violin | Not started | No verified violin string/fingering package. Must receive a fresh architecture-boundary audit before implementation. |
| 6 — Chord-symbol parser | Not started | No verified MusicXML harmony package. |
| 7 — Chord display and Turkish TTS | Not started | No verified shared chord display/TTS package. |
| 8 — Teacher correction and approval | Not started | Teacher correction, revision history and approval remain product requirements. |
| 8B — Audiveris training dataset | Not started | No teacher-approved reproducible training-dataset package. |
| 9 — Advanced Guitar TAB | Not started | Chord/polyphonic/pedagogical fingering remains intentionally outside Package 4. |
| 10 — Advanced violin | Not started | Advanced positions, alternatives and double stops remain planned. |
| 11 — Accessible tuner | Not started | No verified microphone pitch-detection and accessible-feedback package. |
| 12 — Teacher-to-student sharing | Not started | No verified approved-revision sharing and authorization system. |
| 13 — Simplified rhythm mode | Not started | City-name rhythm training remains planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web foundations exist; device-level VoiceOver/audio/privacy/productisation criteria remain incomplete. |

## Package 3 closure evidence

Authoritative detail: `docs/package-3-playback-contract.md` and `docs/package-3-closure.md`.

- implementation PRs: #51–#57
- implementation baseline: `6c7cfc3193167eca12d92825c56df44ea0455ab1`
- implementation exact-main CI #134 / `33103536812`: success; 898/898 tests; 229 suites; audit 0; build PASS
- docs closure PR: #58
- docs closure merge: `02dadf55f22505dc5527478f2f6ddb90c17621ff`
- exact closure-main CI #136 / `33104428265`: success; 898/898 tests; 229 suites; audit 0; build PASS
- remaining Package 3 closure gate: none

## Package 4 closure evidence

Authoritative detail after this docs closure gate: `docs/package-4-closure.md` plus Package 4A–4F stage documents.

- 4A PR #59 → merge `a16e2c14094b36a5eb3775046637cf5cd1c908de`
- 4B PR #60 → merge `5b2d8f226f8f48e4ba2aedd1dfaec2494e52dd1d`
- 4C PR #61 → merge `ae74db26beeb00a3723c10d09f7fc6b078f6c6a4`
- 4D PR #62 → merge `b358202372dcde6a6c0296df41061b7c3e8d6fac`
- 4E PR #63 → merge `aa821251205358d5b99f4805782cbe25f1447759`
- 4F PR #64 → merge `424653c60ff35326ae137cdf8b72b43eeb7d25e1`
- 4F accepted head: `a0331684eeae1355d22881df2dd5ddb09e532b5b`
- PR #64 exact-head CI #154 / `33111721776`: success
- implementation exact-main CI #155 / `33111922206`: success
- full regression: 961/961; 229 suites; 0 failed/skipped/cancelled
- dependency audit: 120 packages audited; 0 vulnerabilities
- production build: PASS with Vite 8.2.0
- production Audiveris/OMR/E2E changes in Package 4: none intended
- external Guitar TAB dependency additions: none
- deployment: not performed
- remaining Package 4 gate: this docs-only closure PR and its exact post-merge main CI

Package 4 completion is limited to conservative **basic monophonic** generated Guitar TAB. It does not claim teacher-approved fingering, advanced chord/polyphonic TAB, musical ground truth or universal OMR correctness.

## Interpretation rules

- **Completed:** acceptance criteria, focused tests, full regression, production build and required protected-main workflow evidence are satisfied.
- **Partially implemented:** relevant implementation exists, but package acceptance is incomplete or unverified.
- **Not started:** no meaningful verified package implementation evidence.
- **Not verified:** related code may exist, but available evidence is insufficient to assign another status safely.

Do not move to a later package solely because an earlier package is partially implemented. A later package may start only after the current package closure gate is satisfied on protected `main`, and any new architecture boundary must be audited before modification.
