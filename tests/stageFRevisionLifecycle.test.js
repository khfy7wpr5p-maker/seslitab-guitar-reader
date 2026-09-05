import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  applyTeacherWorkspaceCorrection,
  createTeacherWorkspace,
  undoTeacherWorkspace,
} from '../src/services/teacherWorkspaceModel.js'
import {
  canonicalizeStageFRevision,
} from '../src/services/stageFCanonicalization.js'
import { createTeacherHistoryExpectation } from '../src/services/teacherRevisionConcurrency.js'
import {
  assessStageFRevisionLifecycle,
  resolveStageFPreviousUndoTarget,
  STAGE_F_LIFECYCLE_STATUS,
} from '../src/services/stageFRevisionLifecycle.js'

function note(overrides = {}) {
  return {
    measureKey: 'P1:0',
    partId: 'P1',
    partIndex: 0,
    measureIndex: 0,
    measureNumber: 1,
    voice: 1,
    staff: 1,
    startBeat: 0,
    isRest: false,
    isGrace: false,
    step: 'C',
    alter: 0,
    octave: 4,
    durationValue: 4,
    divisions: 4,
    duration: 'quarter',
    beats: 1,
    dotCount: 0,
    midi: 60,
    frequency: 261.6255653005986,
    noteName: 'Do',
    string: 'A',
    fret: 3,
    tieStart: false,
    tieStop: false,
    tieContinue: false,
    ...overrides,
  }
}

function workspace() {
  return createTeacherWorkspace({
    content: [note()],
    actorId: 'teacher-stage-f',
    sourceId: 'source-stage-f',
    automaticRevisionId: 'automatic-stage-f',
    historyId: 'history-stage-f',
    createdAt: '2026-08-30T16:00:00.000Z',
  })
}

function correct(current, fieldKey, value, suffix) {
  return applyTeacherWorkspaceCorrection({
    workspace: current,
    fieldKey,
    value,
    revisionId: `revision-${suffix}`,
    eventId: `event-${suffix}`,
    operationId: `operation-${suffix}`,
    createdAt: `2026-08-30T16:0${suffix}:00.000Z`,
  })
}

test('Stage F allows source rerender only when current content exactly matches automatic root', () => {
  const current = workspace()
  const assessment = assessStageFRevisionLifecycle(current)
  assert.equal(assessment.status, STAGE_F_LIFECYCLE_STATUS.SOURCE_EXACT)
  assert.equal(assessment.canRerenderSource, true)
  assert.equal(assessment.undoTarget, null)
})

test('Stage F pitch correction remains fail closed until product canonicalization and corrected MusicXML', () => {
  const current = correct(workspace(), '0:step', 'D', '1')
  const assessment = assessStageFRevisionLifecycle(current)
  assert.equal(assessment.status, STAGE_F_LIFECYCLE_STATUS.CORRECTION_REVALIDATION_REQUIRED)
  assert.equal(assessment.canRerenderSource, false)
  assert.equal(assessment.reason, 'pitch-correction-needs-product-canonicalization-and-corrected-musicxml')
  assert.equal(assessment.undoTarget.revisionId, 'automatic-stage-f')
})

test('Stage F duration correction requires product canonicalization and structural revalidation', () => {
  const current = correct(workspace(), '0:durationValue', '8', '1')
  const assessment = assessStageFRevisionLifecycle(current)
  assert.equal(assessment.status, STAGE_F_LIFECYCLE_STATUS.STRUCTURAL_REVALIDATION_REQUIRED)
  assert.equal(assessment.canRerenderSource, false)
  assert.equal(assessment.reason, 'duration-needs-product-canonicalization-and-structural-revalidation')
})

test('Stage F refuses Package 8 correction fields outside Stage E scope', () => {
  const current = correct(workspace(), '0:voice', '2', '1')
  const assessment = assessStageFRevisionLifecycle(current)
  assert.equal(assessment.status, STAGE_F_LIFECYCLE_STATUS.UNSUPPORTED_HISTORY)
  assert.equal(assessment.canRerenderSource, false)
  assert.equal(assessment.reason, 'correction-outside-stage-e-scope')
})

test('Stage F single-action undo target is nearest previous different teacher content', () => {
  const first = correct(workspace(), '0:step', 'D', '1')
  const second = correct(first, '0:alter', '1', '2')
  const target = resolveStageFPreviousUndoTarget(second)
  assert.equal(target.revisionId, 'revision-1')
  assert.equal(target.revisionIndex, 1)
})

test('Stage F canonicalized current revision keeps undo focused on the user correction, not the system derivation', () => {
  const corrected = correct(workspace(), '0:step', 'D', '1')
  const canonicalized = canonicalizeStageFRevision({
    history: corrected.history,
    expectation: corrected.expectation,
    revisionId: 'revision-canonical',
    eventId: 'event-canonical',
    operationIdPrefix: 'operation-canonical',
    createdAt: '2026-08-30T16:02:00.000Z',
  })
  const canonicalWorkspace = Object.freeze({
    ...corrected,
    history: canonicalized.history,
    expectation: createTeacherHistoryExpectation(canonicalized.history),
  })
  const assessment = assessStageFRevisionLifecycle(canonicalWorkspace)
  assert.equal(assessment.status, STAGE_F_LIFECYCLE_STATUS.CANONICALIZED_MATERIALIZATION_REQUIRED)
  assert.equal(assessment.canRerenderSource, false)
  assert.equal(assessment.undoTarget.revisionId, 'automatic-stage-f')
})

test('Stage F undo to automatic root restores exact source content without reviving lineage', () => {
  const corrected = correct(workspace(), '0:step', 'D', '1')
  const undone = undoTeacherWorkspace({
    workspace: corrected,
    targetRevisionId: 'automatic-stage-f',
    revisionId: 'revision-undo',
    eventId: 'event-undo',
    createdAt: '2026-08-30T16:03:00.000Z',
  })
  const assessment = assessStageFRevisionLifecycle(undone)
  assert.equal(assessment.status, STAGE_F_LIFECYCLE_STATUS.SOURCE_EXACT)
  assert.equal(assessment.canRerenderSource, true)
  assert.notEqual(undone.history.revisions.at(-1).revisionId, 'automatic-stage-f')
})

test('Stage F non-root undo remains product revalidation required', () => {
  const first = correct(workspace(), '0:step', 'D', '1')
  const second = correct(first, '0:alter', '1', '2')
  const third = correct(second, '0:octave', '5', '3')
  const undone = undoTeacherWorkspace({
    workspace: third,
    targetRevisionId: 'revision-1',
    revisionId: 'revision-undo',
    eventId: 'event-undo',
    createdAt: '2026-08-30T16:04:00.000Z',
  })
  const assessment = assessStageFRevisionLifecycle(undone)
  assert.equal(assessment.status, STAGE_F_LIFECYCLE_STATUS.STRUCTURAL_REVALIDATION_REQUIRED)
  assert.equal(assessment.canRerenderSource, false)
  assert.equal(assessment.reason, 'non-root-undo-needs-product-revalidation')
})

test('Stage F UI binds canonicalization, exact-source materialization, corrected rerender and immutable undo', async () => {
  const source = await readFile(new URL('../src/stageFRevisionLifecycleUi.js', import.meta.url), 'utf8')
  assert.match(source, /assessment\.canRerenderSource/)
  assert.match(source, /canonicalizeStageFRevision/)
  assert.match(source, /materializeAndRevalidateStageFCorrectedMusicXml/)
  assert.match(source, /getPackage3MeasureSnapshot/)
  assert.match(source, /activateScoreView/)
  assert.match(source, /undoTeacherUiRevision/)
  assert.match(source, /sistem sürümünde/)
  assert.doesNotMatch(source, /teacherShareEligibility|teacherShareAuthorization|opensheetmusicdisplay|OSMD/i)
})

test('Stage F controls remain accessible but S14 removes the legacy lifecycle UI from production wiring', async () => {
  const ui = await readFile(new URL('../src/stageFRevisionLifecycleUi.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/stageFRevisionLifecycle.css', import.meta.url), 'utf8')
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8')
  assert.match(ui, /aria-live/)
  assert.match(ui, /Son değişikliği geri al/)
  assert.match(ui, /Doğrula ve görünümü yenile/)
  assert.match(css, /min-height: 44px/)
  assert.match(css, /:focus-visible/)
  assert.doesNotMatch(main, /stageEVisualNoteEditorUi\.js/)
  assert.doesNotMatch(main, /stageFRevisionLifecycleUi\.js/)
  assert.doesNotMatch(main, /stageFRevisionLifecycle\.css/)
  assert.match(main, /initSmoosicEditorTab\(document\)/)
})
