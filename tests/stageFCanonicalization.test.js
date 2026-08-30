import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyTeacherWorkspaceCorrection,
  createTeacherWorkspace,
} from '../src/services/teacherWorkspaceModel.js'
import { createTeacherHistoryExpectation } from '../src/services/teacherRevisionConcurrency.js'
import {
  STAGE_F_CANONICALIZATION_STATUS,
  STAGE_F_CANONICALIZER_ACTOR_ID,
  canonicalizeStageFRevision,
  isStageFCanonicalizationEvidence,
} from '../src/services/stageFCanonicalization.js'

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
    createdAt: '2026-08-30T18:00:00.000Z',
  })
}

function correct(current, fieldKey, value, suffix) {
  return applyTeacherWorkspaceCorrection({
    workspace: current,
    fieldKey,
    value,
    revisionId: `teacher-revision-${suffix}`,
    eventId: `teacher-event-${suffix}`,
    operationId: `teacher-operation-${suffix}`,
    createdAt: `2026-08-30T18:0${suffix}:00.000Z`,
  })
}

function canonicalize(current, suffix = '1') {
  return canonicalizeStageFRevision({
    history: current.history,
    expectation: current.expectation,
    revisionId: `canonical-revision-${suffix}`,
    eventId: `canonical-event-${suffix}`,
    operationIdPrefix: `canonical-operation-${suffix}`,
    createdAt: `2026-08-30T18:1${suffix}:00.000Z`,
  })
}

test('Stage F canonicalization keeps teacher pitch intent separate and derives coherent pitch fields', () => {
  const root = workspace()
  const sourceSnapshot = root.history.revisions[0].content[0]
  const corrected = correct(root, '0:step', 'D', '1')
  const result = canonicalize(corrected)

  assert.equal(result.status, STAGE_F_CANONICALIZATION_STATUS.APPLIED)
  assert.equal(result.auditEvent.actorId, STAGE_F_CANONICALIZER_ACTOR_ID)
  assert.equal(result.auditEvent.parentRevisionId, corrected.history.revisions.at(-1).revisionId)
  assert.equal(result.revision.content[0].step, 'D')
  assert.equal(result.revision.content[0].midi, 62)
  assert.equal(result.revision.content[0].noteName, 'Re')
  assert.ok(Math.abs(result.revision.content[0].frequency - 293.6647679174076) < 1e-9)
  assert.deepEqual(
    result.auditEvent.operations.map((operation) => operation.path[1]).sort(),
    ['frequency', 'midi', 'noteName'],
  )
  assert.equal(sourceSnapshot.step, 'C')
  assert.equal(sourceSnapshot.midi, 60)
  assert.equal(isStageFCanonicalizationEvidence(result.evidence), true)
  assert.equal(result.evidence.baseRevisionId, corrected.history.revisions.at(-1).revisionId)
  assert.equal(result.evidence.resultRevisionId, result.revision.revisionId)
})

test('Stage F canonicalization derives duration metadata without guessing timeline onset', () => {
  const corrected = correct(workspace(), '0:durationValue', '8', '1')
  const result = canonicalize(corrected)

  assert.equal(result.status, STAGE_F_CANONICALIZATION_STATUS.APPLIED)
  assert.equal(result.revision.content[0].durationValue, 8)
  assert.equal(result.revision.content[0].beats, 2)
  assert.equal(result.revision.content[0].duration, 'half')
  assert.equal(result.revision.content[0].dotCount, 0)
  assert.equal(result.revision.content[0].startBeat, 0)
  assert.deepEqual(
    result.auditEvent.operations.map((operation) => operation.path[1]).sort(),
    ['beats', 'duration'],
  )
})

test('Stage F canonicalization returns already-coherent without inventing another revision', () => {
  const corrected = correct(workspace(), '0:step', 'D', '1')
  const first = canonicalize(corrected)
  const second = canonicalizeStageFRevision({
    history: first.history,
    expectation: createTeacherHistoryExpectation(first.history),
    revisionId: 'unused-revision',
    eventId: 'unused-event',
    operationIdPrefix: 'unused-operation',
    createdAt: '2026-08-30T18:12:00.000Z',
  })

  assert.equal(second.status, STAGE_F_CANONICALIZATION_STATUS.ALREADY_COHERENT)
  assert.equal(second.revision, first.revision)
  assert.equal(second.auditEvent, null)
  assert.equal(second.evidence.derivedOperationCount, 0)
})

test('Stage F canonicalization fails closed on corrections outside Stage E intent scope', () => {
  const corrected = correct(workspace(), '0:voice', '2', '1')
  assert.throws(
    () => canonicalize(corrected),
    /refuses correction field: voice/,
  )
})

test('Stage F canonicalization refuses non-canonical duration values rather than choosing nearest glyph', () => {
  const root = createTeacherWorkspace({
    content: [note({ divisions: 3, durationValue: 3 })],
    actorId: 'teacher-stage-f',
    sourceId: 'source-stage-f-odd',
    automaticRevisionId: 'automatic-stage-f-odd',
    historyId: 'history-stage-f-odd',
    createdAt: '2026-08-30T18:00:00.000Z',
  })
  const corrected = correct(root, '0:durationValue', '2', '1')
  assert.throws(
    () => canonicalize(corrected),
    /refuses non-canonical beat value/,
  )
})
