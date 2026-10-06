# GTAB-10B Part / Staff / Voice Target Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher derive Guitar TAB from one exact MusicXML `Part -> Staff -> Voice` target, including piano/violin/vocal lines, while preserving the complete accepted SCORE unchanged and failing closed on ambiguous or stale identity.

**Architecture:** Keep the accepted MusicXML immutable. Extend the pinned ST Guitar TAB Editor runtime so `createSourceSession()` can create a target-bound source session from the full XML without pruning it, then add a SesliTab inventory/resolution layer that selects an exact `{ partId, partIndex, staff, voice }` tuple before TAB authoring. Revalidate the same tuple again in the Guitar TAB handoff/composer boundary so the full SCORE and derived TAB remain cryptographically and semantically bound.

**Tech Stack:** JavaScript ES modules, Node.js `node:test`, browser `DOMParser`, ST Guitar TAB Editor browser runtime, Vite, Playwright, GitHub Actions exact-SHA qualification, SonarQube Cloud.

**Spec:** `docs/superpowers/specs/2026-10-06-gtab-10b-part-staff-voice-target-selection-design.md`

## Global Constraints

- SesliTab implementation base is `553f22429ecdcdb0d76c52a2cf82c9aa845b27e1` (GTAB-10A merged main); ST Guitar TAB Editor implementation base is `adda3a3af83472bc499d3ab29b33ae539e115f12`.
- The accepted SCORE MusicXML stays immutable; target selection must not prune or rewrite the source.
- Canonical target authority is exactly `{ partId, partIndex, staff, voice }`.
- `partId` is a non-empty trimmed source ID; `partIndex` is a safe integer `>= 0`; `staff` is a safe integer `>= 1`; `voice` is a safe integer `>= 0`, matching the current SesliTab canonical identity path. Non-numeric source voice/staff identities are unsupported in GTAB-10B and fail closed rather than being coerced.
- Inventory candidates come from actual pitched-note evidence. Missing explicit `<staff>` or `<voice>` evidence is not synthesized by the inventory layer.
- Exactly one candidate at a hierarchy level auto-selects; multiple candidates require the teacher; zero/contradictory candidates fail closed.
- Display names are presentation only. Never infer guitar, piano hand, target part, staff, or voice from labels, pitch range, DOM order alone, or similarity.
- Switching source or target invalidates prior TAB assignment state. Never migrate assignments or selections to a closest target.
- Do not drop chord tones or notes to force monophony. Existing projection/runtime support decides whether the exact selected event stream is representable.
- Existing GTAB-10A XML/MusicXML/MXL intake remains unchanged and must stay green.
- No new network, persistence, renderer, source-mutation, server-revision, approval, or publication authority may be added to the ST Guitar TAB Editor browser runtime profile.
- ST Guitar TAB Editor remains Node `>=18`; SesliTab remains Node `>=24.0.0 <25`.
- Merge and deploy are separate user approvals. Do not merge either implementation PR and do not deploy as part of this plan.

## Review Focus

1. **Malformed part-list/body identity:** duplicate IDs, missing body parts, or part-list/body order mismatch must fail closed; Task 2 adds exact rejection tests.
2. **Missing or non-numeric staff/voice evidence:** inventory must not turn absent or malformed identities into Staff/Voice 1; Task 2 pins this behavior.
3. **Stale async/UI selection:** a source replacement or higher-level target change while prior state exists must discard the old target/session/document; Task 4 covers generation and assignment invalidation.
4. **Target with no pitched events:** a rest-only or empty tuple must not create a source session or exportable TAB; Tasks 1–3 cover this at runtime and selection boundaries.
5. **Changing target after TAB assignments:** assignments from one tuple must never be reused for another tuple even on the same source XML; Tasks 1 and 4 pin target-bound session identity and fresh authoring state.

---

### Task 1: Add target-bound source sessions to ST Guitar TAB Editor

**Repository:** `khfy7wpr5p-maker/st-guitar-tab-editor`

**Files:**
- Modify: `src/musicxml/sourceEventReader.js`
- Modify: `src/model/sourceSession.js`
- Modify: `test/sourceEventReader.test.js`
- Modify: `test/browserRuntime.test.js`

**Interfaces:**
- Consumes: existing safe MusicXML intake and the current source-event timeline parser.
- Produces: `readSourceEvents(xmlText, { targetSelection = null } = {})` and `createSourceSession(xmlText, { targetSelection = null } = {})`.
- `targetSelection` shape: `{ partId: string, partIndex: number, staff: number, voice: number }`.
- A targeted session must expose the frozen/normalized `targetSelection`, preserve full `sourceXml`, add `partIndex` to source events, and use a session ID bound to both full-source fingerprint and target tuple.
- Legacy `createSourceSession(xmlText)` behavior remains available for existing standalone/editor tests.

- [ ] **Step 1: Write RED targeted-session tests**

Add tests proving exact part/staff/voice filtering and target-bound identity:

```js
const pianoRight = createSourceSession(MULTI_PART_XML, {
  targetSelection: { partId: 'P1', partIndex: 0, staff: 1, voice: 1 },
})
assert.equal(pianoRight.sourceXml, MULTI_PART_XML)
assert.deepEqual(
  [...new Set(pianoRight.events.map(({ partId, partIndex, staff, voice }) =>
    `${partId}|${partIndex}|${staff}|${voice}`))],
  ['P1|0|1|1'],
)
assert.ok(pianoRight.events.length > 0)

const pianoLeft = createSourceSession(MULTI_PART_XML, {
  targetSelection: { partId: 'P1', partIndex: 0, staff: 2, voice: 1 },
})
assert.notEqual(pianoRight.sessionId, pianoLeft.sessionId)
```

Also assert duplicate part IDs, wrong `partIndex`, missing selected staff/voice, and a selected tuple with zero pitched events throw. Add one case where the selected voice contains two simultaneous chord tones and assert both remain in `events`.

- [ ] **Step 2: Run the focused upstream tests and confirm RED**

Run: `node --test test/sourceEventReader.test.js test/browserRuntime.test.js`

Expected: FAIL because `createSourceSession()` does not yet accept/validate an exact target and the reader currently uses only the first part.

- [ ] **Step 3: Implement minimal target-aware parsing/session identity**

In `sourceEventReader.js`, validate the supplied tuple, validate unique physical part IDs, resolve the exact part by `partIndex + partId`, parse that part's full measure timeline, then filter pitched events by the exact `staff + voice` tuple after timeline positions are known. Preserve full measure extents and do not discard simultaneous events in the chosen voice. Add `partIndex` to each event.

In `sourceSession.js`, keep `sourceXml` byte-for-byte equal to the input and keep `sourceFingerprint` over the full XML. For targeted sessions, derive a deterministic target fingerprint from the normalized tuple and include it in `sessionId`; for legacy calls, preserve the existing session-ID behavior.

- [ ] **Step 4: Verify upstream runtime and browser contract**

Run:

```bash
npm test
npm run check:forbidden
npm run build:browser
npm run test:browser
```

Expected: all PASS; browser runtime authority profile remains unchanged and `runtime.createSourceSession(xml, { targetSelection })` works through the built runtime.

- [ ] **Step 5: Commit the reviewed upstream unit**

```bash
git add src/musicxml/sourceEventReader.js src/model/sourceSession.js test/sourceEventReader.test.js test/browserRuntime.test.js
git commit -m "feat(GTAB-10B): add exact target source sessions"
```

Record the resulting commit SHA as `EDITOR_TARGET_SELECTION_REVISION_SHA`; later SesliTab tasks consume this exact SHA. Open an upstream implementation PR, but do not merge it without separate user approval.

---

### Task 2: Extract exact MusicXML Part / Staff / Voice inventory in SesliTab

**Repository:** `khfy7wpr5p-maker/seslitab-guitar-reader`

**Files:**
- Create: `src/services/guitarTabScoreInventory.js`
- Create: `tests/guitarTabScoreInventory.test.js`

**Interfaces:**
- Consumes: `inspectMusicXml(musicXml)` from `musicXmlSecurity.js` and browser/test `DOMParser`.
- Produces: `extractGuitarTabScoreInventory(musicXml, { DOMParserCtor = globalThis.DOMParser } = {})`.
- Return shape:

```js
{
  parts: [{
    partId,
    partIndex,
    name,
    staves: [{
      staff,
      voices: [{ voice, pitchedEventCount }],
    }],
  }],
}
```

All returned records/arrays are frozen. Part/staff/voice order follows source order / first pitched-note evidence order.

- [ ] **Step 1: Write RED inventory tests**

Cover: one-part/one-staff/one-voice; Piano P1 with Staff 1 Voice 1+2 and Staff 2 Voice 1; second non-guitar part; duplicate IDs; part-list/body mismatch; rest-only target; absent `<staff>`; absent `<voice>`; non-numeric staff/voice.

Representative assertion:

```js
const inventory = extractGuitarTabScoreInventory(PIANO_AND_VIOLIN_XML, { DOMParserCtor })
assert.deepEqual(inventory.parts[0], {
  partId: 'P1',
  partIndex: 0,
  name: 'Piano',
  staves: [
    { staff: 1, voices: [
      { voice: 1, pitchedEventCount: 4 },
      { voice: 2, pitchedEventCount: 2 },
    ] },
    { staff: 2, voices: [
      { voice: 1, pitchedEventCount: 4 },
    ] },
  ],
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/guitarTabScoreInventory.test.js`

Expected: FAIL because the inventory service does not exist.

- [ ] **Step 3: Implement `extractGuitarTabScoreInventory()`**

Require safe XML, exactly one usable `part-list`, unique non-empty `score-part` IDs, exact body-part agreement, one explicit `part-name` per part, and actual pitched-note evidence. Build staff/voice candidates only from notes carrying explicit valid `<staff>` and `<voice>` identities. Do not mutate the XML and do not infer instrument/hand semantics.

- [ ] **Step 4: Run focused + GTAB-10A intake regressions**

Run:

```bash
node --test tests/guitarTabScoreInventory.test.js tests/musicXmlMxlInputBridge.test.js tests/musicXmlMxlIntake.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/guitarTabScoreInventory.js tests/guitarTabScoreInventory.test.js
git commit -m "feat(GTAB-10B): extract exact score target inventory"
```

---

### Task 3: Resolve hierarchical target authority and exact canonical-note filtering

**Files:**
- Create: `src/services/guitarTabTargetSelection.js`
- Create: `tests/guitarTabTargetSelection.test.js`
- Modify: `src/services/guitarTabSourceIdentity.js`
- Modify: `tests/guitarTabSourceIdentity.test.js`

**Interfaces:**
- Consumes: Task 2 `ScoreInventory`, canonical notes from `parseMusicXml()`, and Task 1 source events containing `partIndex`.
- Produces:
  - `GUITAR_TAB_TARGET_SELECTION_STATE` with `RESOLVED`, `PART_REQUIRED`, `STAFF_REQUIRED`, `VOICE_REQUIRED`, `INVALID`, `EMPTY`.
  - `resolveGuitarTabTargetSelection(inventory, partialSelection = {}) -> { state, targetSelection, partCandidates, staffCandidates, voiceCandidates }`.
  - `selectCanonicalNotesForGuitarTabTarget(notes, targetSelection) -> frozen pitched-note array`.
- `createGuitarTabRendererTargetResolver()` must include `partIndex` in source/canonical matching, not only `partId`.

- [ ] **Step 1: Write RED resolver/filter/identity tests**

```js
assert.equal(
  resolveGuitarTabTargetSelection(singleInventory).state,
  GUITAR_TAB_TARGET_SELECTION_STATE.RESOLVED,
)
assert.equal(
  resolveGuitarTabTargetSelection(twoPartInventory).state,
  GUITAR_TAB_TARGET_SELECTION_STATE.PART_REQUIRED,
)

const selected = selectCanonicalNotesForGuitarTabTarget(notes, {
  partId: 'P1', partIndex: 0, staff: 2, voice: 1,
})
assert.ok(selected.length > 0)
assert.ok(selected.every(note =>
  note.isRest !== true && note.partId === 'P1' && note.partIndex === 0 &&
  note.staff === 2 && note.voice === 1))
```

Add assertions that a valid `partId` with wrong `partIndex` is `INVALID`, an empty tuple is `EMPTY`, missing target notes fail closed, and renderer identity does not match a canonical note whose `partIndex` differs.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --test tests/guitarTabTargetSelection.test.js tests/guitarTabSourceIdentity.test.js`

Expected: FAIL for missing selection service and absent `partIndex` matching.

- [ ] **Step 3: Implement hierarchical resolution and exact filtering**

Resolve one level at a time. Auto-fill only when exactly one candidate exists. If multiple candidates remain and the corresponding explicit selection is absent, return the matching `*_REQUIRED` state. If supplied identity is not an exact member of the current candidate set, return `INVALID`; never choose the first/closest candidate.

Filter canonical notes by all four target fields, exclude rests, require at least one pitched result, and return every matching simultaneous note rather than simplifying chords.

Update `guitarTabSourceIdentity.js` so source and canonical bucket identities include validated `partIndex` in addition to existing part/measure/voice/staff/onset evidence.

- [ ] **Step 4: Run focused projection/source-identity regressions**

Run:

```bash
node --test tests/guitarTabTargetSelection.test.js tests/guitarTabSourceIdentity.test.js tests/guitarBasicTabProjection.test.js tests/guitarBasicTabProjectionStrictIdentity.test.js tests/package9AdvancedGuitarTab.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/guitarTabTargetSelection.js tests/guitarTabTargetSelection.test.js src/services/guitarTabSourceIdentity.js tests/guitarTabSourceIdentity.test.js
git commit -m "feat(GTAB-10B): resolve exact TAB target authority"
```

---

### Task 4: Bind Part / Staff / Voice selection into the teacher TAB workspace

**Files:**
- Modify: `src/guitarTabTeacherWorkspaceUi.js`
- Modify: `tests/guitarTabTeacherWorkspaceUi.test.js`
- Modify: `tests/guitarTabTeacherAuthoring.test.js`

**Interfaces:**
- Consumes: Task 2 inventory extractor, Task 3 resolver/filter, and Task 1 runtime `createSourceSession(xml, { targetSelection })`.
- Produces workspace state fields: `scoreInventory`, `targetResolution`, `targetSelection`, `canonicalNotes`, plus existing authoring state.
- Add native labeled selects with IDs `guitar-tab-target-part`, `guitar-tab-target-staff`, `guitar-tab-target-voice`; hide a selector when its level has exactly one valid candidate.

- [ ] **Step 1: Write RED workspace tests**

Cover these state/UI transitions:

```js
await loadGuitarTabTeacherWorkspaceSource(root, TWO_PART_XML, adapters)
assert.equal(getGuitarTabTeacherWorkspaceState(root).targetSelection, null)
assert.equal(root.getElementById('guitar-tab-target-part').hidden, false)
assert.equal(root.getElementById('guitar-tab-export').disabled, true)

// After explicit Part -> Staff -> Voice choice:
assert.deepEqual(getGuitarTabTeacherWorkspaceState(root).targetSelection, {
  partId: 'P1', partIndex: 0, staff: 1, voice: 1,
})
assert.deepEqual(observations.createSourceSessionOptions, {
  targetSelection: { partId: 'P1', partIndex: 0, staff: 1, voice: 1 },
})
```

Also test: all-single candidates auto-resolve; changing part clears staff/voice; changing target destroys old `tabDocument`/assignments; source replacement invalidates the old target even when the new file reuses `P1`; native `<label for>` + `<select>` elements are keyboard/screen-reader reachable; option copy is `Piano (P1)`, `Porte 1`, `Ses 1` without inferred right/left-hand labels.

- [ ] **Step 2: Run workspace tests and confirm RED**

Run: `node --test tests/guitarTabTeacherWorkspaceUi.test.js tests/guitarTabTeacherAuthoring.test.js`

Expected: FAIL because target chooser/state is absent and source sessions are currently created before target resolution.

- [ ] **Step 3: Implement target-gated authoring**

On source load: read the accepted XML, parse canonical notes, extract inventory, resolve automatic levels, and keep the full SCORE renderer independent of TAB target resolution. Only create `sourceSession`, `tabDocument`, keyboard controller, target resolver, and export-ready state after a complete target is `RESOLVED`.

On selector change: resolve from exact option values backed by inventory identity; if a higher level changes, discard lower-level choices and all prior authoring assignments. Recreate the target-bound source session from the unchanged full XML. Use the workspace generation guard so late async work from an older source cannot install a selection/session.

Keep GTAB-10A MXL bridge behavior untouched; the normalized `.mxl` file must continue to enter this same source-load path.

- [ ] **Step 4: Verify workspace and accessibility regressions**

Run:

```bash
node --test tests/guitarTabTeacherWorkspaceUi.test.js tests/guitarTabTeacherAuthoring.test.js tests/musicXmlMxlInputBridge.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/guitarTabTeacherWorkspaceUi.js tests/guitarTabTeacherWorkspaceUi.test.js tests/guitarTabTeacherAuthoring.test.js
git commit -m "feat(GTAB-10B): add teacher target chooser"
```

---

### Task 5: Revalidate target authority at Guitar TAB handoff and composer boundaries

**Files:**
- Modify: `src/services/editorGuitarTabHandoff.js`
- Modify: `src/services/teacherAssignmentComposerService.js`
- Modify: `tests/editorGuitarTabHandoff.test.js`
- Modify: `tests/teacherAssignmentComposerService.test.js`
- Modify: `tests/editorGuitarTabComposerIntegration.test.js`

**Interfaces:**
- Consumes: Task 2 inventory, Task 3 full target selection, the full `scoreUpload.musicXml`, and derived Guitar TAB MusicXML.
- Changes: `prepareEditorGuitarTabHandoff({ scoreUpload, guitarTabMusicXml, draftId, targetSelection })`.
- Changes: composer `prepareGuitarTabUpload({ scoreUpload, guitarTabMusicXml, draftId, targetSelection })`.
- Produced Guitar TAB upload retains exact `targetSelection` alongside existing fingerprints and `pitchedEventCount`.

- [ ] **Step 1: Write RED multi-part handoff/composer tests**

Create a full SCORE containing Piano P1 (two staves) plus another part, and a derived TAB representing only `P1 / staff 1 / voice 1`.

```js
const handoff = await prepareEditorGuitarTabHandoff({
  scoreUpload,
  guitarTabMusicXml,
  draftId: 'gtab10b-draft',
  targetSelection: { partId: 'P1', partIndex: 0, staff: 1, voice: 1 },
})
assert.deepEqual(handoff.targetSelection, {
  partId: 'P1', partIndex: 0, staff: 1, voice: 1,
})
assert.equal(handoff.pitchedEventCount, EXPECTED_SELECTED_NOTE_COUNT)
assert.equal(scoreUpload.musicXml, FULL_ORIGINAL_SCORE_XML)
```

Also assert: wrong `partIndex`, stale/missing staff/voice, a TAB containing semantics from an unselected voice, and a tampered targetSelection are rejected. Composer revalidation must compare the exact target tuple as well as current score/tab fingerprints and pitched-event count.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
node --test tests/editorGuitarTabHandoff.test.js tests/teacherAssignmentComposerService.test.js tests/editorGuitarTabComposerIntegration.test.js
```

Expected: FAIL because the current handoff requires one SCORE part and has no target-selection authority.

- [ ] **Step 3: Implement selected-score semantic parity**

Revalidate `targetSelection` against a fresh Task 2 inventory built from the exact current `scoreUpload.musicXml`. Parse semantic timeline evidence only from the exact selected score tuple, while keeping the derived TAB requirement at one two-staff Guitar TAB part. Compare selected SCORE semantics against TAB staff 1, then TAB staff 1 against TAB staff 2 as today. The original SCORE string/fingerprint remains the score authority.

Pass `targetSelection` through composer preparation and revalidation. `assertPreparedGuitarTabUpload()` must reject missing/malformed/mismatched selection authority. Do not add target selection as a browser-trusted shortcut; every send revalidates it from the full SCORE.

- [ ] **Step 4: Run assignment/student-delivery regressions**

Run:

```bash
node --test tests/editorGuitarTabHandoff.test.js tests/teacherAssignmentComposerService.test.js tests/editorGuitarTabComposerIntegration.test.js tests/guitarTabTeacherAuthoring.test.js tests/studentPracticePackageV1.test.js
```

Expected: PASS; package SCORE remains the full source and Guitar TAB remains a separate derived child payload.

- [ ] **Step 5: Commit**

```bash
git add src/services/editorGuitarTabHandoff.js src/services/teacherAssignmentComposerService.js tests/editorGuitarTabHandoff.test.js tests/teacherAssignmentComposerService.test.js tests/editorGuitarTabComposerIntegration.test.js
git commit -m "feat(GTAB-10B): revalidate selected TAB target"
```

---

### Task 6: Pin the reviewed Editor SHA and add exact-SHA piano/non-guitar qualification

**Files:**
- Modify: `scripts/prepareGuitarTabEditorRuntime.js`
- Modify: `.github/workflows/gtab04.yml`
- Create: `scripts/verifyGtab10bTargetSelectionContract.js`
- Modify: `tests/guitarTabEditorRuntimeBinding.test.js`

**Interfaces:**
- Consumes: `EDITOR_TARGET_SELECTION_REVISION_SHA` produced by Task 1.
- Produces: SesliTab runtime pin and CI proof that exact ST Guitar TAB Editor code converts a selected non-guitar line while the Student package retains the full original SCORE.

- [ ] **Step 1: Write the exact-SHA contract proof before changing the pin**

`verifyGtab10bTargetSelectionContract.js` must import the exact checkout from `GTAB_EDITOR_ROOT` and prove at least:

```js
const session = editor.createSourceSession(FULL_PIANO_AND_VIOLIN_XML, {
  targetSelection: { partId: 'P1', partIndex: 0, staff: 1, voice: 1 },
})
assert.ok(session.events.length > 0)
assert.ok(session.events.every(event =>
  event.partId === 'P1' && event.partIndex === 0 &&
  Number(event.staff) === 1 && Number(event.voice) === 1))
assert.equal(session.sourceXml, FULL_PIANO_AND_VIOLIN_XML)
```

Assign legal guitar positions, serialize the derived TAB, prepare the full SCORE upload, call `prepareEditorGuitarTabHandoff(..., targetSelection)`, build the Student practice package, and assert the package still contains `FULL_PIANO_AND_VIOLIN_XML` plus the derived TAB. Add an independent Staff 2 selection and a wrong-partIndex rejection.

- [ ] **Step 2: Run the proof against the old pinned Editor and confirm RED**

Use a checkout of current SesliTab plus the current old Editor pin via `GTAB_EDITOR_ROOT`.

Expected: FAIL because the old source reader uses the first part without exact target selection/partIndex authority.

- [ ] **Step 3: Pin Task 1 exact reviewed SHA**

Replace `GUITAR_TAB_EDITOR_REVISION` in `scripts/prepareGuitarTabEditorRuntime.js` with the exact `EDITOR_TARGET_SELECTION_REVISION_SHA`. Update `.github/workflows/gtab04.yml` `GTAB_EDITOR_SHA` to the same reviewed commit and add a step that runs `node scripts/verifyGtab10bTargetSelectionContract.js` with existing exact Editor/Student checkout roots.

Update `tests/guitarTabEditorRuntimeBinding.test.js` only as needed to assert the new exact pin/provenance; do not weaken runtime manifest, digest, authority-profile, or external-import checks.

- [ ] **Step 4: Run exact integration and build qualification**

Run:

```bash
node --test tests/guitarTabEditorRuntimeBinding.test.js
npm run guitar-tab-editor:prepare-runtime
npm run build
```

Then run the exact-SHA contract script with local exact Editor and Student App checkouts using the same environment variables as `.github/workflows/gtab04.yml`.

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/prepareGuitarTabEditorRuntime.js .github/workflows/gtab04.yml scripts/verifyGtab10bTargetSelectionContract.js tests/guitarTabEditorRuntimeBinding.test.js
git commit -m "test(GTAB-10B): qualify exact target-selection runtime"
```

---

### Task 7: Run full gates, self-review the two-repository change, and open the SesliTab implementation PR

**Files:**
- No product file changes unless a gate reveals a root-cause defect covered by this spec.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: fresh verification evidence and two reviewable PRs; no merge/deploy.

- [ ] **Step 1: Run complete ST Guitar TAB Editor verification**

From the upstream feature worktree:

```bash
npm test
npm run check:forbidden
npm run build:browser
npm run test:browser
```

Expected: PASS with no authority/profile expansion.

- [ ] **Step 2: Run focused and full SesliTab tests**

First run all GTAB-10B focused files from Tasks 2–6. Then run the CI-like full suite serially:

```bash
TMPDIR="$HOME" node --test --test-concurrency=1 tests/*.test.js
npm run build
```

Expected: zero failures. Existing GTAB-10A XML/MXL, Assignment Composer, Student delivery, Guitar TAB projection, accessibility, and consecutive-send tests remain green.

- [ ] **Step 3: Push implementation branches and open/update PRs**

Upstream PR: exact target-aware source-session runtime, based on `adda3a3af83472bc499d3ab29b33ae539e115f12`.

SesliTab PR: GTAB-10B inventory/selection/workspace/handoff/runtime-pin integration, based on main containing GTAB-10A. Create it as DRAFT while remote gates are running.

- [ ] **Step 4: Require fresh remote gates before review-ready**

For SesliTab require successful current-head evidence for:

- `CI` / `test-and-build`
- `Regression Quality` including c8/LCOV and SonarQube Cloud analysis
- `Dependency Security`
- `GTAB-04 Exact-SHA Qualification` including the new GTAB-10B proof
- Playwright protected baseline
- Sonar Quality Gate with no threshold weakening

For ST Guitar TAB Editor require its unit/browser/build/forbidden-dependency workflows to be green on the reviewed head.

- [ ] **Step 5: Review against the spec before requesting merge approval**

Confirm each GTAB-10B acceptance item is backed by a test or exact-SHA proof: hierarchical authority, piano Staff 1/2, non-guitar labels, duplicate IDs, wrong partIndex, stale source/selection, empty target, exact canonical filtering, immutable SCORE, no note dropping, MXL regression, assignment/student regression, accessibility, and full quality gates.

Only after this review mark PRs ready for review. Report both reviewed head SHAs and gate status to the user. Do not merge either PR and do not deploy until the user separately approves those actions.
