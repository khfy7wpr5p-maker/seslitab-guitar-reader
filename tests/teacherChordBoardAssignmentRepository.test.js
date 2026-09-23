import assert from 'node:assert/strict'
import test from 'node:test'

import { getChordBoardVoicings } from '../src/services/chordBoardCatalog.js'
import { createChordBoardAssignmentSourceBinding } from '../src/services/chordBoardAssignmentSourceBinding.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'

let repositoryApi = null
try {
  repositoryApi = await import(
    '../src/services/teacherChordBoardAssignmentRepository.js'
  )
} catch {}

function requireRepositoryApi() {
  assert.ok(
    repositoryApi,
    'TD-07 teacher CHORD_BOARD assignment repository module must exist',
  )
  return repositoryApi
}

function assignment({
  assignmentId = 'assignment-a',
  studentId = 'student-a',
  symbol = 'Am',
  teacherNote = '',
  assignedAt = '2026-09-23T13:00:00Z',
} = {}) {
  const snapshot = getChordBoardVoicings(symbol)[0]
  const sourceRef =
    createChordBoardAssignmentSourceBinding({
      studentId,
      snapshot,
      boundAt: assignedAt,
    })

  return createPrivateAssignment({
    assignmentId,
    studentId,
    practiceType:
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD,
    teacherNote,
    assignedAt,
    sourceRef,
  })
}

test('TD-07 CHORD_BOARD repository indexes exact recipient plus voicing fingerprint', () => {
  const {
    createInMemoryTeacherChordBoardAssignmentRepository,
  } = requireRepositoryApi()
  const repository =
    createInMemoryTeacherChordBoardAssignmentRepository()
  const row = assignment()

  const ack = repository.createBatch([row])

  assert.equal(Object.isFrozen(ack), true)
  assert.equal(ack[0], row)
  assert.equal(repository.getByAssignmentId(row.assignmentId), row)
  assert.equal(
    repository.findExactChordBoardAssignment({
      studentId: row.studentId,
      voicingFingerprint:
        row.sourceRef.voicingFingerprint,
    }),
    row,
  )
})

test('TD-07 CHORD_BOARD repository rejects duplicate IDs and duplicate exact recipient source', () => {
  const {
    createInMemoryTeacherChordBoardAssignmentRepository,
  } = requireRepositoryApi()
  const repository =
    createInMemoryTeacherChordBoardAssignmentRepository()
  const first = assignment()
  repository.createBatch([first])

  assert.throws(
    () => repository.createBatch([
      assignment({
        assignmentId: first.assignmentId,
        studentId: 'student-b',
      }),
    ]),
    /duplicate assignmentId/i,
  )

  assert.throws(
    () => repository.createBatch([
      assignment({
        assignmentId: 'assignment-second',
        studentId: first.studentId,
      }),
    ]),
    /duplicate exact CHORD_BOARD assignment/i,
  )

  assert.deepEqual(repository.list(), [first])
})

test('TD-07 CHORD_BOARD repository batch is all-or-nothing', () => {
  const {
    createInMemoryTeacherChordBoardAssignmentRepository,
  } = requireRepositoryApi()
  const repository =
    createInMemoryTeacherChordBoardAssignmentRepository()
  const first = assignment({
    assignmentId: 'assignment-existing',
  })
  repository.createBatch([first])

  const before = repository.list()

  assert.throws(
    () => repository.createBatch([
      assignment({
        assignmentId: 'assignment-new',
        studentId: 'student-b',
      }),
      assignment({
        assignmentId: 'assignment-conflict',
        studentId: 'student-a',
      }),
    ]),
    /duplicate exact CHORD_BOARD assignment/i,
  )

  assert.deepEqual(repository.list(), before)
  assert.equal(
    repository.getByAssignmentId('assignment-new'),
    null,
  )
})

test('TD-07 CHORD_BOARD repository rejects SCORE rows and malformed lookup', () => {
  const {
    createInMemoryTeacherChordBoardAssignmentRepository,
  } = requireRepositoryApi()
  const repository =
    createInMemoryTeacherChordBoardAssignmentRepository()

  assert.throws(
    () => repository.createBatch([]),
    /non-empty array/i,
  )
  assert.throws(
    () => repository.findExactChordBoardAssignment({
      studentId: 'student-a',
      voicingFingerprint: 'not-a-hash',
    }),
    /voicingFingerprint|SHA-256/i,
  )
})
