# SesliTab Package Status

Last documentation review: 2026-08-27
Implementation baseline reviewed: `47b3ad374fdd49fdd1898c5e0c1b085fde7b9959`
Plan 0 closure merged-main verified: `4945d5b3ae5b0e1a61138f58673047ae3dba3e2d`
Package 2A closure merged-main verified: `47b3ad374fdd49fdd1898c5e0c1b085fde7b9959`

This table is an orientation snapshot, not completion evidence. A package may be marked **Completed** only after its acceptance criteria, focused tests, full regression suite, production build, and required GitHub workflow evidence have been freshly verified.

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0R-A — Verified CI baseline | Completed | PR #14 merged the CI baseline to `main` at `62d7782fc770f807b237ecc54789beb972b658e5`. Local branch validation recorded `npm ci`, 662/662 tests, and production build passing. GitHub Actions run `31156531809` on the merged main SHA completed successfully; required job `test-and-build`, dependency installation, tests, and production build all passed. |
| 0R-B — Main branch protection | Completed | `main` is protected by classic branch protection. PRs are required; required approvals are `0`; stale approvals are dismissed on new commits; latest-push approval and Code Owner review are not required; `test-and-build`, up-to-date branches, and conversation resolution are required; administrator/custom-role bypass is disabled; force pushes and deletions are disabled. No named user, team, or app review-bypass actor was visible in the verified configuration. |
| 0 — Safe baseline | Completed | Recovery refs and both approved golden-reference evidence chains are preserved. Approved TTS and Guitar TAB golden outputs are SHA-256 protected and regression-tested. Focused golden tests passed 3/3; the full local regression suite passed 665/665; production build passed; diff integrity and clean working tree were verified. The independent source ZIP for exact tested commit `6485ff117f4559a1a7571994d312a85c1983480e` has SHA-256 `578835c78285cd2cf2b18ad2917b1e9aca6ee9bc2aaa232b9d569cc6c2c2b42a` and passed `unzip -t`. PR #19 head `39613c590f980f67a6386250b6994363be7a378d` passed GitHub Actions run `31327857090`; required job `test-and-build` passed. PR #19 was separately approved and merged as `4945d5b3ae5b0e1a61138f58673047ae3dba3e2d`; post-merge `main` run `31327991805` and required job `test-and-build` both passed. Plan 0 acceptance and closure gates are therefore complete. |
| 1A — Queue, retry, restart, cancellation | Completed | Package 1A acceptance is complete. Fresh verification covered real retry re-enqueue, duplicate/ghost-job prevention, confirmed child-process termination with SIGTERM/SIGKILL escalation, truthful and idempotent cancellation, restart recovery, default worker concurrency 1, and retention-safe cleanup. PR #21 fixed the review-discovered P2 retention lifecycle gap in `backend/services/cleanupService.js` with regression coverage in `tests/backendRestartRecovery.test.js`. Exact PR head `6a03c22d63f789771fd172f5bdf9507e3d69c0fa` passed GitHub Actions run `31331869610`; full tests and production build passed. PR #21 was separately approved and merged as `5510b1254c46ce691877b91e257e531fdcca7012`; post-merge `main` run `31332130115` passed with 666/666 tests, 0 failed/skipped/cancelled, and production build PASS. The Codex P2 review thread was resolved after the fix. Diff integrity was rechecked from the exact GitHub PR diff using `git diff --check` in a temporary local reconstruction and returned 0; connector-only GitHub writes have no persistent uncommitted working tree. Remaining 1A closure gate: none. |
| 1B — File, XML and API security | Completed | Package 1B acceptance is complete. Fresh verification covers PDF extension and `%PDF` header validation, 10 MB upload limits, 200-page enforcement, safe filename/path-traversal handling, MusicXML/XML validation before parsing, XXE/external-entity/internal-subset/XInclude/xml-stylesheet rejection, exact-origin CORS, bounded rate limiting, safe public error/health responses, and fail-closed multipart handling. PR #23 upgraded Multer to pinned `2.2.0`, restricted multipart requests to one file and one field with bounded parts and no nested fields, preserved valid PDF + provider uploads, and added dedicated multipart security regression coverage. The lockfile was synchronized deterministically and the transitive `nanoid` advisory was remediated to `3.3.18`; exact dependency audit evidence reached 0 vulnerabilities. Exact PR head `35b7fdde9e19a3235b40c136b12925468742ca85` passed required CI with 672/672 tests, 0 failed/skipped/cancelled, and production build PASS. PR #23 was merged as `114b0961ae26679b565c7d39cace0554398aeb05`; post-merge `main` CI run `33060506474` again passed `npm ci` with 0 vulnerabilities, 672/672 tests with 0 failed/skipped/cancelled, and production build PASS. No deployment was performed. Remaining 1B closure gate: none. |
| 2A — Canonical note and time model | Completed | Versioned canonical pitch/time model, source-verification metadata, preservation rules, shared consumer policy and production-boundary inventory are verified. PRs #26–#29 established preservation, policy, consumer bindings and real canonical MusicXML consumer-flow evidence. PR #29 merged as `47b3ad374fdd49fdd1898c5e0c1b085fde7b9959`; exact post-merge `main` run `33068597173` / `test-and-build` passed with 697/697 tests, 211 suites, 0 vulnerabilities and production build PASS. Mandatory consumer blocking remains Package 2D, and production canonical NoteObject → Guitar TAB generation remains Package 4; neither is reclassified as 2A work. Remaining 2A closure gate: none. |
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

## Package 2A Closure Evidence

- Closure implementation/evidence PR: #29
- Closure merge commit: `47b3ad374fdd49fdd1898c5e0c1b085fde7b9959`
- Required post-merge `main` workflow: CI run `33068597173`
- Required job: `98504784644` / `test-and-build` — completed/success
- `npm ci`: passed; 120 packages audited; 0 vulnerabilities
- Full regression: 697 passed, 0 failed, 0 skipped, 0 cancelled; 211 suites
- Package 2A canonical consumer-flow tests: 2/2 passed
- Production build: passed with Vite 8.2.0
- Audiveris and OMR regression shields: passed
- E2E workflow regression: passed
- Approved Turkish TTS golden output: unchanged/pass
- Approved Guitar TAB position golden output: unchanged/pass
- Runtime production behavior changes in the closure PR: none
- OMR/Audiveris production changes in the closure PR: none
- Remaining Package 2A closure gate: none

Package 2A closes only the shared canonical note/time model contract. Mandatory ACCEPT/REVIEW/BLOCK runtime enforcement remains Package 2D. Production canonical NoteObject → Guitar TAB generation remains Package 4 and later TAB work. These boundaries are deliberate and do not reopen Package 2A.

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
- Approval state: Plan 0-B implementation and PR #16 merge were explicitly approved by the repository owner on 2026-08-09.
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
- Independent source ZIP/release artifact: generated locally from exact tested commit `6485ff117f4559a1a7571994d312a85c1983480e`; no release/publish performed
- Source ZIP filename: `seslitab-guitar-reader-plan0-6485ff1.zip`
- Source ZIP SHA-256: `578835c78285cd2cf2b18ad2917b1e9aca6ee9bc2aaa232b9d569cc6c2c2b42a`
- Source ZIP integrity validation: `unzip -t` passed with no compressed-data errors
- SHA-256 archive record: `docs/plan-0-source-archive.sha256`
- Source PDF golden reference in repository: `tests/fixtures/golden-reference/plan0-cc0-4measure/plan0-cc0-4measure-source.pdf`
- Source PNG/JPG golden reference in repository: not required for this PDF-backed golden-reference case
- OMR input artifact golden reference: the source PDF above is the approved OMR input
- Musically approved expected MusicXML: `tests/fixtures/golden-reference/plan0-cc0-4measure/plan0-cc0-4measure-expected.musicxml`
- Golden-reference SHA-256 manifest: `tests/fixtures/golden-reference/plan0-cc0-4measure/plan0-cc0-4measure-sha256.txt`
- Golden-reference license declaration: repository owner approved this original four-measure exercise for CC0-1.0 use on 2026-08-09
- Musical approval: repository owner/reviewer explicitly confirmed the four-measure PDF–MusicXML match on 2026-08-09
- Golden-reference branch before this record: `44484f7b4d0a05ff5e7652809f999276c058a1e3`
- Real OMR comparison against the earlier four-measure expected MusicXML: historical attempt did not pass; Plan 0 real-OMR acceptance is satisfied separately by the owner-approved 3/8 evidence chain.
- TTS golden expected result: `tests/fixtures/golden-reference/plan0-safe-baseline-outputs/expected-tts.txt` — approved and regression-verified
- Guitar TAB golden expected result: `tests/fixtures/golden-reference/plan0-safe-baseline-outputs/expected-guitar-tab.json` — approved and regression-verified
- Golden-output manifest: `tests/fixtures/golden-reference/plan0-safe-baseline-outputs/sha256.txt` — regression-verified
- Golden-output regression test: `tests/plan0SafeBaselineGolden.test.js` — 3/3 passed
- Full local regression suite on exact tested source commit: 665 passed, 0 failed, 0 skipped, 0 cancelled
- Production build: passed with Vite 8.2.0
- Diff integrity: `git diff --check origin/main...HEAD` passed
- Working tree: clean
- Existing `tests/fixtures/real-omr/*-clean.xml` files remain useful regression inputs but are not classified as complete teacher-approved golden references because their source/license/teacher-approval evidence is incomplete.

### Plan 0 CC0 Four-Measure Golden Reference

The approved reference is intentionally minimal and auditable:

- one staff
- treble clef
- 4/4 meter
- four measures
- quarter notes only
- Measure 1: E4, F4, G4, A4
- Measure 2: B4, C5, D5, E5
- Measure 3: E5, D5, C5, B4
- Measure 4: A4, G4, F4, E4
- Source PDF SHA-256: `c6e91647ba9dfcd38094f59848823ce3c92e7f5fe495747e2588ac0120f5bfed`
- Expected MusicXML SHA-256: `7004b4ac37711cca340c63e2f2436dd70e0f630f4e891cb311caff159b5d9d94`
- Approval state: musical PDF–MusicXML equivalence and CC0-1.0 use explicitly approved on 2026-08-09.

This reference defines the expected musical truth. It does not claim that Audiveris has already reproduced that truth. The next acceptance step is a controlled real-OMR comparison of the source PDF against the approved expected MusicXML.

### Plan 0 Owner-Approved 3/8 Real OMR Golden Reference

A second reference now provides the real Audiveris evidence chain required by the Plan 0 OMR comparison criterion:

- Evidence directory: `tests/fixtures/golden-reference/plan0-owner-approved-3-8/`
- Source PDF: `source.pdf`
- Audiveris OMR artifact: `project.omr`
- Approved MusicXML: `expected.musicxml`
- Integrity manifest: `sha256.txt`
- Approval record: `APPROVAL.md`
- Audiveris version recorded in the evidence: 5.11.0
- Source PDF SHA-256: `df4b8ea20b6420ebdf6b3e1d625016090105fed0c2f60a4e03874d3c3be2b9b9`
- MusicXML SHA-256: `009dd2fd4439a4138ed62cd0e0945a5611add8db38c58c7b0f90429ccd9970f6`
- OMR SHA-256: `7424e684825b51e8fd31596c94acd5ef008a84fbaecb5c0524222aaec8f8a21a`
- Manifest verification: `source.pdf: OK`, `expected.musicxml: OK`, `project.omr: OK`
- Musical approval: repository owner/user explicitly approved the PDF-MusicXML equivalence on 2026-08-09.
- The incomplete opening measure (pickup/anacrusis) is intentional and approved.
- Tie recognition is explicitly included in the musical approval.
- License/use approval: repository owner/user confirmed sufficient rights and approved this exercise for SesliTab golden-reference use under CC0-1.0 on 2026-08-09.
- Real Audiveris OMR evidence chain: PASS.

This evidence satisfies the Plan 0 real-OMR golden-reference comparison requirement for this approved fixture. The earlier four-measure reference remains preserved as historical expected-truth evidence and is not reclassified as a successful Audiveris reproduction.

### Plan 0 Safe Baseline Closure Evidence

- Exact tested source commit: `6485ff117f4559a1a7571994d312a85c1983480e`
- Approved TTS golden output: `tests/fixtures/golden-reference/plan0-safe-baseline-outputs/expected-tts.txt`
- Approved Guitar TAB golden output: `tests/fixtures/golden-reference/plan0-safe-baseline-outputs/expected-guitar-tab.json`
- Golden-output integrity manifest: `tests/fixtures/golden-reference/plan0-safe-baseline-outputs/sha256.txt`
- Golden-output regression test: `tests/plan0SafeBaselineGolden.test.js`
- Focused golden regression: 3 passed, 0 failed
- Full regression: 665 passed, 0 failed, 0 skipped, 0 cancelled
- Production build: passed
- `git diff --check origin/main...HEAD`: passed
- Working tree: clean
- Source archive filename: `seslitab-guitar-reader-plan0-6485ff1.zip`
- Source archive SHA-256: `578835c78285cd2cf2b18ad2917b1e9aca6ee9bc2aaa232b9d569cc6c2c2b42a`
- Source archive integrity: `unzip -t` passed; no compressed-data errors detected
- Source archive record: `docs/plan-0-source-archive.sha256`
- Release/publish: not performed
- Closure PR: #19
- Closure PR head: `39613c590f980f67a6386250b6994363be7a378d`
- Closure PR GitHub Actions run: `31327857090` — completed/success
- Closure PR required job `test-and-build`: completed/success
- Closure merge commit: `4945d5b3ae5b0e1a61138f58673047ae3dba3e2d`
- Post-merge `main` GitHub Actions run: `31327991805` — completed/success
- Post-merge required job `test-and-build`: completed/success
- Remaining Plan 0 closure gate: none

The recovery refs identify source-code state only. They do not roll back Render dashboard environment state, platform-provided variables, persistent `/var/lib/seslitab` data, user files, or production deployment state.

A safe source recovery should create a new working branch from the verified recovery tag or branch, use the normal pull-request path, require the current CI gate, and obtain separate merge approval. Do not use force-push, direct protected-branch rewriting, or destructive reset as the normal recovery procedure.

All Plan 0 Safe Baseline acceptance evidence is present: approved golden references, approved TTS and Guitar TAB golden outputs, SHA-256 integrity records, local focused/full regression evidence, production build evidence, independent source-archive evidence, successful PR CI, separately approved merge, and successful post-merge `main` CI. Package 0 is **Completed**.

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
