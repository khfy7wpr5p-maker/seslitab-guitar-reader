# SesliTab Package Status

Last documentation review: 2026-08-09  
Implementation baseline reviewed: `c4f68bfef70b22bd864b2736d2e8d31cd10d036b`

This table is an orientation snapshot, not completion evidence. A package may be marked **Completed** only after its acceptance criteria, focused tests, full regression suite, production build, and required GitHub workflow evidence have been freshly verified.

| Package | Status | Current evidence or limitation |
|---|---|---|
| 0R-A — Verified CI baseline | Completed | PR #14 merged the CI baseline to `main` at `62d7782fc770f807b237ecc54789beb972b658e5`. Local branch validation recorded `npm ci`, 662/662 tests, and production build passing. GitHub Actions run `31156531809` on the merged main SHA completed successfully; required job `test-and-build`, dependency installation, tests, and production build all passed. |
| 0R-B — Main branch protection | Completed | `main` is protected by classic branch protection. PRs are required; required approvals are `0`; stale approvals are dismissed on new commits; latest-push approval and Code Owner review are not required; `test-and-build`, up-to-date branches, and conversation resolution are required; administrator/custom-role bypass is disabled; force pushes and deletions are disabled. No named user, team, or app review-bypass actor was visible in the verified configuration. |
| 0 — Safe baseline | Partially implemented | Baseline commit `c4f68bfef70b22bd864b2736d2e8d31cd10d036b` is pinned by recovery branch `recovery/plan-0-c4f68bfe` and annotated tag `plan-0-baseline-c4f68bfe`. The tag is annotated but unsigned. GitHub-hosted CI on the baseline passed 662/662 tests and the production build. A four-measure single-staff PDF–MusicXML reference pair has now been musically approved by the repository owner/reviewer for CC0-1.0 use, with SHA-256 integrity records under `tests/fixtures/golden-reference/plan0-cc0-4measure/`. The real OMR output has not yet been compared against this expected MusicXML, and no release/ZIP source-archive SHA-256 record exists yet; Package 0 therefore remains partially implemented. |
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
- Independent source ZIP/release artifact: not created
- SHA-256 archive record: not created
- Source PDF golden reference in repository: `tests/fixtures/golden-reference/plan0-cc0-4measure/plan0-cc0-4measure-source.pdf`
- Source PNG/JPG golden reference in repository: not required for this PDF-backed golden-reference case
- OMR input artifact golden reference: the source PDF above is the approved OMR input
- Musically approved expected MusicXML: `tests/fixtures/golden-reference/plan0-cc0-4measure/plan0-cc0-4measure-expected.musicxml`
- Golden-reference SHA-256 manifest: `tests/fixtures/golden-reference/plan0-cc0-4measure/plan0-cc0-4measure-sha256.txt`
- Golden-reference license declaration: repository owner approved this original four-measure exercise for CC0-1.0 use on 2026-08-09
- Musical approval: repository owner/reviewer explicitly confirmed the four-measure PDF–MusicXML match on 2026-08-09
- Golden-reference branch before this record: `44484f7b4d0a05ff5e7652809f999276c058a1e3`
- Real OMR comparison against the approved expected MusicXML: pending
- TTS golden expected result: missing
- Guitar TAB golden expected result: missing
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
- Expected MusicXML SHA-256: `a728bf04c4e381fddf500e3e7b95191929ef71ac7e0e17e99cccf9d595a6652b`
- Approval state: musical PDF–MusicXML equivalence and CC0-1.0 use explicitly approved on 2026-08-09.

This reference defines the expected musical truth. It does not claim that Audiveris has already reproduced that truth. The next acceptance step is a controlled real-OMR comparison of the source PDF against the approved expected MusicXML.

The recovery refs identify source-code state only. They do not roll back Render dashboard environment state, platform-provided variables, persistent `/var/lib/seslitab` data, user files, or production deployment state.

A safe source recovery should create a new working branch from the verified recovery tag or branch, use the normal pull-request path, require the current CI gate, and obtain separate merge approval. Do not use force-push, direct protected-branch rewriting, or destructive reset as the normal recovery procedure.

Package 0 remains incomplete until its golden-reference OMR comparison acceptance criterion and any separately approved archive/integrity requirements are satisfied. Creating the recovery refs or recording the approved reference pair does not by itself mean that Plan 0 is complete.

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
