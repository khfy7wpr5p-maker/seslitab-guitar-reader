# SesliTab Package Status

Last documentation review: 2026-08-06  
Implementation baseline reviewed: `a4ff5ac376e684f06c7375b1bf4c0c6cdf9368d6`

This table is an orientation snapshot, not completion evidence. A package may be marked **Completed** only after its acceptance criteria, focused tests, full regression suite, production build, and required GitHub workflow evidence have been freshly verified.

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0R-A — Verified CI baseline | Partially implemented | Branch `chore/plan-0r-ci-baseline` adds general CI and updates Render E2E compatibility. Temporary-clone validation passed: `npm ci`, 662/662 tests, and production build. Draft PR and final GitHub Actions evidence are still pending. |
| 0R-B — Main branch protection | Not started | Main is currently unprotected and has no required checks. Apply only after Plan 0R-A is merged, the real CI check name is confirmed, and separate approval is given. |
| 0 — Safe baseline | Not verified | Plan 0R is establishing the repository-wide CI baseline; final GitHub workflow evidence is not yet complete. |
| 1A — Queue, retry, restart, cancellation | Partially implemented | Queue, job manager, worker, persistence, recovery, retry and cancel foundations exist; full real-process cancellation and duplicate/ghost-job criteria require fresh verification. |
| 1B — File, XML and API security | Partially implemented | Upload limits, PDF checks, XML security, CORS, rate limiting and safe health output have foundations; all required security tests were not freshly verified here. |
| 2A — Canonical note and time model | Partially implemented | Canonical pitch, time, verification metadata and consumption-policy foundations exist; every consumer is not yet proven to use them consistently. |
| 2B — Structural and rhythmic validator | Not verified | Parsing and timing foundations exist, but the complete validator acceptance matrix has not been freshly demonstrated. |
| 2C — Quality and error report | Partially implemented | Verification states and consumption decisions exist; the complete required error-code report is not verified. |
| 2D — Quality gate integration | Partially implemented | A shared policy exists, but mandatory enforcement across TTS, playback and Guitar TAB is not fully verified. |
| 2E — OMR benchmark | Not started | No approved comparative benchmark package is documented as complete. |
| 3A — “Müziği Dinle” change | Not started | The approved wording and behaviour change has not been verified as implemented. |
| 3B — Playback state management | Partially implemented | Basic playback exists; the complete play/pause/resume/stop lifecycle and single-session guarantees are not verified. |
| 3C — Unique measure identity | Partially implemented | Canonical measure identity fields exist; complete interface selection by unique key is not verified. |
| 3D — Rhythmic HTML measure buttons | Not started | No completed accessible measure-button package is verified. |
| 3E — Speak and play one measure | Not started | No completed sequential measure TTS/playback package is verified. |
| 3F — Playback regression package | Not started | The required full regression matrix has not been completed. |
| 3G — Real MIDI | Not started | Current playback uses Web Audio; real MIDI timeline and `.mid` export remain planned. |
| 4 — Basic Guitar TAB | Partially implemented | TAB parsing and guitar pitch foundations exist; safe verified note-to-position generation is not complete. |
| 5 — Basic violin | Not started | No verified violin string/fingering engine. |
| 6 — Chord-symbol parser | Not started | No verified MusicXML harmony package. |
| 7 — Chord display and Turkish TTS | Not started | No verified shared chord display/TTS package. |
| 8 — Teacher correction and approval | Not started | Teacher correction, revision history and approval are product requirements but not completed features. |
| 8B — Audiveris training dataset | Not started | No teacher-approved reproducible training dataset package. |
| 9 — Advanced Guitar TAB | Not started | Polyphonic and pedagogical fingering remains planned. |
| 10 — Advanced violin | Not started | Advanced positions, alternatives and double stops remain planned. |
| 11 — Accessible tuner | Not started | No verified microphone pitch-detection and accessible-feedback package. |
| 12 — Teacher-to-student sharing | Not started | No verified approved-revision sharing and authorization system. |
| 13 — Simplified rhythm mode | Not started | City-name rhythm training remains planned. |
| 14 — Mobile productisation | Partially implemented | A responsive web foundation exists; iPhone VoiceOver, audio lifecycle, privacy and productisation criteria are not verified. |

## Plan 0R-A Evidence

- Baseline main SHA: `a4ff5ac376e684f06c7375b1bf4c0c6cdf9368d6`
- Working branch: `chore/plan-0r-ci-baseline`
- Changed workflow files:
  - `.github/workflows/ci.yml`
  - `.github/workflows/e2e-render-omr.yml`
- Documentation files:
  - `docs/current-status.md`
  - `docs/package-status.md`
- Node.js: 24
- `npm ci`: passed in a temporary clone
- `npm test`: 662 passed, 0 failed, 0 skipped, 0 cancelled
- `npm run build`: passed
- GitHub Actions: pending Draft PR
- Branch protection: not changed
- Merge: not performed
- Deploy: not performed

The existing Audiveris–Render integration, endpoints, base URL, production configuration, and runtime flow were not changed.

## Interpretation Rules

- **Completed:** All package acceptance criteria, focused tests, full regression tests, production build, and required GitHub workflow checks passed with fresh evidence.
- **Partially implemented:** Some relevant implementation or validation exists, but package-level acceptance criteria are incomplete or unverified.
- **Not started:** No meaningful implementation evidence was found for the package.
- **Not verified:** Related code may exist, but the available evidence is insufficient to assign another status safely.

## Update Rule

Update this file only after a fresh package audit or completed package report. Every status change should include:

- Commit SHA
- Relevant file paths
- Test commands and results
- Production build result
- GitHub workflow result when applicable
- Remaining risks
- Approval state

Do not move to a later package solely because an earlier package is marked partially implemented.
