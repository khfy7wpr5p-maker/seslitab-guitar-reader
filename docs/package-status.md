# SesliTab Package Status

Last documentation review: 2026-08-28
Implementation baseline reviewed: `0465dba0c40e66ad0d8c77ea47b62fbd421209de`

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
- Package 5 implementation baseline: `0465dba0c40e66ad0d8c77ea47b62fbd421209de`; exact-main CI #177 / `33119971061` succeeded with 1031/1031 tests, 229 suites, audit 0 and production build PASS.

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

## Package 5 closure evidence

Authoritative detail: `docs/package-5-closure.md` plus Package 5A–5F stage documents.

- 5A PR #66 → merge `1f500cfba2c0a44b8d5ca5fd388f769e8d4cb5da`
- 5B PR #67 → merge `a68121c027fdfb2f96da449179d28cce5e002a20`
- 5C PR #68 → merge `9678494c29af6405397670228985e177f19f4ebc`
- 5D PR #71 → merge `a01793e4d0f00ff83fd8e71979da6ef7eb6a1051`
- 5E PR #72 → merge `e1116b1e1139fb701ee8c5c09a12ec6d9cc4d1b1`
- 5F PR #73 → merge `0465dba0c40e66ad0d8c77ea47b62fbd421209de`
- 5F accepted head after review fixes: `1ffb3bf2e5d78f90ac37ea27b4f3e322fe4e833f`
- implementation exact-main CI #177 / `33119971061`: success
- full regression: 1031/1031; 229 suites; 0 failed/skipped/cancelled
- dependency audit: 120 packages audited; 0 vulnerabilities
- production build: PASS with Vite 8.2.0
- production Audiveris/OMR/E2E changes in Package 5: none intended
- external violin dependency additions: none
- deployment: not performed

Package 5 completion is limited to conservative **basic monophonic first-position violin guidance**. It does not claim teacher-approved or pedagogically optimal fingering. Cross-string choices such as D4, A4 and E5 remain review-required when more than one supported first-position string is physically valid. Advanced positions, double stops, polyphony and multi-part/staff material remain outside Package 5.

## Interpretation rules

- **Completed:** acceptance criteria, focused tests, full regression, production build and required protected-main workflow evidence are satisfied.
- **Partially implemented:** relevant implementation exists, but package acceptance is incomplete or unverified.
- **Not started:** no meaningful verified package implementation evidence.
- **Not verified:** related code may exist, but available evidence is insufficient to assign another status safely.

Do not move to a later package solely because an earlier package is partially implemented. A later package may start only after the current package closure gate is satisfied on protected `main`, and any new architecture boundary must be audited before modification.
