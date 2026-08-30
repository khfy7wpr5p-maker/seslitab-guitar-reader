import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  applyTeacherWorkspaceCorrection,
  createTeacherWorkspace,
  undoTeacherWorkspace,
} from '../src/services/teacherWorkspaceModel.js'
import {
  assessStageFRevisionLifecycle,
  resolveStageFPreviousUndoTarget,
  STAGE_F_LIFECYCLE_STATUS,
} from '../src/services/stageFRevisionLifecycle.js'

function note(overrides = {}) {
  return {
    measureKey: 'P1:m0',
    partId: 'P1',
    partIndex: 0,
    measureIndex: 0,
    measureNumber: 1,
    voice: 1,
    staff: 1,
    startBeat: 0,
    isRest: false,
    step: 'C',
    alter: 0,
    octave: 4,
    durationValue: 4,
    duration: 'quarter',
    beats: 1,
    midi: 60,
    frequency: 261.6256,
    noteName: 'Do4',
    string: 5,
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

test('Stage F pitch correction remains fail closed without T3 evidence and corrected MusicXML', () => {
  const current = correct(workspace(), '0:step', 'D', '1')
  const assessment = assessStageFRevisionLifecycle(current)
  assert.equal(assessment.status, STAGE_F_LIFECYCLE_STATUS.CORRECTION_REVALIDATION_REQUIRED)
  assert.equal(assessment.canRerenderSource, false)
  assert.equal(assessment.reason, 'pitch-correction-needs-package-12-t3-evidence-and-corrected-musicxml')
  assert.equal(assessment.undoTarget.revisionId, 'automatic-stage-f')
})

test('Stage F duration correction requires structural rhythmic revalidation', () => {
  const current = correct(workspace(), '0:durationValue', '8', '1')
  const assessment = assessStageFRevisionLifecycle(current)
  assert.equal(assessment.status, STAGE_F_LIFECYCLE_STATUS.STRUCTURAL_REVALIDATION_REQUIRED)
  assert.equal(assessment.canRerenderSource, false)
  assert.equal(assessment.reason, 'duration-needs-package-12-t4')
})

test('Stage F refuses Package 8 correction fields outside Stage E scope', () => {
  const current = correct(workspace(), '0:voice', '2', '1')
  const assessment = assessStageFRevisionLifecycle(current)
  assert.equal(assessment.status, STAGE_F_LIFECYCLE_STATUS.UNSUPPORTED_HISTORY)
  assert.equal(assessment.canRerenderSource, false)
  assert.equal(assessment.reason, 'correction-outside-stage-e-scope')
})

test('Stage F single-action undo target is nearest previous different content', () => {
  const first = correct(workspace(), '0:step', 'D', '1')
  const second = correct(first, '0:alter', '1', '2')
  const target = resolveStageFPreviousUndoTarget(second)
  assert.equal(target.revisionId, 'revision-1')
  assert.equal(target.revisionIndex, 1)
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

test('Stage F non-root undo remains structural-revalidation-required', () => {
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
})

test('Stage F UI rerenders only behind exact-source assessment and reuses immutable undo', async () => {
  const source = await readFile(new URL('../src/stageFRevisionLifecycleUi.js', import.meta.url), 'utf8')
  assert.match(source, /assessment\.canRerenderSource/)
  assert.match(source, /activateScoreView/)
  assert.match(source, /undoTeacherUiRevision/)
  assert.match(source, /Package 12-T3/)
  assert.match(source, /Package 12-T4/)
  assert.doesNotMatch(source, /resolveCanonicalPitch|createTeacherCorrectedRevision|MusicXML.*replace|DOMParser|opensheetmusicdisplay|OSMD/i)
})

test('Stage F controls are accessible and main wiring follows Stage E', async () => {
  const ui = await readFile(new URL('../src/stageFRevisionLifecycleUi.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/stageFRevisionLifecycle.css', import.meta.url), 'utf8')
  const main = await readFile(new URL('../main.js', import.meta.url), 'utf8')
  assert.match(ui, /aria-live/)
  assert.match(ui, /Son değişikliği geri al/)
  assert.match(ui, /Doğrula ve görünümü yenile/)
  assert.match(css, /min-height: 44px/)
  assert.match(css, /:focus-visible/)
  assert.ok(main.indexOf("import './src/stageFRevisionLifecycleUi.js'") > main.indexOf("import './src/stageEVisualNoteEditorUi.js'"))
  assert.match(main, /stageFRevisionLifecycle\.css/)
})
