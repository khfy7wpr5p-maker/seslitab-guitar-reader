# SesliTab Package Status

Last documentation review: 2026-08-28
Latest verified Package 7 technical baseline: `7c37057713aa8a975edafdb0928d64f575d7cd5f`

This table is an orientation snapshot, not standalone completion evidence. A package is **Completed** only when its acceptance criteria, focused tests, full regression suite, production build, protected-main merge and required exact-main GitHub workflow evidence are satisfied, including package-specific closure evidence. Dedicated closure documents remain authoritative.

## Verified closure baselines

- Plan 0: `4945d5b3ae5b0e1a61138f58673047ae3dba3e2d`
- Package 2A: `47b3ad374fdd49fdd1898c5e0c1b085fde7b9959`
- Package 2B: `e2fa6f6947334388d6a08299220d31f6d8462ab1`
- Package 2C technical closure: `8292f82327b6290d182b029e5ba402ae16c31cff`
- Package 2D technical closure: `0c9df668ddcb1b16d1d5b4ca6dd1d3839d441d95`
- Package 2E closure: `f6b808f331a38047f64e82e395a93ed185737813`
- Package 3 documentation closure: `02dadf55f22505dc5527478f2f6ddb90c17621ff`; exact-main CI #136 / `33104428265`: 898/898 tests, 229 suites, audit 0, build PASS.
- Package 4 implementation baseline: `424653c60ff35326ae137cdf8b72b43eeb7d25e1`; exact-main CI #155 / `33111922206`: 961/961 tests, 229 suites, audit 0, build PASS.
- Package 5 implementation baseline: `0465dba0c40e66ad0d8c77ea47b62fbd421209de`; exact-main CI #177 / `33119971061`: 1031/1031 tests, 229 suites, audit 0, build PASS.
- Package 6 final closure baseline: `99232915ebcd5089055d0f8695b6c1b08c697739`; exact-main CI #188 / `33142995146`: 1057/1057 tests, 229 suites, audit 0, build PASS.
- Package 7 final technical baseline before package closure: `7c37057713aa8a975edafdb0928d64f575d7cd5f`; exact-main CI #205 / `33146058408`, job `98767251803`: **1105/1105 tests**, 229 suites, audit 0, build PASS. PR #83 is the active documentation closure gate.

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0R-A — Verified CI baseline | Completed | Required `test-and-build` is part of the protected-main gate. |
| 0R-B — Main branch protection | Completed | `main` is protected; pull-request routing and required `test-and-build` are enforced. |
| 0 — Safe baseline | Completed | Approved golden references, integrity manifests, TTS/TAB golden regressions and recovery evidence are preserved. |
| 1A — Queue, retry, restart, cancellation | Completed | Retry/re-enqueue, duplicate prevention, cancellation, restart recovery, concurrency and retention-safe cleanup are verified. |
| 1B — File, XML and API security | Completed | PDF/XML/multipart/API/CORS/rate-limit/security boundaries are verified. |
| 2A — Canonical note and time model | Completed | Exact-array canonical pitch/time/source-verification contract verified. |
| 2B — Structural and rhythmic validator | Completed | Structural validity remains distinct from musical correctness. |
| 2C — Quality and error report | Completed | Deterministic quality/error reporting is verified. |
| 2D — Quality gate integration | Completed | Fail-closed `ACCEPT` / `REVIEW` / `BLOCK` consumer policy verified. |
| 2E — OMR benchmark | Completed | Deterministic benchmark/evidence framework completed without universal accuracy claims. |
| 3 — Accessible measure playback and MIDI | Completed | PRs #51–#58; exact measure identity, selected-measure TTS/playback and deterministic MIDI are verified. |
| 4 — Basic Guitar TAB | Completed | Candidates → deterministic policy → conservative projection → ASCII renderer → quality-gated consumer → accessible UI. |
| 5 — Basic violin | Completed | First-position candidates → conservative fingering → quality-gated consumer → accessible UI. |
| 6 — Chord-symbol parser | Completed | Source-only MusicXML `<harmony>` parser; final closure main `99232915…`, CI #188 green. |
| 7 — Chord display and Turkish TTS | **Closure pending** | 7A–7F and the 7C stale-source hotfix are technically verified. PR #83 must merge and its exact-main `test-and-build` must succeed before package-level `Completed`. |
| 8 — Teacher correction and approval | Not started | Teacher correction, revision history and approval remain product requirements. |
| 8B — Audiveris training dataset | Not started | No teacher-approved reproducible training-dataset package. |
| 9 — Advanced Guitar TAB | Not started | Chord/polyphonic/pedagogical fingering remains intentionally outside Package 4. |
| 10 — Advanced violin | Not started | Advanced positions, alternatives and double stops remain planned. |
| 11 — Accessible tuner | Not started | No verified microphone pitch-detection and accessible-feedback package. |
| 12 — Teacher-to-student sharing | Not started | No verified approved-revision sharing and authorization system. |
| 13 — Simplified rhythm mode | Not started | City-name rhythm training remains planned. |
| 14 — Mobile productisation | Partially implemented | Responsive web foundations exist; device-level VoiceOver/audio/privacy/productisation criteria remain incomplete. |

## Package 7 stage evidence

Authoritative detail:

- `docs/package-7ab-chord-presentation.md` — 7A–7B **Completed**
- `docs/package-7c-chord-source-handoff.md` — 7C **Completed**, including PR #82 hotfix
- `docs/package-7def-accessible-chord-ui-tts.md` — 7D–7F **Completed**
- `docs/package-7-closure.md` — package-level **closure pending** until PR #83 exact-main gate

Verified sequence:

- 7A–7B PR #78 → merge `ee9a95a02a75c357e74647a09b1c2b27dafdcc6c` → exact-main CI #197 SUCCESS.
- 7C PR #79 → merge `56ba563d47f3eec45ea0de88435706c121316a0d` → exact-main CI #199 SUCCESS.
- 7D–7F PR #80 → merge `fae1b102eae24926ac48f429124c96f8c58899fe` → exact-main CI #201 SUCCESS with 1103/1103 tests.
- 7G closure-pending PR #81 → merge `fef1464c882878fd1dd9921959887b9080f30927` → exact-main CI #203 SUCCESS.
- Late valid P2 stale-source finding → hotfix PR #82 → accepted head `0968a439a8e5b2a8712d216277f7466c8ba84daa` → merge `7c37057713aa8a975edafdb0928d64f575d7cd5f` → exact-head #204 and exact-main #205 SUCCESS.
- Current PR #83 exact-head CI #206 / `33146234567`, job `98767794592`: SUCCESS with **1105/1105 PASS**, 229 suites, audit 0, build PASS.

Package 7 remains **source-only presentation**. `sourceOnly=true`, `definitive=false`, `teacherApproved=false`. It does not infer chords from note content and does not prove that source harmony is musically correct.

## Interpretation rules

- **Completed:** acceptance criteria, focused tests, full regression, production build and required protected-main workflow evidence are satisfied, including package-specific closure evidence.
- **Closure pending:** implementation stages are verified, but the active package-level closure PR still requires protected-main merge and exact-main CI.
- **Partially implemented:** relevant implementation exists, but package acceptance or closure is incomplete.
- **Not started:** no meaningful verified package implementation evidence.
- **Not verified:** related code may exist, but available evidence is insufficient to assign another status safely.

Package 8 must not be treated as started by the current Package 7 closure gate.
