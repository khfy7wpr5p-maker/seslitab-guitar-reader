# SES-227 Guitar Pitch / String-Fret Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SesliTab Guitar TAB resolve and validate a declared guitar-target physical pitch without mutating source MusicXML or breaking existing trusted Guitar TAB string/fret data.

**Architecture:** Keep source written/sounding semantics immutable and add one explicit `guitarPhysicalPitchMidi` authority in the pinned ST Guitar TAB Editor runtime. Resolve it from an explicit `guitarPitchPolicy`, include that policy in session identity, and make both Editor validation and SesliTab fretboard consume the same resolved physical pitch. Preserve existing trusted technical TAB as exact authority; export continues through the existing fail-closed validator.

**Tech Stack:** JavaScript ES modules, Node.js `node:test`, ST Guitar TAB Editor browser runtime, Vite, Playwright Chromium/WebKit, GitHub Actions exact-SHA qualification, SonarQube.

**Spec:** `docs/superpowers/specs/2026-10-12-ses-227-guitar-pitch-authority-design.md`

## Global Constraints

- Editor implementation baseline is the qualified SES-219 draft head `4eb479bc84b12c6deefb289d03c933ce9980bc9f` (PR #6), not Editor `main` alone.
- SesliTab implementation baseline is protected `main` `626d6bef43208174ca1b64c5b002416399fc2e4a`; all SesliTab work stays on the SES-227 branch.
- Original source MusicXML bytes remain immutable.
- Never infer target pitch from filename, vendor, DOM/SVG geometry, or pitch-nearness heuristics.
- No universal hidden `-12` rule. Standard guitar octave behavior exists only through the declared `standard-guitar-written` target policy.
- Existing trustworthy `<technical><string>/<fret>` remains teacher/source guitar authority and is never silently re-fingered.
- Real source `<transpose>` is preserved and applied exactly once under `source-sounding` semantics.
- Part/Staff/Voice target identity, assignment state, fingerprints, secure delivery, playback, offline, and accessibility contracts remain unchanged unless a focused failing test proves otherwise.
- Do not mix SES-228 Staff/Voice namespace rendering changes into SES-227.
- Merge and deploy are separate explicit human gates.

## Review Focus

1. **Policy state leakage:** switching `guitarPitchPolicy` on the same XML/target must create a distinct source session and invalidate prior assignments.
2. **Wrong-octave acceptance:** A written A4 in standard guitar mode must accept physical A3 positions and reject A4 positions.
3. **Existing Guitar TAB authority:** technical string/fret must survive without automatic recomputation or replacement.
4. **Explicit source transpose:** `source-sounding` applies it once; `standard-guitar-written` must not accidentally stack it with a hidden octave transform.
5. **Export-button dead state:** incomplete/invalid assignments keep export disabled with a bounded reason; a complete valid document must enable export without bypassing the validator.

---

### Task 1: Add explicit guitar-target pitch policy in ST Guitar TAB Editor

**Repository:** `khfy7wpr5p-maker/st-guitar-tab-editor`

**Branch strategy:** create `fix/ses-227-guitar-pitch-authority` from SES-219 PR #6 head `4eb479bc84b12c6deefb289d03c933ce9980bc9f`. Keep SES-219 independently reviewable; open SES-227 as a stacked PR until SES-219 is merged.

**Files:**
- Create: `src/guitar/guitarPitchPolicy.js`
- Modify: `src/model/sourceSession.js`
- Modify: `src/guitar/positionValidator.js`
- Modify: `test/canonicalPitchSemantics.test.js`
- Modify: `test/positionValidator.test.js`
- Modify: `test/browserRuntime.test.js`

**Interfaces:**
- `GUITAR_PITCH_POLICY.SOURCE_SOUNDING = 'source-sounding'`
- `GUITAR_PITCH_POLICY.STANDARD_GUITAR_WRITTEN = 'standard-guitar-written'`
- `resolveGuitarPhysicalPitch(event, policy) -> integer MIDI`
- `createSourceSession(xmlText, { targetSelection = null, guitarPitchPolicy = 'source-sounding' } = {})`
- Every pitched session event exposes `guitarPhysicalPitchMidi`.
- Session identity includes normalized `guitarPitchPolicy` so assignment state cannot cross policies.

- [ ] **Step 1: Write focused RED policy tests**

Add cases proving:
- source-sounding A4/no transpose -> `guitarPhysicalPitchMidi === 69`;
- standard-guitar-written A4/no transpose -> `guitarPhysicalPitchMidi === 57`;
- standard-guitar-written A4 accepts string 3/fret 2 and rejects string 1/fret 5;
- source-sounding A4 accepts string 1/fret 5;
- explicit source transpose remains represented in `soundingPitchMidi` and is not double-applied;
- same XML/target with two different policies yields distinct session IDs;
- unknown policy throws fail-closed;
- `sourceXml` remains byte-identical.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
node --test test/canonicalPitchSemantics.test.js test/positionValidator.test.js test/browserRuntime.test.js
```

Expected: RED because `guitarPitchPolicy` and `guitarPhysicalPitchMidi` do not yet exist and validator still uses source sounding/written pitch directly.

- [ ] **Step 3: Implement the minimal policy seam**

Create `src/guitar/guitarPitchPolicy.js` with strict policy normalization and physical-MIDI resolution. Keep `sourceEventReader.js` source written/sounding parsing unchanged. In `sourceSession.js`, attach `guitarPhysicalPitchMidi` to pitched events and include policy in session identity. In `positionValidator.js`, prefer the resolved guitar physical pitch and reject unresolved/contradictory targets rather than falling back silently.

- [ ] **Step 4: Verify Editor focused and full gates**

Run:

```bash
node --test test/canonicalPitchSemantics.test.js test/positionValidator.test.js test/browserRuntime.test.js
npm test
npm run check:forbidden
npm run build:browser
npm run test:browser
```

Expected: all PASS.

- [ ] **Step 5: Review diff and record exact Editor head**

Require only the listed policy/model/validator/test surface plus generated runtime artifacts produced by the repository's normal build contract. Record the exact qualified commit as `SES227_EDITOR_SHA`. Do not merge.

---

### Task 2: Preserve existing technical TAB as explicit authority

**Repository:** `khfy7wpr5p-maker/st-guitar-tab-editor`

**Files:**
- Modify only if required by a RED reproduction: `src/musicxml/sourceEventReader.js`
- Modify only if required by a RED reproduction: `src/model/sourceSession.js`
- Modify only if required by a RED reproduction: `src/musicxml/guitarTabMusicXmlWriter.js`
- Add/modify fixture tests under `test/fixtures/`
- Modify: `test/guitarTabMusicXmlWriter.test.js`

**Interfaces:**
- Existing validated `<technical><string>/<fret>` evidence is preserved as exact guitar authority.
- No new automatic fingering chooser is introduced.

- [ ] **Step 1: Add RED/characterization fixtures**

Cover one source with valid existing Guitar TAB technical evidence and one notation-only source. Assert trusted technical string/fret is byte/semantic-equivalent in the new export while notation-only authoring uses Task 1 policy resolution.

- [ ] **Step 2: Run focused writer tests**

Run: `node --test test/guitarTabMusicXmlWriter.test.js test/canonicalPitchSemantics.test.js`

If existing behavior already passes the preservation contract, record it as characterization evidence and make no production change for this task. If it fails, change only the first proven authority boundary.

- [ ] **Step 3: Re-run full Editor gates**

Run: `npm test && npm run check:forbidden && npm run build:browser && npm run test:browser`.

Expected: all PASS on the final `SES227_EDITOR_SHA`.

---

### Task 3: Pin the qualified Editor runtime and make SesliTab consume one physical-pitch authority

**Repository:** `khfy7wpr5p-maker/seslitab-guitar-reader`

**Branch:** `onderozudogru/ses-227-gtab-prod-01-deployed-teacher-tab-pitchstring-regression`

**Files:**
- Modify: `scripts/prepareGuitarTabEditorRuntime.js`
- Modify: `tests/guitarTabEditorRuntimeBinding.test.js`
- Modify: `.github/workflows/gtab04.yml` if it carries an independent exact Editor SHA
- Modify: `src/services/guitarTabPitchPolicy.js`
- Modify: `src/guitarTabTeacherWorkspaceUi.js`
- Modify: `tests/guitarTabTeacherWorkspaceUi.test.js`
- Add/modify a focused pitch-policy integration test under `tests/`

**Interfaces:**
- SesliTab pins exactly `SES227_EDITOR_SHA`.
- `resolveGuitarTabEventMidi(event)` returns `event.guitarPhysicalPitchMidi` for authoring when present; it must not independently reimplement the octave transformation.
- Teacher Workspace creates the editor source session with an explicit `guitarPitchPolicy`.
- Active target policy is visible in state/UI and can be changed only through the bounded workspace control; changing policy invalidates the current authoring document/assignments.

- [ ] **Step 1: Write RED SesliTab integration tests**

Add tests proving the workspace's standard-guitar target maps the uploaded-reproduction shape A4 -> physical A3 and therefore enables string 3/fret 2 while disabling string 1/fret 5. Add a source-sounding control case proving the opposite physical target. Add a policy-change case proving stale assignments are discarded.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
node --test tests/guitarTabTeacherWorkspaceUi.test.js tests/guitarTabEditorRuntimeBinding.test.js tests/*GuitarTab*Pitch*.test.js
```

Expected: RED before the new runtime pin/policy seam.

- [ ] **Step 3: Pin exact Editor SHA and wire the workspace**

Update the exact runtime pin/provenance to `SES227_EDITOR_SHA`. Keep the fretboard equation `openStringMidi + fret === resolvedPhysicalMidi`; change only where that resolved physical MIDI comes from. Do not add a second octave calculation in SesliTab.

- [ ] **Step 4: Verify exact runtime provenance**

Run the existing runtime-binding/build/provenance tests plus `npm run guitar-tab-editor:prepare-runtime` in the supported Node 24 environment.

Expected: exact SHA, manifest, digest, contract version, and authority-profile checks PASS.

---

### Task 4: Make export-button state explainable and qualify real fixtures

**Repository:** `khfy7wpr5p-maker/seslitab-guitar-reader`

**Files:**
- Modify only as required: `src/guitarTabTeacherWorkspaceUi.js`
- Modify: `tests/guitarTabTeacherWorkspaceUi.test.js`
- Add private/manual or repository-approved sanitized fixtures for:
  - `duman-senden-daha-guzel(2).musicxml`
  - Paramparça regression evidence
  - notation-only guitar
  - existing trusted technical Guitar TAB
  - explicit source transpose

**Interfaces:**
- `TAB MusicXML dışa aktar` remains disabled unless `tabDocument.canExport() === true` and the existing `validateGuitarTabExport()` returns `{ ok: true }`.
- Disabled state surfaces the current bounded validation category/code through the existing status seam; no force-enable path is allowed.

- [ ] **Step 1: Reproduce the current disabled export path**

Use the uploaded Duman source and Paramparça qualification evidence to identify whether the button is blocked by incomplete assignment, physical mismatch, semantic/identity validation, or runtime validation. Do not guess from button appearance.

- [ ] **Step 2: Add RED UI/export-state tests only for the proven missing behavior**

Assert a fully assigned valid document enables export and an incomplete/physically invalid document stays disabled with the correct bounded reason.

- [ ] **Step 3: Implement the smallest UI/status correction**

Do not bypass `tabDocument.canExport()` or `validateGuitarTabExport()`. If the button is already correct and only status visibility is missing, change status reporting only.

- [ ] **Step 4: Run focused Teacher Workspace + validator browser tests**

Run:

```bash
node --test tests/guitarTabTeacherWorkspaceUi.test.js tests/guitarTabEditorRuntimeBinding.test.js
npm run test:gtab-validator-browser
npm run test:gtab10b-browser
```

Expected: PASS.

---

### Task 5: Exact-head cross-app and quality closeout

**Repositories:** Editor + SesliTab. Student remains qualification-only for SES-227 unless a fresh Student-only failure is proven.

- [ ] **Step 1: Run SesliTab affected/full verification**

Run the focused pitch/fretboard/export suites, `npm test`, `npm run build`, GTAB-04 exact-SHA qualification, GTAB-10C semantic parity, and the existing validator browser proof.

- [ ] **Step 2: Run real-browser matrix**

Require Chromium and WebKit evidence for: standard-guitar-written Duman A4 -> A3/string3-fret2, source-sounding control, existing Guitar TAB preservation, Paramparça regression, explicit transpose, multi-voice/chord behavior, undo/redo, and export-button transition.

- [ ] **Step 3: Run SonarQube and security gates**

Use the repository's configured SonarQube project/PR context. Require Quality Gate GREEN; investigate any new coverage, reliability, security, or duplication failure at the exact changed files before continuing. Run dependency/security checks required by the repository workflows.

- [ ] **Step 4: Final diff review**

Confirm no unrelated changes, no source-score mutation, no duplicate octave policy, no SES-228 renderer/voice-namespace changes, and no weakened validator/fingerprint/security logic.

- [ ] **Step 5: Update tracking and stop at human merge gate**

Update Linear SES-227 and the Notion production-defects page with exact branch/head SHAs, changed files, RED/GREEN evidence, browser results, Sonar result, and unresolved items. Open/refresh PRs as needed. Do not merge or deploy without a new explicit user approval.