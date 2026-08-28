import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TEACHER_WORKSPACE_STATE,
  applyTeacherWorkspaceCorrection,
  createTeacherWorkspace,
  listTeacherEditableFields,
  parseTeacherEditableValue,
  refreshTeacherWorkspace,
  withTeacherWorkspaceAuthoritativeHistory,
} from '../src/services/teacherWorkspaceModel.js'

function notes() {
  return [
    {
      measure: 1,
      partId: 'P1',
      partIndex: 0,
      measureIndex: 0,
      measureKey: 'P1:0',
      step: 'C',
      alter: 0,
      octave: 4,
      string: 'B',
      fret: 1,
      noteName: 'Do',
      midi: 60,
      frequency: 261.63,
      duration: 'quarter',
      beats: 1,
      durationValue: 4,
      divisions: 4,
      dotCount: 0,
      startBeat: 0,
      voice: 1,
      staff: 1,
      tieStart: false,
      tieStop: false,
      tieContinue: false,
      confidence: 0.85,
      confidenceReason: 'source evidence',
      verification: { status: 'verified' },
    },
  ]
}

function workspace({
  sourceId = 'source-1',
  automaticRevisionId = 'auto-1',
  historyId = 'history-1',
} = {}) {
  return createTeacherWorkspace({
    content: notes(),
    actorId: 'teacher-audit-label',
    sourceId,
    automaticRevisionId,
    historyId,
    createdAt: '2026-08-28T17:00:00.000Z',
  })
}

function correction(ws, suffix = '1') {
  return applyTeacherWorkspaceCorrection({
    workspace: ws,
    fieldKey: '0:step',
    value: 'D',
    revisionId: `rev-${suffix}`,
    eventId: `event-${suffix}`,
    operationId: `op-${suffix}`,
    createdAt: '2026-08-28T17:01:00.000Z',
  })
}

test('Package 8-T6 review regression: blank numeric input never coerces to zero', () => {
  const ws = workspace()
  const beats = listTeacherEditableFields(ws).find((field) => field.field === 'beats')

  assert.ok(beats)
  assert.throws(() => parseTeacherEditableValue(beats, ''), /finite number/)
  assert.throws(() => parseTeacherEditableValue(beats, '   '), /finite number/)
  assert.equal(parseTeacherEditableValue(beats, '0'), 0)
})

test('Package 8-T6 review regression: history mismatch cannot be activated by refresh', () => {
  const base = workspace()
  const foreign = workspace({ historyId: 'history-2' })
  const injected = withTeacherWorkspaceAuthoritativeHistory({
    workspace: base,
    history: foreign.history,
  })
  const conflict = correction(injected, 'history-mismatch')

  assert.equal(conflict.state, TEACHER_WORKSPACE_STATE.CONFLICT)
  assert.equal(conflict.conflictReason, 'history_mismatch')
  assert.throws(() => refreshTeacherWorkspace(conflict), /identity mismatch.*new workspace/i)
  assert.equal(conflict.history, foreign.history)
  assert.equal(conflict.history.revisions.length, 1)
})

test('Package 8-T6 review regression: source mismatch cannot be activated by refresh', () => {
  const base = workspace()
  const foreign = workspace({
    sourceId: 'source-2',
    automaticRevisionId: 'auto-2',
    historyId: 'history-1',
  })
  const injected = withTeacherWorkspaceAuthoritativeHistory({
    workspace: base,
    history: foreign.history,
  })
  const conflict = correction(injected, 'source-mismatch')

  assert.equal(conflict.state, TEACHER_WORKSPACE_STATE.CONFLICT)
  assert.equal(conflict.conflictReason, 'source_mismatch')
  assert.throws(() => refreshTeacherWorkspace(conflict), /identity mismatch.*new workspace/i)
  assert.equal(conflict.history, foreign.history)
  assert.equal(conflict.history.revisions.length, 1)
})
