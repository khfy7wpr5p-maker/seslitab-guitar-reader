# SesliTab Current Status

Last documentation review: 2026-08-28  
Latest verified Package 7 technical main: `7c37057713aa8a975edafdb0928d64f575d7cd5f`
Current package closure: **Package 7 — closure pending final documentation exact-main gate.**
Package 8 — Teacher correction and approval: **not started** and must not begin until Package 7 closure evidence is final.

This file is a concise orientation document. It is not a substitute for a fresh read-only audit, test run, production build or GitHub Actions result.

## Verified foundations

The repository currently contains verified foundations for:

- accessible web interface foundations;
- PDF upload and validation;
- Cloud OMR Gateway;
- mock and Audiveris provider adapters;
- asynchronous OMR job processing and recovery;
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
- deterministic SMF0 MIDI export;
- conservative quality-gated Basic Guitar TAB and accessible UI;
- conservative quality-gated Basic Violin first-position guidance and accessible UI;
- source-only MusicXML `<harmony>` parsing and deterministic chord-symbol normalization;
- source-only accessible chord presentation and Turkish pronunciation;
- atomic exact `NoteObject[]` ↔ raw MusicXML chord source handoff;
- accessible `Akorlar` result tab with fail-closed shared-audio Turkish TTS lifecycle;
- automated tests and production-build gates.

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
- Quality-gated deterministic `.mid` download
- Quality-gated deterministic Basic Guitar TAB text
- Quality-gated Basic Violin first-position tel/parmak guidance
- Source-only MusicXML chord display in the accessible `Akorlar` tab
- Source-only Turkish chord TTS through the existing `voiceService`

Package 7 chord output is explicitly source presentation only. It does not infer a chord from notes, does not prove the MusicXML harmony is musically correct, and remains `sourceOnly=true`, `definitive=false`, `teacherApproved=false`.

## Package 7 implementation evidence

### 7A–7B — presentation and Turkish pronunciation

Status: **Completed**.

- PR #78
- merge `ee9a95a02a75c357e74647a09b1c2b27dafdcc6c`
- exact-main CI #197 / `33144443876`: SUCCESS

Verified: deterministic display/Turkish pronunciation from Package 6 evidence, physical measure identity/timing, visible/spoken parity, fail-closed review/invalid handling, no chord inference.

### 7C — exact raw MusicXML source handoff

Status: **Completed**, including stale-source security hotfix.

Original implementation:

- PR #79
- merge `56ba563d47f3eec45ea0de88435706c121316a0d`
- exact-main CI #199 / `33145040418`: SUCCESS

Late stale-source security hotfix:

- PR #82
- accepted head `0968a439a8e5b2a8712d216277f7466c8ba84daa`
- merge `7c37057713aa8a975edafdb0928d64f575d7cd5f`
- exact-head CI #204 / `33145943788`: SUCCESS
- exact-main CI #205 / `33146058408`, job `98767251803`: SUCCESS

The source association is atomic with the current preparation attempt. A failed blank/malformed/structurally rejected replacement cannot leave older raw MusicXML consumable for the same exact note array.

### 7D–7F — accessible UI and TTS lifecycle

Status: **Completed**.

- PR #80
- merge `fae1b102eae24926ac48f429124c96f8c58899fe`
- exact-head CI #200 / `33145271095`: SUCCESS
- exact-main CI #201 / `33145385541`: SUCCESS

Verified behavior includes:

- native accessible `Akorlar` tab/tabpanel;
- `aria-selected`, `aria-labelledby`, polite live status and focusable text output;
- only source-ready evidence renders chord text or enables TTS;
- REVIEW/INVALID/EMPTY/NO_SOURCE expose zero chord bytes;
- rendering uses `textContent`;
- existing `voiceService` is reused;
- shared-audio ownership prevents lifecycle collisions with full-score and selected-measure consumers;
- Package 7-owned TTS is preempted safely before another audio consumer starts.

### 7G — final package closure

Status: **closure pending**.

- closure-pending PR #81 merged as `fef1464c882878fd1dd9921959887b9080f30927`
- exact-main CI #203: SUCCESS
- late P2 was then corrected by PR #82 and exact-main CI #205.
- current final documentation gate: PR #83.

Technical baseline before PR #83:

`7c37057713aa8a975edafdb0928d64f575d7cd5f`

Exact-main CI #205 / `33146058408`, job `98767251803`:

- **1105 / 1105 tests PASS**
- **229 suites**
- **0 failed / skipped / cancelled**
- **120 packages audited**
- **0 vulnerabilities**
- **Vite 8.2.0 production build PASS**
- **55 modules transformed**

PR #83 exact-head CI #206 / `33146234567`, job `98767794592`: SUCCESS with the same 1105/1105 regression, audit 0 and production build PASS. Package 7 remains closure-pending until PR #83 merges and its exact protected-main push `test-and-build` succeeds.

Detailed documents:

- `docs/package-7ab-chord-presentation.md`
- `docs/package-7c-chord-source-handoff.md`
- `docs/package-7def-accessible-chord-ui-tts.md`
- `docs/package-7-closure.md`

## Package 7 safety boundary

Package 7 did **not**:

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

## Protected main and CI

`main` is protected. Required status check: `test-and-build`.

Latest verified Package 7 technical main before final documentation closure:
`7c37057713aa8a975edafdb0928d64f575d7cd5f`.

The active PR #83 must merge through protected main and its exact-main `test-and-build` must succeed before Package 7 may be marked **Completed**. Package 8 remains not started during this gate.

## Remaining product areas

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
- Package 2E does not establish one universally best preprocessing variant.
- Teacher-supervised review remains part of the product model.
- Basic Guitar TAB is deterministic conservative output, not teacher-approved advanced fingering.
- Basic Violin is deterministic conservative first-position output, not teacher-approved advanced fingering.
- Package 6/7 chord information is explicit MusicXML source evidence, not inferred harmonic truth or teacher-approved analysis.
- MIDI export does not infer instrumentation, orchestration, articulation or teacher approval.
- Mobile accessibility is not fully verified on target hardware.

## Current change boundary

PR #83 is documentation-only. It reconciles already-successful Package 7 implementation and hotfix evidence while deliberately retaining package-level `closure pending` status until its own exact-main gate succeeds. It does not change application code, backend code, tests, workflows, dependencies, deployment configuration, branch protection, production settings or production OMR integration.
