# SesliTab Current Status

Last documentation review: 2026-08-28  
Implementation baseline reviewed: `4417a32f3ddaa46dacf149dc1317f6a83d19403c`
Current package closure: **Package 6 — MusicXML Chord-Symbol Parser completed at the verified implementation baseline.**
Next strict roadmap package: **Package 7 — Chord display and Turkish TTS**.

This file is a concise orientation document. It is not a substitute for a fresh read-only audit, test run, production build or GitHub Actions result.

## Verified foundations

The repository currently contains verified foundations for:

- accessible web interface foundations;
- PDF upload and validation;
- Cloud OMR Gateway;
- mock and Audiveris provider adapters;
- asynchronous OMR job processing;
- persistent job metadata and restart recovery;
- file, multipart, API and MusicXML security boundaries;
- MusicXML note parsing;
- Guitar TAB text parsing;
- shared canonical `NoteObject` pitch/time/source-verification model;
- structural/rhythmic MusicXML validation;
- Package 2C quality/error reporting;
- Package 2D fail-closed `ACCEPT` / `REVIEW` / `BLOCK` consumer gate;
- Package 2E deterministic OMR benchmark/evidence framework;
- Turkish rhythmic text and Rhythmic HTML;
- Turkish text-to-speech;
- Web Audio musical playback;
- canonical measure selection and accessible measure controls;
- selected-measure TTS/playback;
- dependency-free deterministic SMF0 MIDI export;
- conservative quality-gated Basic Guitar TAB generation and accessible result UI;
- conservative quality-gated Basic Violin first-position guidance and accessible result UI;
- isolated source-only MusicXML `<harmony>` parsing and deterministic basic chord-symbol normalization;
- Docker/Render configuration;
- automated test and production-build gates.

## Current inputs

- PDF through the OMR gateway
- Direct MusicXML upload
- Guitar TAB text

## Current outputs

- Turkish rhythmic text
- Rhythmic HTML
- Note cards
- Raw MusicXML view
- Turkish text-to-speech
- Web Audio musical playback
- MusicXML download
- Audiveris `.omr` download when available
- Quality-gated deterministic `.mid` download for accepted canonical MusicXML data
- Quality-gated deterministic Basic Guitar TAB text for supported accepted canonical MusicXML data
- Quality-gated Basic Violin first-position tel/parmak guidance for supported accepted canonical MusicXML data

Package 6 currently provides internal parsed chord-symbol evidence. Chord presentation and Turkish chord TTS are not yet exposed as a verified product output; those belong to Package 7.

## Package 4 status

Package 4 — Basic Guitar TAB is completed.

Final implementation main: `424653c60ff35326ae137cdf8b72b43eeb7d25e1`.
Exact-main CI #155 / `33111922206` succeeded with 961/961 tests, 229 suites, audit 0 and production build PASS.

Detailed evidence: `docs/package-4-closure.md` plus Package 4A–4F stage documents.

## Package 5 status

Package 5 — Basic Violin is completed.

Final implementation main: `0465dba0c40e66ad0d8c77ea47b62fbd421209de`.
Exact-main CI #177 / `33119971061` succeeded with 1031/1031 tests, 229 suites, audit 0 and production build PASS.

Detailed evidence: `docs/package-5-closure.md` plus Package 5A–5F stage documents.

## Package 6 status

Package 6 — MusicXML Chord-Symbol Parser implementation is merged on protected main.

Implementation PR: #75  
Accepted review-fixed head: `3bb822d2df750079359c2c8c9e43060f6b0fedd2`  
Implementation main: `4417a32f3ddaa46dacf149dc1317f6a83d19403c`

Exact implementation-main CI #184 / `33124708562` succeeded:

- exact `head_sha`: `4417a32f3ddaa46dacf149dc1317f6a83d19403c`
- required job: `98699924529` / `test-and-build`
- tests: 1057 / 1057 passed
- suites: 229
- failed/skipped/cancelled: 0 / 0 / 0
- 120 packages audited
- vulnerabilities: 0
- Node: 24.19.0
- npm: 11.17.0
- Vite 8.2.0 production build: PASS
- transformed modules: 49

Verified Package 6 behavior includes:

- source-only parsing of explicit MusicXML `<harmony>` evidence;
- deterministic normalization of supported basic chord symbols such as `C`, `Am`, `G7`, slash chords and `N.C.`;
- preservation of explicit root, kind, bass, inversion, degrees, staff and source provenance;
- physical `partId` / `measureIndex` identity and source-order harmony timing;
- support for both `score-partwise` and `score-timewise` layouts;
- no slash-bass invention from inversion alone;
- unknown kinds, unsupported/microtonal accidentals, unsupported functional harmony and malformed degree evidence remain `REVIEW_REQUIRED` with no finalized symbol;
- missing/duplicate part identity fails closed;
- malformed or missing timing evidence never receives an invented onset;
- valid mid-measure divisions changes preserve elapsed beat position;
- malformed explicit divisions invalidate stale inherited timing.

Two valid Codex review findings on divisions handling were fixed before PR #75 merged and received dedicated regression coverage.

Detailed evidence:

- `docs/package-6-chord-symbol-parser.md`
- `docs/package-6-closure.md`

## Package 6 safety boundary

Package 6 does **not**:

- infer chords from note content;
- prove that the source harmony matches the performed pitches;
- claim Audiveris/OMR harmony correctness;
- claim teacher approval;
- interpret Roman-numeral/functional harmony;
- expose chord display or Turkish chord pronunciation;
- modify the production note parser;
- modify Audiveris/provider/worker/gateway/E2E behavior;
- add an external chord dependency;
- perform deployment.

## Protected main and CI

`main` is protected. Required status check: `test-and-build`.

Latest verified Package 6 implementation main: `4417a32f3ddaa46dacf149dc1317f6a83d19403c`.
Exact implementation run #184 / `33124708562` succeeded with 1057/1057 tests, 229 suites, audit 0 vulnerabilities and Vite production build PASS.

## Remaining product areas

The following remain later work and are not reclassified as completed by Package 6:

- Chord display and Turkish TTS — Package 7
- Teacher correction, revision history and approval workflow
- Audiveris teacher-approved training dataset
- Advanced Guitar TAB
- Advanced violin
- Accessible tuner
- Teacher-to-student sharing
- Simplified rhythm-training mode
- Full mobile productisation and device-level VoiceOver verification
- User authentication, roles and job ownership

## Known limitations

- Structural validity is not proof of musical correctness.
- Source-unverified OMR must remain non-definitive.
- Package 2E benchmark capability does not establish one universally best preprocessing variant.
- Teacher-supervised review remains part of the product model.
- Basic Guitar TAB is a deterministic conservative generated view, not teacher-approved advanced fingering.
- Basic Violin is a deterministic conservative first-position generated view, not teacher-approved advanced fingering.
- Package 6 chord symbols are parsed source evidence, not inferred harmonic truth or teacher-approved analysis.
- MIDI export does not infer instrumentation, orchestration, articulation or teacher approval.
- Mobile accessibility is not fully verified on target hardware.

## Current change boundary

This Package 6 closure package is documentation/status reconciliation only:

- `docs/current-status.md`
- `docs/package-status.md`
- `docs/package-6-chord-symbol-parser.md`
- `docs/package-6-closure.md`

No application code, backend code, test code, workflow, dependency, deployment configuration, branch-protection setting, production setting or production OMR integration is intentionally changed by this closure package. No deployment is performed.
