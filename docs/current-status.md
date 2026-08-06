# SesliTab Current Status

Last documentation review: 2026-08-06  
Implementation baseline reviewed: `a4ff5ac376e684f06c7375b1bf4c0c6cdf9368d6`

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

## Plan 0R — CI Baseline Status

Plan 0R-A is being prepared on branch `chore/plan-0r-ci-baseline` from main commit `a4ff5ac376e684f06c7375b1bf4c0c6cdf9368d6`.

Workflow changes:

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

Local validation in a temporary clone of the working branch produced:

- `npm ci`: passed.
- `npm test`: 662 tests passed, 0 failed, 0 skipped, 0 cancelled.
- `npm run build`: passed with Vite 8.2.0.

GitHub Actions validation is still pending until the Draft PR creates a real pull-request workflow run. The real check name and final workflow result must be recorded before Plan 0R-A is marked completed.

The existing Audiveris–Render integration was preserved:

- No endpoint changed.
- `RENDER_BASE_URL` did not change.
- Upload, polling, MusicXML download, cleanup, and parser-validation flow did not change.
- `backend/**`, `Dockerfile`, `render.yaml`, application code, tests, dependencies, and production configuration did not change.
- No deployment was performed.

Plan 0R-B branch protection has not been applied. It requires a successful CI merge to main, confirmation of the real required check name, and separate approval.

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

The Plan 0R branch is restricted to:

- `.github/workflows/**`
- `docs/current-status.md`
- `docs/package-status.md`

No application source code, backend code, test file, dependency, deployment configuration, production setting, merge, or deployment is included.
