# SesliTab Package Status

Last documentation review: 2026-08-09  
Implementation baseline reviewed: `c4f68bfef70b22bd864b2736d2e8d31cd10d036b`

This table is an orientation snapshot, not completion evidence. A package may be marked **Completed** only after its acceptance criteria, focused tests, full regression suite, production build, and required GitHub workflow evidence have been freshly verified.

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0R-A — Verified CI baseline | Completed | PR #14 merged the CI baseline to `main` at `62d7782fc770f807b237ecc54789beb972b658e5`. Local branch validation recorded `npm ci`, 662/662 tests, and production build passing. GitHub Actions run `31156531809` on the merged main SHA completed successfully; required job `test-and-build`, dependency installation, tests, and production build all passed. |
| 0R-B — Main branch protection | Completed | `main` is protected by classic branch protection. PRs are required; required approvals are `0`; stale approvals are dismissed on new commits; latest-push approval and Code Owner review are not required; `test-and-build`, up-to-date branches, and conversation resolution are required; administrator/custom-role bypass is disabled; force pushes and deletions are disabled. No named user, team, or app review-bypass actor was visible in the verified configuration. |
| 0 — Safe baseline | Partially implemented | Baseline commit `c4f68bfef70b22bd864b2736d2e8d31cd10d036b` is now pinned by recovery branch `recovery/plan-0-c4f68bfe` and annotated tag `plan-0-baseline-c4f68bfe`. The tag is annotated but unsigned. GitHub-hosted CI on the same commit passed 662/662 tests and the production build. No release/ZIP artifact or SHA-256 archive record exists yet. Existing real-OMR MusicXML fixtures are regression inputs, but the complete source-PDF/image → OMR → teacher-approved MusicXML golden-reference chain, license/source evidence, teacher approval, and golden manifest/hash records remain incomplete. |
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

## Plan 0-B Evidence

- Exact baseline commit: `c4f68bfef70b22bd864b2736d2e8d31cd10d036b`
- Short baseline SHA: `c4f68bfe`
- Baseline commit message: `Merge PR #15: Docs: record verified Plan 0R status`
- Baseline commit date: `2026-08-09T04:41:07Z`
- Recovery branch: `recovery/plan-0-c4f68bfe`
- Recovery branch target: `c4f68bfef70b22bd864b2736d2e8d31cd10d036b`
- Annotated tag: `plan-0-baseline-c4f68bfe`
- Annotated tag object SHA: `1dab88e64cde50e408c7797bb6bdc5f65b0b8621`
- Annotated tag target commit: `c4f68bfef70b22bd864b2736d2e8d31cd10d036b`
- Tag verification: unsigned (`verification.reason: unsigned`)
- GitHub Actions workflow: `CI`
- GitHub Actions run ID: `31295090134`
- GitHub Actions event: `push`
- Required job: `test-and-build`
- GitHub-hosted tests on the exact baseline commit: 662 passed, 0 failed, 0 skipped, 0 cancelled
- GitHub-hosted production build on the exact baseline commit: passed
- Dependency installation: `npm ci` passed
- Known dependency-audit warning in the same runner output: 1 high severity vulnerability
- `package-lock.json`: present on the baseline commit
- Release: not created
- Independent source ZIP/release artifact: not created
- SHA-256 archive record: not created
- Source PDF golden reference in repository: missing
- Source PNG/JPG golden reference in repository: missing
- OMR input artifact golden reference: missing
- Teacher-approved MusicXML evidence: missing
- Golden-reference manifest and SHA-256 records: missing
- TTS golden expected result: missing
- Guitar TAB golden expected result: missing
- Existing `tests/fixtures/real-omr/*-clean.xml` files remain useful regression inputs but are not classified as complete teacher-approved golden references because source/license/teacher-approval evidence is incomplete.

The recovery refs identify source-code state only. They do not roll back Render dashboard environment state, platform-provided variables, persistent `/var/lib/seslitab` data, user files, or production deployment state.

A safe source recovery should create a new working branch from the verified recovery tag or branch, use the normal pull-request path, require the current CI gate, and obtain separate merge approval. Do not use force-push, direct protected-branch rewriting, or destructive reset as the normal recovery procedure.

Package 0 remains incomplete until its golden-reference acceptance criteria and any separately approved archive/integrity requirements are satisfied. Creating the recovery branch and annotated tag does not by itself mean that Plan 0 is complete.

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
