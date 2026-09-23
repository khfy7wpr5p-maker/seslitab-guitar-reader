import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  PRIVATE_ASSIGNMENT_STATE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'
import {
  createInitialAssignmentLifecycleRecord,
  isAssignmentLifecycleRecord,
  revokeAssignmentLifecycleRecord,
  transitionAssignmentLifecycleRecord,
} from '../src/services/assignmentLifecycleRecord.js'

function sourceRef(studentId = 'student-a') {
  return Object.freeze({
    schemaVersion: 1,
    sourceKind: 'score_exact_revision',
    studentId,
    sourceId: 'score-1',
    sourceRevisionId: 'source-r1',
    revisionId: 'revision-1',
    revisionKind: 'automatic',
    contentFingerprint: 'content-fp',
    lineageFingerprint: 'lineage-fp',
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
  assignedAt = '2026-09-23T07:30:00Z',
} = {}) {
  return createPrivateAssignment({
    assignmentId,
    studentId,
    practiceType: PRIVATE_ASSIGNMENT_PRACTICE_TYPE.SCORE,
    teacherNote: 'Yavaş çalış.',
    assignedAt,
    sourceRef: sourceRef(studentId),
  })
}

test('TD-05 initial lifecycle view preserves exact assignment and ACTIVE state', () => {
  const assignment = scoreAssignment()
  const record = createInitialAssignmentLifecycleRecord(assignment)

  assert.equal(Object.isFrozen(record), true)
  assert.equal(record.assignment, assignment)
  assert.equal(record.state, PRIVATE_ASSIGNMENT_STATE.ACTIVE)
  assert.equal(record.stateChangedAt, assignment.assignedAt)
  assert.equal(record.revokedAt, null)
  assert.equal(isAssignmentLifecycleRecord(record), true)
})

test('TD-05 lifecycle transitions ACTIVE -> COMPLETED -> REPERTOIRE without changing assignment', () => {
  const assignment = scoreAssignment()
  const active = createInitialAssignmentLifecycleRecord(assignment)
  const completed = transitionAssignmentLifecycleRecord(
    active,
    PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    '2026-09-23T08:00:00Z',
  )
  const repertoire = transitionAssignmentLifecycleRecord(
    completed,
    PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
    '2026-09-23T09:00:00Z',
  )

  assert.equal(completed.assignment, assignment)
  assert.equal(repertoire.assignment, assignment)
  assert.equal(completed.state, PRIVATE_ASSIGNMENT_STATE.COMPLETED)
  assert.equal(repertoire.state, PRIVATE_ASSIGNMENT_STATE.REPERTOIRE)
  assert.equal(completed.stateChangedAt, '2026-09-23T08:00:00Z')
  assert.equal(repertoire.stateChangedAt, '2026-09-23T09:00:00Z')
})

test('TD-05 lifecycle rejects skipped reverse and post-revoke transitions', () => {
  const assignment = scoreAssignment()
  const active = createInitialAssignmentLifecycleRecord(assignment)

  assert.throws(
    () => transitionAssignmentLifecycleRecord(
      active,
      PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
      '2026-09-23T08:00:00Z',
    ),
    /transition/i,
  )

  const completed = transitionAssignmentLifecycleRecord(
    active,
    PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    '2026-09-23T08:00:00Z',
  )

  assert.throws(
    () => transitionAssignmentLifecycleRecord(
      completed,
      PRIVATE_ASSIGNMENT_STATE.ACTIVE,
      '2026-09-23T09:00:00Z',
    ),
    /transition/i,
  )

  const revoked = revokeAssignmentLifecycleRecord(
    completed,
    '2026-09-23T10:00:00Z',
  )

  assert.throws(
    () => transitionAssignmentLifecycleRecord(
      revoked,
      PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
      '2026-09-23T11:00:00Z',
    ),
    /revoked/i,
  )
})

test('TD-05 revoke preserves current lifecycle state and exact assignment', () => {
  const assignment = scoreAssignment()
  const completed = transitionAssignmentLifecycleRecord(
    createInitialAssignmentLifecycleRecord(assignment),
    PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    '2026-09-23T08:00:00Z',
  )
  const revoked = revokeAssignmentLifecycleRecord(
    completed,
    '2026-09-23T10:00:00Z',
  )

  assert.equal(revoked.assignment, assignment)
  assert.equal(revoked.state, PRIVATE_ASSIGNMENT_STATE.COMPLETED)
  assert.equal(revoked.stateChangedAt, completed.stateChangedAt)
  assert.equal(revoked.revokedAt, '2026-09-23T10:00:00Z')
  assert.equal(isAssignmentLifecycleRecord(revoked), true)
})

test('TD-05 lifecycle validator rejects mutable clone', () => {
  const record = createInitialAssignmentLifecycleRecord(scoreAssignment())

  assert.equal(isAssignmentLifecycleRecord(structuredClone(record)), false)
})

test('TD-05 lifecycle validator rejects unsupported fields and malformed timestamps', () => {
  const active = createInitialAssignmentLifecycleRecord(scoreAssignment())

  assert.equal(
    isAssignmentLifecycleRecord(Object.freeze({
      ...active,
      extraAuthority: true,
    })),
    false,
  )

  assert.equal(
    isAssignmentLifecycleRecord(Object.freeze({
      ...active,
      state: PRIVATE_ASSIGNMENT_STATE.COMPLETED,
      stateChangedAt: '',
    })),
    false,
  )

  assert.throws(
    () => transitionAssignmentLifecycleRecord(
      active,
      PRIVATE_ASSIGNMENT_STATE.COMPLETED,
      '',
    ),
    /transitionedAt|timestamp/i,
  )
})

test('TD-05 lifecycle rejects accessor and symbol-backed records', () => {
  const active = createInitialAssignmentLifecycleRecord(scoreAssignment())

  const accessor = {
    ...active,
  }
  Object.defineProperty(accessor, 'state', {
    enumerable: true,
    get() {
      return PRIVATE_ASSIGNMENT_STATE.ACTIVE
    },
  })
  Object.freeze(accessor)

  assert.equal(isAssignmentLifecycleRecord(accessor), false)

  assert.equal(
    isAssignmentLifecycleRecord(Object.freeze({
      ...active,
      [Symbol('hidden-authority')]: true,
    })),
    false,
  )
})

test('TD-05 direct revoke retry is idempotent and preserves original timestamp', () => {
  const active = createInitialAssignmentLifecycleRecord(scoreAssignment())
  const first = revokeAssignmentLifecycleRecord(
    active,
    '2026-09-23T10:00:00Z',
  )
  const retry = revokeAssignmentLifecycleRecord(
    first,
    '2026-09-23T11:00:00Z',
  )

  assert.equal(retry, first)
  assert.equal(retry.revokedAt, '2026-09-23T10:00:00Z')
})

test('TD-05 lifecycle requires a valid immutable initial SCORE assignment', () => {
  assert.throws(
    () => createInitialAssignmentLifecycleRecord(
      Object.freeze({
        assignmentId: 'forged',
      }),
    ),
    /PrivateAssignment/i,
  )
})
