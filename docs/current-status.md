# SesliTab Current Status

Last documentation review: 2026-08-28  
Verified protected-main closure baseline: `99232915ebcd5089055d0f8695b6c1b08c697739`
Latest verified Package 7 implementation main: `fae1b102eae24926ac48f429124c96f8c58899fe`
Current package closure: **Package 7 — Chord display and Turkish TTS implementation verified; documentation closure pending.**
Next strict roadmap step: **Complete Package 7 closure before Package 8.**

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
- source-only MusicXML `<harmony>` parsing and deterministic basic chord-symbol normalization;
- source-only accessible chord presentation and Turkish chord pronunciation;
- exact NoteObject[] ↔ raw MusicXML chord source handoff;
- accessible `Akorlar` result tab with fail-closed chord TTS lifecycle;
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
- Source-only MusicXML chord display in the accessible `Akorlar` tab
- Source-only Turkish chord TTS through the existing `voiceService`

Package 7 chord output is explicitly source presentation only. It does not infer a chord from notes, does not prove the MusicXML harmony is musically correct, and remains `definitive=false` / `teacherApproved=false`.

## Package 7 implementation evidence

### 7A–7B — presentation and Turkish pronunciation

PR #78 merged as:
`ee9a95a02a75c357e74647a09b1c2b27dafdcc6c`

Accepted final head after review fixes:
`7256806e06ccfa184a77f859e5c8de1714656281`

Exact-main CI #197 / `33144443876`: SUCCESS.

Verified behavior includes:

- deterministic display and Turkish pronunciation from structured Package 6 harmony evidence;
- supported source chord examples such as C, Am, G7, slash chords and N.C.;
- no note-content chord inference;
- explicit physical measure identity and source-relative timing;
- hidden `print-object="no"` degree evidence is not spoken;
- inversion-only metadata does not create a slash bass or extra spoken truth;
- contradictory redundant timing evidence fails closed;
- malformed N.C. with ignored inversion/degree metadata fails closed;
- review/invalid states emit zero display and speech bytes.

### 7C — exact raw MusicXML source handoff

PR #79 merged as:
`56ba563d47f3eec45ea0de88435706c121316a0d`

Accepted head:
`7e98787e881adb06e776b9e8b464d0eb81f39d27`

Exact-main CI #199 / `33145040418`: SUCCESS.

Verified behavior includes:

- raw MusicXML is bound to the exact `NoteObject[]` through a WeakMap source registry;
- source evidence does not transfer to an equivalent cloned array;
- Package 6 remains the only harmony parser;
- Package 7A/B remains the presentation layer;
- source-ready output remains `sourceOnly=true`, `definitive=false`, `teacherApproved=false`;
- missing/review/invalid evidence exposes zero finalized chord output.

### 7D–7F — accessible UI and TTS lifecycle

PR #80 merged as:
`fae1b102eae24926ac48f429124c96f8c58899fe`

Accepted head:
`8b3d793f66b4c1ab98244ffd73cfadaa5ed934e7`

Exact-head CI #200 / `33145271095`: SUCCESS.
Exact-main CI #201 / `33145385541`, job `98765125632`: SUCCESS.

Final implementation-main evidence:

- **1103 / 1103 tests PASS**
- **229 suites**
- **0 failed / skipped / cancelled**
- **120 packages audited**
- **0 vulnerabilities**
- **Vite 8.2.0 production build PASS**
- **55 modules transformed**

Verified UI/TTS behavior includes:

- native accessible `Akorlar` tab and `tabpanel`;
- `aria-selected`, `aria-labelledby`, polite live status and keyboard-focusable text output;
- `textContent`-only chord rendering;
- only source-ready evidence enables chord output or TTS;
- review, invalid, empty and no-source states expose zero chord-output bytes;
- existing Turkish `voiceService` is reused rather than creating a second speech engine;
- chord TTS refuses to start while full-score or selected-measure audio owns the shared lifecycle;
- Package 7 stops shared speech only when it proves ownership of the active chord utterance;
- Package 7-owned TTS is capture-phase preempted before another existing audio consumer starts.

Detailed Package 7 documents:

- `docs/package-7ab-chord-presentation.md`
- `docs/package-7c-chord-source-handoff.md`
- `docs/package-7def-accessible-chord-ui-tts.md`
- `docs/package-7-closure.md`

## Package 7 closure status

Implementation is verified on protected main `fae1b102eae24926ac48f429124c96f8c58899fe` by exact-main CI #201.

Package 7 is **not yet marked Completed** because its package-level documentation/status closure gate is still pending. The current docs-only closure PR must pass exact-head CI, review/freshness, merge through protected main, and exact-main `test-and-build`. A final evidence reconciliation may mark Package 7 Completed only after that evidence exists.

Package 8 must not start before Package 7 closure is verified.

## Package 7 safety boundary

Package 7 does **not**:

- infer chords from note content;
- prove that source harmony matches performed pitches;
- claim Audiveris/OMR harmony correctness;
- claim teacher approval;
- convert source harmony into definitive harmonic truth;
- modify Audiveris provider/runtime/preflight;
- modify OMR worker/provider;
- modify the gateway;
- modify the real OMR E2E workflow;
- add an external chord or TTS dependency;
- perform deployment.

Teacher correction and approval remain Package 8.

## Package 6 closure

Package 6 final closure main:
`99232915ebcd5089055d0f8695b6c1b08c697739`

Exact closure-main CI #188 / `33142995146`, job `98757771854`, succeeded with 1057/1057 tests, 229 suites, audit 0 vulnerabilities and Vite production build PASS.

Detailed Package 6 evidence:

- `docs/package-6-chord-symbol-parser.md`
- `docs/package-6-closure.md`

## Protected main and CI

`main` is protected. Required status check: `test-and-build`.

Latest verified Package 7 implementation main: `fae1b102eae24926ac48f429124c96f8c58899fe`.
Exact implementation-main run #201 / `33145385541` succeeded with 1103/1103 tests, 229 suites, audit 0 vulnerabilities and Vite production build PASS.

The latest fully package-closed baseline remains Package 6 at `99232915ebcd5089055d0f8695b6c1b08c697739` until Package 7 documentation closure completes.

## Remaining product areas

The following remain later work and are not reclassified as completed by Package 7 implementation:

- Teacher correction, revision history and approval workflow — Package 8
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
- Package 6/7 chord information is explicit MusicXML source evidence, not inferred harmonic truth or teacher-approved analysis.
- MIDI export does not infer instrumentation, orchestration, articulation or teacher approval.
- Mobile accessibility is not fully verified on target hardware.

## Current change boundary

The active 7G closure change is documentation-only. It records already-successful Package 7 implementation PRs #78–#80 and exact-main CI #197/#199/#201. It does not change application code, backend code, tests, workflows, dependencies, deployment configuration, branch protection, production settings or production OMR integration.
