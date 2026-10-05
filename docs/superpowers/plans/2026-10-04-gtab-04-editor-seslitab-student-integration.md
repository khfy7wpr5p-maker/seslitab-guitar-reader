# GTAB-04 Editor → SesliTab → Student App Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver teacher-authored exact Guitar TAB MusicXML from `st-guitar-tab-editor` through the existing SesliTab assignment pipeline into ST Student App without recalculating string/fret or weakening SCORE authority.

**Architecture:** `st-guitar-tab-editor` remains an independent offline/PC authoring tool. SesliTab owns the integration trust boundary: it accepts a prepared SCORE upload plus Guitar TAB MusicXML, validates the TAB structurally and semantically against that SCORE, binds the two to the same draft/fingerprint, and then passes the exact validated TAB bytes through the already-existing `guitarTabMusicXml → content.guitarTab` PracticePackage contract. Student App production code is not changed for this slice; existing `content.guitarTab` + ST renderer behavior is qualified at an exact Student App SHA.

**Tech Stack:** JavaScript ESM; Node 24; Web Crypto SHA-256; existing SesliTab MusicXML security/parser boundaries; Editor-aligned direct standard-tuning physical validation; Student PracticePackage v1; ST Score Rendering Layer / OSMD 2.1.2 consumer boundary.

**Spec:** `st-guitar-tab-editor` architecture and MVP plan merged at `main@9fc2a5b8eae19bcf1972cd6c3a451210b9a0c243`; Notion MVP plan: https://app.notion.com/p/3ef2be2e5664817797b6d7febf79947f?pvs=204

## Baselines

- Editor: `khfy7wpr5p-maker/st-guitar-tab-editor@9fc2a5b8eae19bcf1972cd6c3a451210b9a0c243`
- SesliTab: `khfy7wpr5p-maker/seslitab-guitar-reader@9949abb0d03212998935927005b3e4b7568ba828`
- Student App: `khfy7wpr5p-maker/st-student-app@5f7d1d5a1b70616e599dec21ac384649d4803fcd`

## Global Constraints

- SCORE MusicXML remains pitch/rhythm/voice/timing authority.
- Teacher-authored Editor string/fret is never replaced by `generated-basic`, `lowest-fret-v1`, Guitar TAB Engine, alphaTab, or another solver.
- No runtime dependency from SesliTab or Student App to `st-guitar-tab-editor`.
- No runtime dependency from this flow to `musicxml-to-guitar-tab-engine` or alphaTab.
- Editor output accepted here is one Guitar part, two staffs, TAB staff 2, exactly six TAB lines, standard E2 A2 D3 G3 B3 E4 tuning, frets `0..20`, and 1–6 simultaneous pitched notes.
- One Guitar part may contain Voice 1, Voice 2, Voice 3 and Voice 4. Voice identity and timing must be preserved end-to-end; notes from different voices that share an onset are validated as one simultaneous physical TAB group.
- Every TAB staff pitched note must contain explicit MusicXML `<technical><string>` and `<fret>`.
- A simultaneous group cannot assign two notes to the same physical string, including collisions across different voices.
- Physical validation follows the Editor contract exactly: open-string MIDI `{1:64,2:59,3:55,4:50,5:45,6:40}` plus fret must equal the event's source MusicXML pitch MIDI. Do **not** use SesliTab legacy `BASIC_GUITAR_WRITTEN_TRANSPOSITION = -12` / generated-basic candidate resolution for Editor handoff validation.
- Mismatched/stale/malformed/incomplete TAB fails closed and is never delivered.
- Existing SCORE-only assignments remain byte-for-byte behavior-compatible when no Guitar TAB is supplied.
- Student App remains read-only; it does not infer, repair, or regenerate TAB positions.
- No production deployment, Secure Delivery production-write activation, or merge to protected branches without a separate explicit human gate.

## Review Focus

1. **Stale TAB + newer SCORE:** reject before package creation; prove score fingerprint/draft binding and semantic mismatch detection.
2. **Same notes but wrong timing/voice:** reject; compare measure/onset/duration/voice/pitch/tie semantics, not only pitch count, including Voice 1–4.
3. **Physical collision:** reject two simultaneous staff-2 notes that use the same string, including notes contributed by different voices.
4. **Wrong technical position:** reject any string/fret whose direct standard-tuning MIDI does not equal the source pitch; enforce Editor fret ceiling `20` and never invoke legacy `-12` generated-basic mapping.
5. **Consumer regression:** prove Student App receives TAB as `content.guitarTab` and renders it independently while SCORE playback/timing remains sourced from `content.score`.

---

### Task 1: Add a fail-closed Editor Guitar TAB handoff validator

**Files:**
- Create: `src/services/editorGuitarTabHandoff.js`
- Create: `tests/editorGuitarTabHandoff.test.js`
- Reuse: `musicXmlSecurity.js`
- Reuse: `musicXmlParser.js` structural conventions where safe
- Reuse: `src/services/teacherAssignmentComposerScoreUpload.js`
- Do not reuse: `guitarPositionResolver.js` for physical acceptance; its legacy written-guitar `-12` transposition contract does not match `st-guitar-tab-editor` direct source-pitch validation.

**Interfaces:**
- Consumes: prepared SES-153 SCORE upload `{ draftId, musicXml, musicXmlFingerprint, createdAt, canonicalEvents }` and raw Editor Guitar TAB MusicXML.
- Produces: `prepareEditorGuitarTabHandoff({ scoreUpload, guitarTabMusicXml, draftId }) -> Promise<PreparedEditorGuitarTabHandoff>`.
- `PreparedEditorGuitarTabHandoff` fields are exactly: `schemaVersion: '1.0.0'`, `draftId`, `scoreMusicXmlFingerprint`, `guitarTabMusicXmlFingerprint`, `guitarTabMusicXml`, `pitchedEventCount`.

- [ ] **Step 1: Write RED tests for input/security/shape.** Require non-empty raw XML; `score-partwise`; one part; two staffs; staff 2 TAB clef; `staff-lines=6`; exact standard tuning; no unpitched/percussion; all staff-2 pitched notes have explicit technical string/fret; fret in `0..20`.
- [ ] **Step 2: Run `node --test tests/editorGuitarTabHandoff.test.js` and require the new tests to fail for missing implementation.**
- [ ] **Step 3: Implement the smallest strict XML evidence reader in `editorGuitarTabHandoff.js`.** Use the existing `inspectMusicXml` boundary before DOM parsing; do not add an XML dependency.
- [ ] **Step 4: Add RED semantic-parity tests.** Compare original SCORE pitched events to TAB staff 1, and TAB staff 1 to staff 2, using stable event semantics: measure index, onset, duration, voice, written pitch, tie start/stop. Include explicit Voice 1, 2, 3 and 4 cases, with cross-voice same-onset groups. Rests may be represented by forward gaps and are not required to exist as TAB note nodes.
- [ ] **Step 5: Add RED guitar-physics tests.** For every staff-2 note, compute direct MIDI from MusicXML pitch and require `EDITOR_STANDARD_TUNING_MIDI[string] + fret === pitchMidi`; reject missing technical data, fret >20, and duplicate string within one same-onset group across all voices. Include a regression proving a valid Editor C4 → string 2 fret 1 assignment is accepted rather than rejected by legacy `-12` mapping.
- [ ] **Step 6: Implement semantic/physical validation and SHA-256 fingerprinting.** `scoreUpload.musicXmlFingerprint` is authoritative for the source binding; compute a separate SHA-256 for the TAB bytes. The Editor's internal FNV session fingerprint is not a delivery authority.
- [ ] **Step 7: Run the focused test and then `npm test`; require PASS.**
- [ ] **Step 8: Commit only Task 1 files.**

### Task 2: Bind validated TAB to Assignment Composer without changing SCORE authority

**Files:**
- Modify: `src/services/teacherAssignmentComposerService.js`
- Modify: `tests/teacherAssignmentComposerService.test.js`
- Reuse: `src/services/editorGuitarTabHandoff.js`
- Reuse unchanged production contract: `src/services/studentPracticePackageV1.js`

**Interfaces:**
- Add service method: `prepareGuitarTabUpload({ scoreUpload, guitarTabMusicXml, draftId })` delegating to `prepareEditorGuitarTabHandoff`.
- Extend `send(...)` input with optional `guitarTabUpload = null`.
- `guitarTabUpload` may be used only when `scoreUpload` is non-null and must match the same `draftId` and `scoreUpload.musicXmlFingerprint`.

- [ ] **Step 1: Write RED composer tests for valid SCORE+TAB, SCORE-only backward compatibility, TAB-without-SCORE rejection, wrong draft rejection, wrong score fingerprint rejection, and mutated TAB rejection.**
- [ ] **Step 2: Run focused composer tests and confirm RED.**
- [ ] **Step 3: Add `prepareGuitarTabUpload` and strict `send` input handling.** Before delivery, re-run the handoff preparation against the verified SCORE upload so a caller cannot mutate or forge a prepared object.
- [ ] **Step 4: Pass only `verifiedGuitarTabUpload.guitarTabMusicXml` into the existing `createStudentPrivatePracticePackageV1({ guitarTabMusicXml })` field.** Do not add a new assignment type; TAB remains a SCORE sub-capability.
- [ ] **Step 5: Add an assertion that delivered `content.guitarTab.data` preserves the validated TAB XML bytes exactly and retains the teacher technical string/fret values.**
- [ ] **Step 6: Run focused tests and then `npm test`; require PASS.**
- [ ] **Step 7: Commit Task 2.**

### Task 3: Lock PracticePackage and generated-basic non-interference regressions

**Files:**
- Modify tests only: `tests/studentPracticePackageV1.test.js`
- Modify tests only: `tests/scorePracticePackageBuilder.test.js` if the builder path is exercised by the integration harness
- Add or extend test coverage around existing guitar-position policy without changing `guitarBasicPositionPolicy.js`

**Interfaces:**
- Existing contract remains `content.guitarTab = { format: 'musicxml', data: <validated XML> } | null`.

- [ ] **Step 1: Add tests proving exact TAB bytes survive package creation/restoration and SCORE-only package behavior is unchanged.**
- [ ] **Step 2: Add a regression test that explicit teacher technical positions are not run through `lowest-fret-v1` / `generated-basic`.
- [ ] **Step 3: Run the affected test files, then the full suite; require PASS.**
- [ ] **Step 4: Commit Task 3 tests only.**

### Task 4: Add exact-sha Editor → SesliTab → Student App qualification

**Files:**
- Create: `scripts/gtab04EditorStudentFixture.js`
- Create or extend: an existing cross-repo qualification test under `tests/` using the TD-PROD-10 pattern
- Modify: `.github/workflows/ci.yml` only if required to run the new qualification
- Student App production files: **no planned modification**

**Interfaces:**
- Producer fixture must be generated from the actual `st-guitar-tab-editor` API at the pinned Editor SHA, not by inventing a hand-written TAB substitute.
- Consumer checkout is pinned to `st-student-app@5f7d1d5a1b70616e599dec21ac384649d4803fcd` for the first qualification run.

- [ ] **Step 1: Build a fixture source MusicXML containing single notes plus 2-, 3-, 4-, 5-, and 6-note simultaneous groups, explicit Voice 1–4 polyphony/cross-voice same-onset cases, and at least one two-digit fret.**
- [ ] **Step 2: Generate the Guitar TAB MusicXML through the real Editor serializer and feed it through the new SesliTab handoff + composer path.**
- [ ] **Step 3: Assert delivered package has unchanged SCORE XML plus `content.guitarTab.format === 'musicxml'` and exact validated TAB data, with Voice 1–4 preserved.**
- [ ] **Step 4: Run the package through the Student App production contract/workspace path and real browser renderer acceptance.** Require visible six-line TAB and the expected teacher frets; SCORE notation/playback remains available independently.
- [ ] **Step 5: Add negative cross-repo cases: stale/mismatched TAB, cross-voice same-string collision, missing technical data, fret 21+, malformed XML, >6 simultaneous notes, and altered voice identity/timing. All must fail before delivery.**
- [ ] **Step 6: Run SesliTab full CI and the exact-sha cross-repo browser qualification. Require GREEN.**
- [ ] **Step 7: Commit Task 4.**

### Task 5: Final verification and human merge gate

**Files:**
- Update: this plan/progress evidence only after implementation results exist
- No production deployment files

- [ ] **Step 1: Run full SesliTab tests/build/required status checks on the final exact head.**
- [ ] **Step 2: Verify no runtime import/dependency on `st-guitar-tab-editor`, `musicxml-to-guitar-tab-engine`, or alphaTab was introduced.**
- [ ] **Step 3: Verify Student App production code diff is empty unless a real consumer defect was independently demonstrated. If a Student App product change becomes necessary, stop and open a separate scoped issue/plan instead of expanding GTAB-04.**
- [ ] **Step 4: Perform whole-branch review against this plan and record exact-head evidence.**
- [ ] **Step 5: Open/prepare the implementation PR and stop at explicit human merge approval. No deploy.**

## Expected product flow after GTAB-04

`Teacher SCORE MusicXML`
→ `ST Guitar TAB Editor: exact string/fret authoring`
→ `Guitar TAB MusicXML export`
→ `SesliTab: score-bound fail-closed validation`
→ `Assignment Composer / Secure Delivery`
→ `PracticePackage content.score + content.guitarTab`
→ `Student App: Nota + TAB rendering`

The Student App follows SCORE timing; Guitar TAB is a validated rendering companion. Teacher-selected string/fret remains exact and is never re-solved downstream.
