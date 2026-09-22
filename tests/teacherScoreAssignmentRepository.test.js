import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'
import {
  createInMemoryTeacherScoreAssignmentRepository,
} from '../src/services/teacherScoreAssignmentRepository.js'

function sourceRef({
  studentId,
  sourceId = 'score-1',
  revisionId = 'revision-1',
} = {}) {
  return Object.freeze({
    schemaVersion: 1,
    sourceKind: 'score_exact_revision',
    studentId,
    sourceId,
    sourceRevisionId: 'source-revision-1',
    revisionId,
    revisionKind: 'automatic',
    contentFingerprint: 'content-fp',
    lineageFingerprint: 'lineage-fp',
    approvalId: 'approval-1',
    authorizationId: `auth-${studentId}`,
    qualityEvidenceId: `quality-${studentId}`,
    revalidationEvidenceId: null,
    readinessRoute: 'package12_t2',
    package12Status: 'eligible_exact_revision',
    boundAt: '2026-09-22T20:00:00Z',
  })
}

function assignment({
  assignmentId,
  studentId,
  sourceId = 'score-1',
  revisionId = 'revision-1',
  teacherNote = '',
} = {}) {
  return createPrivateAssignment({
    assignmentId,
    studentId,
    practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
    teacherNote,
    assignedAt: '2026-09-22T20:00:00Z',
    sourceRef: sourceRef({
      studentId,
      sourceId,
      revisionId,
    }),
  })
}

test('TD-04 repository lists deterministic frozen assignment history', () => {
  const a = assignment({
    assignmentId: 'assignment-a',
    studentId: 'student-a',
  })
  const b = assignment({
    assignmentId: 'assignment-b',
    studentId: 'student-b',
  })
  const repository =
    createInMemoryTeacherScoreAssignmentRepository([a, b])

  const rows = repository.list()

  assert.equal(Object.isFrozen(repository), true)
  assert.equal(Object.isFrozen(rows), true)
  assert.deepEqual(rows, [a, b])
  assert.equal(
    repository.getByAssignmentId(' assignment-b '),
    b,
  )
})

test('TD-04 exact SCORE lookup binds student + source + revision', () => {
  const exact = assignment({
    assignmentId: 'assignment-a',
    studentId: 'student-a',
    sourceId: 'score-1',
    revisionId: 'revision-1',
  })
  const repository =
    createInMemoryTeacherScoreAssignmentRepository([exact])

  assert.equal(
    repository.findExactScoreAssignment({
      studentId: 'student-a',
      sourceId: 'score-1',
      revisionId: 'revision-1',
    }),
    exact,
  )
  assert.equal(
    repository.findExactScoreAssignment({
      studentId: 'student-a',
      sourceId: 'score-1',
      revisionId: 'revision-2',
    }),
    null,
  )
  assert.equal(
    repository.findExactScoreAssignment({
      studentId: 'student-b',
      sourceId: 'score-1',
      revisionId: 'revision-1',
    }),
    null,
  )
})

test('TD-04 createBatch atomically stores all valid assignments', () => {
  const repository =
    createInMemoryTeacherScoreAssignmentRepository()
  const a = assignment({
    assignmentId: 'assignment-a',
    studentId: 'student-a',
  })
  const b = assignment({
    assignmentId: 'assignment-b',
    studentId: 'student-b',
  })

  const acknowledgement =
    repository.createBatch([a, b])

  assert.equal(Object.isFrozen(acknowledgement), true)
  assert.deepEqual(acknowledgement, [a, b])
  assert.deepEqual(repository.list(), [a, b])
})

test('TD-04 createBatch rejects duplicate assignmentId with zero partial append', () => {
  const existing = assignment({
    assignmentId: 'assignment-existing',
    studentId: 'student-existing',
  })
  const repository =
    createInMemoryTeacherScoreAssignmentRepository([existing])

  const valid = assignment({
    assignmentId: 'assignment-new',
    studentId: 'student-a',
  })
  const duplicateId = assignment({
    assignmentId: 'assignment-existing',
    studentId: 'student-b',
    revisionId: 'revision-2',
  })

  assert.throws(
    () => repository.createBatch([valid, duplicateId]),
    /duplicate.*assignmentId/i,
  )
  assert.deepEqual(repository.list(), [existing])
})

test('TD-04 createBatch rejects existing exact SCORE duplicate with zero partial append', () => {
  const existing = assignment({
    assignmentId: 'assignment-existing',
    studentId: 'student-a',
    sourceId: 'score-1',
    revisionId: 'revision-1',
  })
  const repository =
    createInMemoryTeacherScoreAssignmentRepository([existing])

  const unrelated = assignment({
    assignmentId: 'assignment-new',
    studentId: 'student-b',
  })
  const duplicateExact = assignment({
    assignmentId: 'assignment-duplicate',
    studentId: 'student-a',
    sourceId: 'score-1',
    revisionId: 'revision-1',
  })

  assert.throws(
    () =>
      repository.createBatch([
        unrelated,
        duplicateExact,
      ]),
    /duplicate.*exact.*score/i,
  )
  assert.deepEqual(repository.list(), [existing])
})

test('TD-04 createBatch rejects an internal exact duplicate with zero append', () => {
  const repository =
    createInMemoryTeacherScoreAssignmentRepository()

  const a = assignment({
    assignmentId: 'assignment-a',
    studentId: 'student-a',
  })
  const b = assignment({
    assignmentId: 'assignment-b',
    studentId: 'student-a',
  })

  assert.throws(
    () => repository.createBatch([a, b]),
    /duplicate.*exact.*score/i,
  )
  assert.deepEqual(repository.list(), [])
})

test('TD-04 createBatch rejects one malformed record before mutating storage', () => {
  const repository =
    createInMemoryTeacherScoreAssignmentRepository()
  const valid = assignment({
    assignmentId: 'assignment-a',
    studentId: 'student-a',
  })

  assert.throws(
    () =>
      repository.createBatch([
        valid,
        Object.freeze({ forged: true }),
      ]),
    /PrivateAssignment/i,
  )
  assert.deepEqual(repository.list(), [])
})

test('TD-04 same student may receive a newer exact revision', () => {
  const existing = assignment({
    assignmentId: 'assignment-r1',
    studentId: 'student-a',
    revisionId: 'revision-1',
  })
  const repository =
    createInMemoryTeacherScoreAssignmentRepository([existing])
  const next = assignment({
    assignmentId: 'assignment-r2',
    studentId: 'student-a',
    revisionId: 'revision-2',
  })

  repository.createBatch([next])

  assert.deepEqual(repository.list(), [existing, next])
})
