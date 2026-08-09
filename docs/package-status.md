# SesliTab Package Status

Last documentation review: 2026-08-09  
Implementation baseline reviewed: `62d7782fc770f807b237ecc54789beb972b658e5`

This table is an orientation snapshot, not completion evidence. A package may be marked **Completed** only after its acceptance criteria, focused tests, full regression suite, production build, and required GitHub workflow evidence have been freshly verified.

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0R-A — Verified CI baseline | Completed | PR #14 merged the CI baseline to `main` at `62d7782fc770f807b237ecc54789beb972b658e5`. Local branch validation recorded `npm ci`, 662/662 tests, and production build passing. GitHub Actions run `31156531809` on the merged main SHA completed successfully; required job `test-and-build`, dependency installation, tests, and production build all passed. |
| 0R-B — Main branch protection | Completed | `main` is protected by classic branch protection. PRs are required; required approvals are `0`; stale approvals are dismissed on new commits; latest-push approval and Code Owner review are not required; `test-and-build`, up-to-date branches, and conversation resolution are required; administrator/custom-role bypass is disabled; force pushes and deletions are disabled. No named user, team, or app review-bypass actor was visible in the verified configuration. |
| 0 — Safe baseline | Not verified | Plan 0R CI and main-protection evidence is complete, but Package 0 recovery-point and golden-reference acceptance criteria have not been freshly verified as a separate package. |
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

## Plan 0R Evidence

### Plan 0R-A

- Pre-merge baseline main SHA: `a4ff5ac376e684f06c7375b1bf4c0c6cdf9368d6`
- Implementation branch: `chore/plan-0r-ci-baseline`
- Merge PR: #14
- Verified merged main SHA: `62d7782fc770f807b237ecc54789beb972b658e5`
- Workflow files delivered by Plan 0R-A:
  - `.github/workflows/ci.yml`
  - `.github/workflows/e2e-render-omr.yml`
- Node.js: 24
- Temporary-clone `npm ci`: passed
- Temporary-clone `npm test`: 662 passed, 0 failed, 0 skipped, 0 cancelled
- Temporary-clone `npm run build`: passed
- GitHub Actions workflow: `CI`
- GitHub Actions run ID: `31156531809`
- GitHub Actions event: `push`
- GitHub Actions conclusion: `success`
- Required job: `test-and-build`
- GitHub-hosted dependency installation: passed
- GitHub-hosted tests: passed
- GitHub-hosted production build: passed
- Deploy: not performed

The existing Audiveris–Render integration, endpoints, base URL, production configuration, and runtime flow were not changed by Plan 0R-A.

### Plan 0R-B

- Protected branch: `main`
- Protection source: classic branch protection
- Repository rulesets: none returned
- Effective rulesets for `main`: none returned
- Pull request before merge: required
- Required approving reviews: `0`
- Dismiss stale approvals after new commits: enabled
- Code Owner review: disabled
- Approval of most recent reviewable push: disabled
- Required status checks: enabled
- Required status check: `test-and-build`
- Branch must be up to date before merge: enabled
- Conversation resolution before merge: enabled
- `Do not allow bypassing the above settings`: enabled
- Named user/team/app review-bypass actor: none visible in the verified protection configuration
- Force pushes: disabled
- Branch deletion: disabled

The connected GitHub integration and `gh api` detailed branch-protection query both returned HTTP 403 for the protection-detail endpoint. The missing review-count and bypass/admin-enforcement fields were therefore verified read-only through the GitHub branch-protection settings UI without saving or changing any setting.

Required approvals remain `0`. This prevents an approval-only deadlock for a single-developer repository, while also meaning that a second human review is not a mandatory merge requirement.

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
