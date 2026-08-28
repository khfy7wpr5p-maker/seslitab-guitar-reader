# SesliTab Current Status

Last documentation review: 2026-08-28  
Verified protected-main closure baseline: `99232915ebcd5089055d0f8695b6c1b08c697739`
Current package closure: **Package 6 — MusicXML Chord-Symbol Parser completed.**
Next strict roadmap package: **Package 7 — Chord display and Turkish TTS.**

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

Package 6 provides internal parsed source chord-symbol evidence. Chord presentation and Turkish chord TTS are the next Package 7 work and are not yet claimed as verified product outputs.

## Package 6 closure

Package 6 implementation PR #75 merged as:
`4417a32f3ddaa46dacf149dc1317f6a83d19403c`

Accepted implementation head after review fixes:
`3bb822d2df750079359c2c8c9e43060f6b0fedd2`

Implementation exact-main CI #184 / `33124708562` succeeded with:

- 1057 / 1057 tests PASS
- 229 suites
- 120 packages audited
- 0 vulnerabilities
- Vite 8.2.0 production build PASS
- 49 modules transformed

Package-level documentation closure PR #76 used accepted head:
`bf91a58951cbef79842b093656d3e75f61cb71b9`

Closure merge on protected main:
`99232915ebcd5089055d0f8695b6c1b08c697739`

Exact closure-main CI #188 / `33142995146`, job `98757771854` / `test-and-build`, succeeded with:

- 1057 / 1057 tests PASS
- 229 suites
- 0 failed / skipped / cancelled
- 120 packages audited
- 0 vulnerabilities
- Vite 8.2.0 production build PASS
- 49 modules transformed

This evidence satisfies the Package 6 closure gate. The present reconciliation only records that already-achieved state; it does not create a new closure gate.

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

Latest verified Package 6 closure main: `99232915ebcd5089055d0f8695b6c1b08c697739`.
Exact closure run #188 / `33142995146` succeeded with 1057/1057 tests, 229 suites, audit 0 vulnerabilities and Vite production build PASS.

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

This evidence reconciliation changes documentation only. It records the already-successful Package 6 closure PR #76 and exact-main CI #188. It does not change application code, backend code, tests, workflows, dependencies, deployment configuration, branch protection, production settings or production OMR integration.
