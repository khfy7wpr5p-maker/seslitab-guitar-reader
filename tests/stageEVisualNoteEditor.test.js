import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  createTeacherWorkspace,
  getTeacherWorkspaceCurrentRevision,
} from '../src/services/teacherWorkspaceModel.js'
import {
  buildStageS06SelectionIdentity,
  createStageS06RevisionIdentity,
} from '../src/services/stageS06SelectionIdentity.js'
import {
  buildStageEVisualEditModel,
  STAGE_E_EDIT_FIELD,
  validateStageEEditValue,
} from '../src/services/stageEVisualNoteEdit.js'

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
    isGrace: false,
    isChordNote: false,
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
    ...overrides,
  }
}

function workspace(notes) {
  return createTeacherWorkspace({
    content: notes,
    actorId: 'teacher-fixture',
    sourceId: 'source-fixture',
    automaticRevisionId: 'automatic-fixture',
    historyId: 'history-fixture',
    createdAt: '2026-08-30T12:00:00.000Z',
  })
}

function exactSnapshot(notes, currentWorkspace, noteIndex = 0, measureKey = 'P1:m0') {
  const revision = getTeacherWorkspaceCurrentRevision(currentWorkspace)
  const revisionIdentity = createStageS06RevisionIdentity(revision)
  const selectedNoteIdentity = buildStageS06SelectionIdentity({
    notes,
    measureKey,
    noteIndex,
    revisionIdentity,
  })
  return {
    notes,
    selectedMeasureKey: measureKey,
    selectedNoteIndex: noteIndex,
    revisionIdentity,
    selectedNoteIdentity,
  }
}

test('Stage E exposes only pitch accidental octave and duration for the exact revision-bound selected note', () => {
  const notes = [note()]
  const currentWorkspace = workspace(notes)
  const model = buildStageEVisualEditModel({
    workspace: currentWorkspace,
    snapshot: exactSnapshot(notes, currentWorkspace),
  })
  assert.ok(model)
  assert.deepEqual(model.fields.map((field) => field.field), [
    STAGE_E_EDIT_FIELD.PITCH,
    STAGE_E_EDIT_FIELD.ACCIDENTAL,
    STAGE_E_EDIT_FIELD.OCTAVE,
    STAGE_E_EDIT_FIELD.DURATION,
  ])
  assert.deepEqual(model.fields.map((field) => field.label), ['Nota harfi', 'Arıza', 'Oktav', 'Süre'])
  assert.ok(model.fields.every((field) => field.fieldKey.startsWith('0:')))
  assert.equal(model.sourceNote, notes[0])
})

test('Stage E never exposes string fret MIDI frequency voice staff or tie fields', () => {
  const notes = [note()]
  const currentWorkspace = workspace(notes)
  const model = buildStageEVisualEditModel({
    workspace: currentWorkspace,
    snapshot: exactSnapshot(notes, currentWorkspace),
  })
  const fields = model.fields.map((field) => field.field)
  for (const forbidden of ['string', 'fret', 'midi', 'frequency', 'voice', 'staff', 'tieStart', 'tieStop']) {
    assert.ok(!fields.includes(forbidden))
  }
})

test('Stage E fails closed for stale, cross-measure, out-of-range, or unbound note selection', () => {
  const notes = [note()]
  const currentWorkspace = workspace(notes)
  const exact = exactSnapshot(notes, currentWorkspace)

  assert.equal(buildStageEVisualEditModel({
    workspace: currentWorkspace,
    snapshot: { ...exact, selectedMeasureKey: 'P1:m1' },
  }), null)
  assert.equal(buildStageEVisualEditModel({
    workspace: currentWorkspace,
    snapshot: { ...exact, selectedNoteIndex: 99 },
  }), null)
  assert.equal(buildStageEVisualEditModel({
    workspace: currentWorkspace,
    snapshot: { notes, selectedMeasureKey: 'P1:m0', selectedNoteIndex: 0 },
  }), null)
})

test('Stage E visual editor abstains for rests because the renderer exposes no exact selectable ScoreNoteRef', () => {
  const notes = [note({ isRest: true })]
  const currentWorkspace = workspace(notes)
  const snapshot = exactSnapshot(notes, currentWorkspace)
  assert.equal(snapshot.selectedNoteIdentity, null)
  assert.equal(buildStageEVisualEditModel({ workspace: currentWorkspace, snapshot }), null)
})

test('Stage E validates bounded explicit teacher values', () => {
  assert.equal(validateStageEEditValue('step', 'f'), 'F')
  assert.equal(validateStageEEditValue('alter', '-2'), -2)
  assert.equal(validateStageEEditValue('octave', '9'), 9)
  assert.equal(validateStageEEditValue('durationValue', '16'), 16)
  assert.throws(() => validateStageEEditValue('step', 'H'))
  assert.throws(() => validateStageEEditValue('alter', '3'))
  assert.throws(() => validateStageEEditValue('octave', '-1'))
  assert.throws(() => validateStageEEditValue('durationValue', '0'))
})

test('Stage E UI delegates mutation to Package 8 immutable correction boundary', async () => {
  const source = await readFile(new URL('../src/stageEVisualNoteEditorUi.js', import.meta.url), 'utf8')
  assert.match(source, /applyTeacherUiCorrection/)
  assert.match(source, /Kalite doğrulaması henüz yapılmadı/)
  assert.match(source, /aria-live/)
  assert.doesNotMatch(source, /createTeacherRevision|applyTeacherCorrectionWithExpectation|hitTestNote|\.highlight\(|opensheetmusicdisplay|OSMD/i)
})

test('Stage E UI does not expose unrelated teacher correction fields', async () => {
  const source = await readFile(new URL('../src/stageEVisualNoteEditorUi.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /Gitar teli|MIDI değeri|Frekans|Porte|Uzatma bağı başlangıcı/)
})

test('Stage E implementation remains tested but S14 removes it from the production entry', async () => {
  const source = await readFile(new URL('../main.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /package8TeacherUi\.js/)
  assert.doesNotMatch(source, /stageEVisualNoteEditorUi\.js/)
  assert.doesNotMatch(source, /stageEVisualNoteEditor\.css/)
  assert.match(source, /initSmoosicEditorTab\(document\)/)
})
