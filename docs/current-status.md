# SesliTab Current Status

Last documentation review: 2026-08-27  
Implementation baseline reviewed: `23f758b6231c282b0d10832820e18007dbaea65f`
Current package closure: **Package 2E — OMR Benchmark**
Next package after protected-main closure verification: **Package 3A — Not started**

This file is a concise orientation document. It is not a substitute for a fresh read-only audit, test run, production build, or GitHub Actions result.

## Verified Foundations

The repository currently contains verified foundations for:

- Accessible web interface foundations
- PDF upload and validation
- Cloud OMR Gateway
- Mock and Audiveris provider adapters
- Asynchronous OMR job processing
- Persistent job metadata and restart recovery logic
- File, multipart, API and MusicXML security boundaries
- MusicXML parsing
- Guitar TAB text parsing
- Shared canonical `NoteObject` pitch/time model
- Canonical source-verification metadata and consumer policy
- Structural/rhythmic MusicXML validation
- Package 2C quality and error reporting
- Package 2D fail-closed `ACCEPT` / `REVIEW` / `BLOCK` gate
- Production TTS and rhythmic-playback quality-gate enforcement
- Package 2E deterministic OMR benchmark/evidence framework
- Teacher-verified golden MusicXML comparison support
- Isolated eight-variant experimental benchmark orchestration
- Evidence-only Pareto recommendation policy
- Turkish rhythmic text
- Rhythmic HTML
- Turkish text-to-speech
- Web Audio musical playback
- Docker and Render deployment configuration
- Automated tests and production build gate

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

## Package 2A–2E Status

- **2A — Canonical note and time model: Completed.** Closure merge `47b3ad374fdd49fdd1898c5e0c1b085fde7b9959`; post-merge CI `33068597173` passed.
- **2B — Structural and rhythmic validator: Completed.** Closure merge `e2fa6f6947334388d6a08299220d31f6d8462ab1`; post-merge CI `33073348226` passed.
- **2C — Quality and error report: Completed.** Technical closure merge `8292f82327b6290d182b029e5ba402ae16c31cff`; post-merge CI `33076690354` passed with 756/756 tests and audit 0.
- **2D — Quality gate integration: Completed.** Technical closure merge `0c9df668ddcb1b16d1d5b4ca6dd1d3839d441d95`; post-merge CI `33082106942` passed with 775/775 tests and audit 0.
- **2E — OMR benchmark: Completed by this closure package once merged to protected `main` and exact-main CI passes.** Code stages PR #45 through PR #49 are merged. Technical closure baseline `23f758b6231c282b0d10832820e18007dbaea65f`; post-2E-E main CI run `33090396467` / run #109 passed with 839/839 tests, 229 suites, audit 0 vulnerabilities, and production build PASS.

Detailed evidence is in:

- `docs/package-2c-closure.md`
- `docs/package-2d-closure.md`
- `docs/package-2e-benchmark-contract.md`
- `docs/package-2e-closure.md`

## Package 2E Safety Boundary

Package 2E is an experimental benchmark/evidence framework. Its completion does not claim error-free OMR or a universal accuracy percentage.

Verified rules include:

- regression-only real-OMR outputs are not silently treated as teacher-approved ground truth;
- no golden truth means comparison metrics stay `NOT_MEASURED`;
- ambiguous event correspondence becomes `REVIEW_REQUIRED`;
- all eight approved variants remain isolated;
- original source bytes are protected by deterministic SHA-256/byte-length checks;
- temporary workspaces are cleaned on success and failure;
- no cross-variant note merging is allowed;
- no weighted score may invent a benchmark winner;
- a winner is emitted only under strict complete measured Pareto-dominance evidence;
- production source verification is never elevated by benchmark structure alone.

The production Audiveris provider/runtime/preflight, OMR worker/provider, gateway, production MusicXML OMR path, and E2E workflow were not intentionally changed by Package 2E.

## Protected Main and CI

`main` is protected. Required status check: `test-and-build`.

Package 2E-E was merged through PR #49 as `23f758b6231c282b0d10832820e18007dbaea65f`. Exact post-merge `main` CI run `33090396467` / run #109 completed successfully:

- `npm ci`: PASS
- 120 packages audited
- 0 vulnerabilities
- tests: 839 passed / 839 total
- suites: 229
- failed: 0
- skipped: 0
- cancelled: 0
- production build: PASS with Vite 8.2.0

This documentation closure must independently pass the same exact-head and post-merge required CI gates before Package 3A may start.

## Remaining Product Areas

The following remain later work and are not reclassified as completed by Package 2E:

- Package 3A and later playback/interface work
- Complete play/pause/resume/stop lifecycle where not yet verified
- Unique measure selection throughout the interface
- Rhythmic HTML measure controls
- One-measure speak/play workflows
- Real MIDI timeline and optional `.mid` export
- Production canonical NoteObject → Guitar TAB generation
- Teacher correction, revision history and approval workflow
- Secure teacher-to-student sharing
- Student practice sessions
- Basic and advanced Guitar TAB engines
- Violin support
- MusicXML harmony and chord-name support
- Accessible tuner
- Simplified rhythm-training mode
- Full mobile productisation and device-level VoiceOver verification
- User authentication, roles and job ownership

## Known Limitations

- Structural validity is not proof of musical correctness.
- Source-unverified OMR must remain non-definitive.
- Package 2E benchmark capability does not mean a real experiment has established one universally best preprocessing variant.
- Teacher-supervised review remains part of the product model.
- Production canonical Guitar TAB generation remains fail-closed until its later package.
- Real MIDI export is not completed.
- Mobile accessibility is not fully verified on target hardware.

## Current Change Boundary

The Package 2E closure package is documentation/status reconciliation only:

- `docs/current-status.md`
- `docs/package-status.md`
- `docs/package-2e-benchmark-contract.md`
- `docs/package-2e-closure.md`

No application code, backend code, test code, workflow, dependency, deployment configuration, branch-protection setting, production setting, or production OMR integration is intentionally changed by the closure package. No deployment is performed.
