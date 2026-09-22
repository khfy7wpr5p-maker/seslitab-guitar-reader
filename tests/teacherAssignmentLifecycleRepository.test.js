import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  PRIVATE_ASSIGNMENT_STATE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'
import {
  createInitialAssignmentLifecycleRecord,
} from '../src/services/assignmentLifecycleRecord.js'
import {
  assertTeacherAssignmentLifecycleRepository,
  createInMemoryTeacherAssignmentLifecycleRepository,
} from '../src/services/teacherAssignmentLifecycleRepository.js'

function sourceRef(studentId = 'student-a', revisionId = 'revision-1') {
  return Object.freeze({
    schemaVersion: 1,
    sourceKind: 'score_exact_revision',
    studentId,
    sourceId: 'score-1',
    sourceRevisionId: 'source-r1',
    revisionId,
    revisionKind: 'automatic',
    contentFingerprint: `content-${revisionId}`,
    lineageFingerprint: `lineage-${revisionId}`,
    approvalId: 'approval-1',
    authorizationId: `auth-${studentId}`,
    qualityEvidenceId: `quality-${studentId}`,
    revalidationEvidenceId: null,
    readinessRoute: 'package12_t2',
    package12Status: 'eligible_exact_revision',
    boundAt: '2026-09-23T07:00:00Z',
  })
}

function scoreAssignment({
  assignmentId = 'assignment-a',
  studentId = 'student-a',
  revisionId = 'revision-1',
} = {}) {
  return createPrivateAssignment({
    assignmentId,
    studentId,
    practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
    teacherNote: 'Yavaş çalış.',
    assignedAt: '2026-09-23T07:30:00Z',
    sourceRef: sourceRef(studentId, revisionId),
  })
}

test('TD-05 repository stores immutable current record and mutation history', () => {
  const assignment = scoreAssignment()
  const repository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  const completed = repository.transition({
    assignment,
    toState: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    transitionedAt: '2026-09-23T08:00:00Z',
  })
  const repertoire = repository.transition({
    assignment,
    toState: PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
    transitionedAt: '2026-09-23T09:00:00Z',
  })

  assert.equal(
    repository.getByAssignmentId(assignment.assignmentId),
    repertoire,
  )
  assert.deepEqual(
    repository.history(assignment.assignmentId),
    [completed, repertoire],
  )
  assert.equal(
    Object.isFrozen(repository.history(assignment.assignmentId)),
    true,
  )
})

test('TD-05 repository transition retry is idempotent and does not append history', () => {
  const assignment = scoreAssignment()
  const repository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  const first = repository.transition({
    assignment,
    toState: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    transitionedAt: '2026-09-23T08:00:00Z',
  })
  const retry = repository.transition({
    assignment,
    toState: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    transitionedAt: '2026-09-23T08:30:00Z',
  })

  assert.equal(retry, first)
  assert.equal(
    repository.history(assignment.assignmentId).length,
    1,
  )
  assert.equal(
    retry.stateChangedAt,
    '2026-09-23T08:00:00Z',
  )
})

test('TD-05 repository repeated revoke preserves original revokedAt and history', () => {
  const assignment = scoreAssignment()
  const repository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  const first = repository.revoke({
    assignment,
    revokedAt: '2026-09-23T10:00:00Z',
  })
  const retry = repository.revoke({
    assignment,
    revokedAt: '2026-09-23T11:00:00Z',
  })

  assert.equal(retry, first)
  assert.equal(
    retry.revokedAt,
    '2026-09-23T10:00:00Z',
  )
  assert.equal(
    repository.history(assignment.assignmentId).length,
    1,
  )
})

test('TD-05 repository rejects a different original assignment for an existing lifecycle identity', () => {
  const assignment = scoreAssignment()
  const repository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  repository.transition({
    assignment,
    toState: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    transitionedAt: '2026-09-23T08:00:00Z',
  })

  const substituted = scoreAssignment({
    assignmentId: assignment.assignmentId,
    studentId: 'student-b',
  })

  assert.throws(
    () => repository.revoke({
      assignment: substituted,
      revokedAt: '2026-09-23T10:00:00Z',
    }),
    /identity|assignment/i,
  )
})

test('TD-05 repository blocks transition after revoke without changing history', () => {
  const assignment = scoreAssignment()
  const repository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  repository.revoke({
    assignment,
    revokedAt: '2026-09-23T10:00:00Z',
  })
  const before =
    repository.history(assignment.assignmentId)

  assert.throws(
    () => repository.transition({
      assignment,
      toState: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
      transitionedAt: '2026-09-23T11:00:00Z',
    }),
    /revoked/i,
  )
  assert.deepEqual(
    repository.history(assignment.assignmentId),
    before,
  )
})

test('TD-05 repository lists deterministic frozen current overlays', () => {
  const a = scoreAssignment({
    assignmentId: 'assignment-a',
    studentId: 'student-a',
  })
  const b = scoreAssignment({
    assignmentId: 'assignment-b',
    studentId: 'student-b',
  })
  const repository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  const bCompleted = repository.transition({
    assignment: b,
    toState: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    transitionedAt: '2026-09-23T08:00:00Z',
  })
  const aRevoked = repository.revoke({
    assignment: a,
    revokedAt: '2026-09-23T09:00:00Z',
  })

  const rows = repository.list()

  assert.equal(Object.isFrozen(repository), true)
  assert.equal(Object.isFrozen(rows), true)
  assert.deepEqual(rows, [bCompleted, aRevoked])
})

test('TD-05 repository validates initial records and rejects duplicate lifecycle identity', () => {
  const assignment = scoreAssignment()
  const initial =
    createInitialAssignmentLifecycleRecord(assignment)

  assert.throws(
    () =>
      createInMemoryTeacherAssignmentLifecycleRepository([
        Object.freeze({ forged: true }),
      ]),
    /AssignmentLifecycleRecord/i,
  )

  assert.throws(
    () =>
      createInMemoryTeacherAssignmentLifecycleRepository([
        initial,
        initial,
      ]),
    /duplicate.*assignmentId/i,
  )
})

test('TD-05 repository unknown history is frozen empty and lookup normalizes ID', () => {
  const assignment = scoreAssignment()
  const initial =
    createInitialAssignmentLifecycleRecord(assignment)
  const repository =
    createInMemoryTeacherAssignmentLifecycleRepository([
      initial,
    ])

  assert.equal(
    repository.getByAssignmentId(' assignment-a '),
    initial,
  )
  const history = repository.history('missing')
  assert.deepEqual(history, [])
  assert.equal(Object.isFrozen(history), true)
})

test('TD-05 repository strict mutation input rejects extra accessor and symbol authority', () => {
  const assignment = scoreAssignment()
  const repository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  assert.throws(
    () => repository.transition({
      assignment,
      toState: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
      transitionedAt: '2026-09-23T08:00:00Z',
      extra: true,
    }),
    /unsupported/i,
  )

  const accessor = {
    assignment,
    toState: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    transitionedAt: '2026-09-23T08:00:00Z',
  }
  Object.defineProperty(accessor, 'transitionedAt', {
    enumerable: true,
    get() {
      return '2026-09-23T08:00:00Z'
    },
  })
  assert.throws(
    () => repository.transition(accessor),
    /plain data|enumerable/i,
  )

  assert.throws(
    () => repository.revoke({
      assignment,
      revokedAt: '2026-09-23T10:00:00Z',
      [Symbol('hidden')]: true,
    }),
    /unsupported/i,
  )
})

test('TD-05 repository exposes no hard delete restore or unrevoke surface', () => {
  const repository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  assert.equal('delete' in repository, false)
  assert.equal('restore' in repository, false)
  assert.equal('unrevoke' in repository, false)
})

test('TD-05 repository assertion requires the lifecycle contract surface', () => {
  assert.throws(
    () => assertTeacherAssignmentLifecycleRepository({}),
    /list.*getByAssignmentId.*history.*transition.*revoke/i,
  )
})
