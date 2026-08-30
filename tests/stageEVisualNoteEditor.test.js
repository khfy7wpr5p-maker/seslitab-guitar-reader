import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { createTeacherWorkspace } from '../src/services/teacherWorkspaceModel.js'
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

test('Stage E exposes only pitch accidental octave and duration for the exact selected note', () => {
  const notes = [note()]
  const model = buildStageEVisualEditModel({
    workspace: workspace(notes),
    snapshot: { notes, selectedMeasureKey: 'P1:m0', selectedNoteIndex: 0 },
  })
  assert.ok(model)
  assert.deepEqual(model.fields.map((field) => field.field), [
    STAGE_E_EDIT_FIELD.PITCH,
    STAGE_E_EDIT_FIELD.ACCIDENTAL,
    STAGE_E_EDIT_FIELD.OCTAVE,
    STAGE_E_EDIT_FIELD.DURATION,
  ])
  assert.ok(model.fields.every((field) => field.fieldKey.startsWith('0:')))
  assert.equal(model.sourceNote, notes[0])
})

test('Stage E never exposes string fret MIDI frequency voice staff or tie fields', () => {
  const notes = [note()]
  const model = buildStageEVisualEditModel({
    workspace: workspace(notes),
    snapshot: { notes, selectedMeasureKey: 'P1:m0', selectedNoteIndex: 0 },
  })
  const fields = model.fields.map((field) => field.field)
  for (const forbidden of ['string', 'fret', 'midi', 'frequency', 'voice', 'staff', 'tieStart', 'tieStop']) {
    assert.ok(!fields.includes(forbidden))
  }
})

test('Stage E fails closed for stale or cross-measure note selection', () => {
  const notes = [note()]
  const currentWorkspace = workspace(notes)
  assert.equal(buildStageEVisualEditModel({
    workspace: currentWorkspace,
    snapshot: { notes, selectedMeasureKey: 'P1:m1', selectedNoteIndex: 0 },
  }), null)
  assert.equal(buildStageEVisualEditModel({
    workspace: currentWorkspace,
    snapshot: { notes, selectedMeasureKey: 'P1:m0', selectedNoteIndex: 99 },
  }), null)
})

test('Stage E rests expose duration only and never invent pitch', () => {
  const notes = [note({ isRest: true })]
  const model = buildStageEVisualEditModel({
    workspace: workspace(notes),
    snapshot: { notes, selectedMeasureKey: 'P1:m0', selectedNoteIndex: 0 },
  })
  assert.deepEqual(model.fields.map((field) => field.field), [STAGE_E_EDIT_FIELD.DURATION])
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

test('Stage E UI contains only the four bounded visual editor controls', async () => {
  const source = await readFile(new URL('../src/stageEVisualNoteEditorUi.js', import.meta.url), 'utf8')
  assert.match(source, /Nota harfi|Arıza|Oktav|Süre/)
  assert.doesNotMatch(source, /Gitar teli|Perde|MIDI|Frekans|Porte|Uzatma bağı/)
})

test('Stage E is wired after Package 8 teacher UI', async () => {
  const source = await readFile(new URL('../main.js', import.meta.url), 'utf8')
  const teacher = source.indexOf("import './src/package8TeacherUi.js'")
  const stageE = source.indexOf("import './src/stageEVisualNoteEditorUi.js'")
  assert.ok(teacher >= 0)
  assert.ok(stageE > teacher)
  assert.match(source, /stageEVisualNoteEditor\.css/)
})
