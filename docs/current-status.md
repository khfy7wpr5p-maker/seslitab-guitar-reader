# SesliTab Current Status

Last documentation review: 2026-08-09  
Implementation baseline reviewed: `62d7782fc770f807b237ecc54789beb972b658e5`

This file is a concise orientation document. It is not a substitute for a fresh read-only audit, test run, production build, or GitHub Actions result.

## Verified Foundations

The repository currently contains foundations for:

- An accessible web interface
- PDF upload
- A Cloud OMR Gateway
- Mock and Audiveris provider adapters
- Asynchronous job processing
- Persistent job metadata and restart recovery logic
- MusicXML parsing
- Guitar TAB text parsing
- A shared `NoteObject` model
- Canonical pitch resolution
- Canonical timing and duration resolution
- Turkish rhythmic text
- Turkish text-to-speech
- Web Audio musical playback
- Docker and Render deployment configuration
- Automated tests and a production build command

## Current Inputs

- PDF through the OMR gateway
- Direct MusicXML upload
- Guitar TAB text

## Current Outputs

- Turkish rhythmic text
- Rhythmic HTML
- Note cards
- Raw MusicXML view
- Turkish text-to-speech
- Musical playback
- MusicXML download
- Audiveris `.omr` download when available

The current playback system uses Web Audio. It does not yet represent a completed real MIDI export package.

## Plan 0R — CI and Main Protection Status

Plan 0R-A and Plan 0R-B have been verified against the current `main` baseline.

### Plan 0R-A — Verified CI baseline

PR #14 merged the CI baseline to `main` at commit `62d7782fc770f807b237ecc54789beb972b658e5`.

Workflow changes included:

- Added `.github/workflows/ci.yml`.
- Updated `.github/workflows/e2e-render-omr.yml` to use Node.js 24.
- Updated the Render health assertions to the public safe runtime fields actually emitted by the backend.
- Added read-only `contents: read` workflow permissions.

The general CI workflow runs, in order:

```bash
npm ci
npm test
npm run build
```

Local validation recorded on the Plan 0R-A branch before merge:

- `npm ci`: passed.
- `npm test`: 662 tests passed, 0 failed, 0 skipped, 0 cancelled.
- `npm run build`: passed with Vite 8.2.0.

GitHub-hosted validation on the merged `main` commit is also complete:

- Workflow: `CI`
- Run ID: `31156531809`
- Event: `push`
- Head SHA: `62d7782fc770f807b237ecc54789beb972b658e5`
- Conclusion: `success`
- Required job: `test-and-build`
- `Install dependencies`: passed
- `Run tests`: passed
- `Build production bundle`: passed

The existing Audiveris–Render integration was preserved:

- No endpoint changed.
- `RENDER_BASE_URL` did not change.
- Upload, polling, MusicXML download, cleanup, and parser-validation flow did not change.
- `backend/**`, `Dockerfile`, `render.yaml`, application code, tests, dependencies, and production configuration did not change as part of Plan 0R-A.
- No deployment was performed.

### Plan 0R-B — Main branch protection

`main` is protected by a classic branch protection rule. Repository rulesets and effective rulesets for `main` were read as empty, so no repository or organization ruleset is currently combined with the classic rule.

The missing branch-protection fields were verified read-only in the GitHub settings UI because the connected integration and `gh api` protection-detail request both returned HTTP 403 for the detailed branch-protection endpoint.

Verified effective settings:

- `Require a pull request before merging`: enabled.
- `Require approvals`: disabled, therefore required approving review count is `0`.
- `Dismiss stale pull request approvals when new commits are pushed`: enabled.
- `Require review from Code Owners`: disabled.
- `Require approval of the most recent reviewable push`: disabled.
- `Require status checks to pass before merging`: enabled.
- Required status check: `test-and-build`.
- `Require branches to be up to date before merging`: enabled.
- `Require conversation resolution before merging`: enabled.
- `Do not allow bypassing the above settings`: enabled, so the rule applies to administrators and custom roles with branch-protection bypass permission.
- No named user, team, or GitHub App review-bypass actor was visible in the verified protection configuration.
- `Allow force pushes`: disabled.
- `Allow deletions`: disabled.

Required approvals are intentionally `0`: this avoids an approval-only deadlock in a single-developer repository, but it also means a second human review is not a mandatory merge condition. CI, pull-request routing, conversation resolution, branch freshness, and administrator enforcement remain the active mandatory protections.

No branch protection or repository setting was changed during this verification.

## Partially Implemented or Not Fully Verified

- End-to-end structural and rhythmic validation
- Quality and reliability reporting
- Canonical consumption policy across every output consumer
- Mandatory quality-gate enforcement for TTS, playback, and Guitar TAB
- Real cancellation of every running Audiveris process
- Retry and duplicate-job safety under all failure conditions
- Multi-part and multi-voice processing
- Unique measure selection throughout the interface
- Safe Guitar TAB position selection
- Mobile accessibility on real iPhone and VoiceOver devices

## Planned Product Areas

- Teacher correction interface
- Automatic, teacher-corrected, and teacher-approved revisions
- Approval invalidation after later edits
- Secure teacher-to-student sharing
- Student practice sessions
- Basic and advanced Guitar TAB engines
- Real MIDI timeline and optional `.mid` export
- Violin support
- MusicXML harmony and chord-name support
- Accessible tuner
- Simplified rhythm-training mode
- Full mobile productisation
- User authentication, roles, and job ownership

## Known Documentation Risks

Some older architecture and API documents describe planned behaviour as if implementation had not started, while the repository now contains a working backend foundation.

Other documents include future endpoints or larger upload limits that do not fully match the current Express server.

Therefore:

- Treat source code and fresh tests as authoritative for current behaviour.
- Treat `docs/project-charter.md` as authoritative for product and safety rules.
- Report every documentation/code mismatch explicitly.

## Current Change Boundaries

The Plan 0R status-convergence documentation package is restricted to:

- `docs/current-status.md`
- `docs/package-status.md`

No application source code, backend code, test file, workflow, dependency, deployment configuration, production setting, branch-protection setting, merge, or deployment is included.
