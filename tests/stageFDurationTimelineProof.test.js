import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyTeacherWorkspaceCorrection,
  createTeacherWorkspace,
} from '../src/services/teacherWorkspaceModel.js'
import { canonicalizeStageFRevision } from '../src/services/stageFCanonicalization.js'

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
    isChordNote: false,
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
    tieStart: false,
    tieStop: false,
    tieContinue: false,
    ...overrides,
  }
}

function correct(workspace, fieldKey, value, suffix) {
  return applyTeacherWorkspaceCorrection({
    workspace,
    fieldKey,
    value,
    revisionId: `teacher-duration-${suffix}`,
    eventId: `teacher-duration-event-${suffix}`,
    operationId: `teacher-duration-operation-${suffix}`,
    createdAt: `2026-08-30T21:0${suffix}:00.000Z`,
  })
}

test('Stage F duration canonicalization shifts the following sequential note startBeat', () => {
  const root = createTeacherWorkspace({
    content: [
      note({ startBeat: 0, durationValue: 4, beats: 1 }),
      note({ startBeat: 1, step: 'D', midi: 62, noteName: 'Re', frequency: 293.6647679174076 }),
    ],
    actorId: 'teacher-duration-proof',
    sourceId: 'source-duration-proof',
    automaticRevisionId: 'automatic-duration-proof',
    historyId: 'history-duration-proof',
    createdAt: '2026-08-30T21:00:00.000Z',
  })
  const corrected = correct(root, '0:durationValue', '8', '1')
  const canonicalized = canonicalizeStageFRevision({
    history: corrected.history,
    expectation: corrected.expectation,
    revisionId: 'canonical-duration-proof',
    eventId: 'canonical-duration-event-proof',
    operationIdPrefix: 'canonical-duration-operation-proof',
    createdAt: '2026-08-30T21:02:00.000Z',
  })

  assert.equal(canonicalized.revision.content[0].beats, 2)
  assert.equal(canonicalized.revision.content[0].startBeat, 0)
  assert.equal(
    canonicalized.revision.content[1].startBeat,
    2,
    'the second note must move from beat 1 to beat 2 after the first note grows from one beat to two beats',
  )
})
