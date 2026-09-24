import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  PRIVATE_ASSIGNMENT_STATE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'
import {
  createInitialAssignmentLifecycleRecord,
  transitionAssignmentLifecycleRecord,
} from '../src/services/assignmentLifecycleRecord.js'
import {
  createInMemoryTeacherAssignmentLifecycleRepository,
} from '../src/services/teacherAssignmentLifecycleRepository.js'
import {
  createInMemoryTeacherScoreAssignmentRepository,
} from '../src/services/teacherScoreAssignmentRepository.js'
import { getChordBoardVoicings } from '../src/services/chordBoardCatalog.js'
import { createChordBoardAssignmentSourceBinding } from '../src/services/chordBoardAssignmentSourceBinding.js'
import { createInMemoryTeacherChordBoardAssignmentRepository } from '../src/services/teacherChordBoardAssignmentRepository.js'
import {
  createTeacherAssignmentLifecycleService,
} from '../src/services/teacherAssignmentLifecycleService.js'

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


function chordAssignment({
  assignmentId = 'assignment-chord-a',
  studentId = 'student-a',
} = {}) {
  const assignedAt = '2026-09-23T07:30:00Z'
  const snapshot =
    getChordBoardVoicings('Am')[0]
  return createPrivateAssignment({
    assignmentId,
    studentId,
    practiceType:
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD,
    teacherNote: 'Akoru temiz çalış.',
    assignedAt,
    sourceRef:
      createChordBoardAssignmentSourceBinding({
        studentId,
        snapshot,
        boundAt: assignedAt,
      }),
  })
}

function serviceWith({
  assignments = [scoreAssignment()],
  assignmentRepository =
    createInMemoryTeacherScoreAssignmentRepository(assignments),
  lifecycleRepository =
    createInMemoryTeacherAssignmentLifecycleRepository(),
  now = (() => {
    const times = [
      '2026-09-23T08:00:00Z',
      '2026-09-23T09:00:00Z',
      '2026-09-23T10:00:00Z',
    ]
    let index = 0
    return () => times[index++] ?? times.at(-1)
  })(),
} = {}) {
  return {
    assignmentRepository,
    lifecycleRepository,
    service: createTeacherAssignmentLifecycleService({
      assignmentRepository,
      lifecycleRepository,
      now,
    }),
  }
}

test('TD-05 service lists TD-04 assignments as effective ACTIVE without persisting an overlay', () => {
  const assignment = scoreAssignment()
  const lifecycleRepository =
    createInMemoryTeacherAssignmentLifecycleRepository()
  const { service } = serviceWith({
    assignments: [assignment],
    lifecycleRepository,
  })

  const rows = service.listAssignments()

  assert.equal(Object.isFrozen(rows), true)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].assignment, assignment)
  assert.equal(rows[0].state, PRIVATE_ASSIGNMENT_STATE.ACTIVE)
  assert.equal(rows[0].revokedAt, null)
  assert.deepEqual(lifecycleRepository.list(), [])
})

test('TD-05 service completes then promotes the exact original assignment', () => {
  const assignment = scoreAssignment()
  const { service } = serviceWith({
    assignments: [assignment],
  })

  const completed =
    service.markCompleted(assignment.assignmentId)
  const repertoire =
    service.moveToRepertoire(assignment.assignmentId)

  assert.equal(completed.assignment, assignment)
  assert.equal(repertoire.assignment, assignment)
  assert.equal(
    repertoire.state,
    PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
  )
  assert.equal(
    repertoire.assignment.sourceRef,
    assignment.sourceRef,
  )
})

test('TD-05 service idempotent transition retry does not call now again', () => {
  const assignment = scoreAssignment()
  let nowCalls = 0
  const { service } = serviceWith({
    assignments: [assignment],
    now() {
      nowCalls += 1
      return nowCalls === 1
        ? '2026-09-23T08:00:00Z'
        : '2026-09-23T09:00:00Z'
    },
  })

  const first =
    service.markCompleted(assignment.assignmentId)
  const retry =
    service.markCompleted(assignment.assignmentId)

  assert.equal(first, retry)
  assert.equal(nowCalls, 1)
})

test('TD-05 service repeated revoke is idempotent and does not call now again', () => {
  const assignment = scoreAssignment()
  let nowCalls = 0
  const { service } = serviceWith({
    assignments: [assignment],
    now() {
      nowCalls += 1
      return nowCalls === 1
        ? '2026-09-23T10:00:00Z'
        : '2026-09-23T11:00:00Z'
    },
  })

  const first =
    service.revokeAssignment(assignment.assignmentId)
  const retry =
    service.revokeAssignment(assignment.assignmentId)

  assert.equal(first, retry)
  assert.equal(first.revokedAt, '2026-09-23T10:00:00Z')
  assert.equal(nowCalls, 1)
})

test('TD-05 service revokes ACTIVE COMPLETED and REPERTOIRE states and blocks later transition', () => {
  for (const target of [
    PRIVATE_ASSIGNMENT_STATE.ACTIVE,
    PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
  ]) {
    const assignment = scoreAssignment({
      assignmentId: `assignment-${target}`,
    })
    const { service } = serviceWith({
      assignments: [assignment],
    })

    if (target !== PRIVATE_ASSIGNMENT_STATE.ACTIVE) {
      service.markCompleted(assignment.assignmentId)
    }
    if (target === PRIVATE_ASSIGNMENT_STATE.REPERTOIRE) {
      service.moveToRepertoire(assignment.assignmentId)
    }

    const revoked =
      service.revokeAssignment(assignment.assignmentId)

    assert.equal(revoked.state, target)
    assert.notEqual(revoked.revokedAt, null)

    if (target !== PRIVATE_ASSIGNMENT_STATE.REPERTOIRE) {
      assert.throws(
        () => service.moveToRepertoire(
          assignment.assignmentId,
        ),
        /revoked/i,
      )
    }
  }
})

test('TD-05 service rejects skipped transition unknown assignment and malformed time', () => {
  const assignment = scoreAssignment()
  let nowCalls = 0
  const { service } = serviceWith({
    assignments: [assignment],
    now() {
      nowCalls += 1
      return ''
    },
  })

  assert.throws(
    () => service.moveToRepertoire(
      assignment.assignmentId,
    ),
    /transition.*not.*allowed/i,
  )
  assert.equal(nowCalls, 0)

  assert.throws(
    () => service.markCompleted('missing'),
    /not-found/i,
  )
  assert.equal(nowCalls, 0)

  assert.throws(
    () => service.markCompleted(
      assignment.assignmentId,
    ),
    /transitionedAt|timestamp/i,
  )
  assert.equal(nowCalls, 1)
})

test('TD-05 service rejects a valid acknowledgement bound to another original assignment', () => {
  const expected = scoreAssignment()
  const other = scoreAssignment({
    assignmentId: 'assignment-other',
    studentId: 'student-b',
  })
  const wrongAck = transitionAssignmentLifecycleRecord(
    createInitialAssignmentLifecycleRecord(other),
    PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    '2026-09-23T08:00:00Z',
  )
  const baseLifecycle =
    createInMemoryTeacherAssignmentLifecycleRepository()

  const { service } = serviceWith({
    assignments: [expected],
    lifecycleRepository: {
      ...baseLifecycle,
      transition() {
        return wrongAck
      },
    },
  })

  assert.throws(
    () => service.markCompleted(expected.assignmentId),
    /acknowledgement.*mismatch/i,
  )
})

test('TD-05 service rejects acknowledgement with substituted audit timestamp', () => {
  const assignment = scoreAssignment()
  const baseLifecycle =
    createInMemoryTeacherAssignmentLifecycleRepository()
  const { service } = serviceWith({
    assignments: [assignment],
    lifecycleRepository: {
      ...baseLifecycle,
      transition(input) {
        return baseLifecycle.transition({
          ...input,
          transitionedAt: '2026-09-23T07:59:59Z',
        })
      },
    },
    now() {
      return '2026-09-23T08:00:00Z'
    },
  })

  assert.throws(
    () => service.markCompleted(assignment.assignmentId),
    /acknowledgement.*mismatch/i,
  )
})

test('TD-05 list fails closed for malformed or duplicate original assignment authority', () => {
  const assignment = scoreAssignment()
  const lifecycleRepository =
    createInMemoryTeacherAssignmentLifecycleRepository()

  for (const rows of [
    [Object.freeze({ forged: true })],
    [assignment, assignment],
  ]) {
    const service =
      createTeacherAssignmentLifecycleService({
        assignmentRepository: {
          list() {
            return rows
          },
          getByAssignmentId() {
            return assignment
          },
        },
        lifecycleRepository,
        now() {
          return '2026-09-23T08:00:00Z'
        },
      })

    assert.throws(
      () => service.listAssignments(),
      /PrivateAssignment|duplicate.*assignmentId/i,
    )
  }
})

test('TD-05 list fails closed for malformed duplicate or foreign lifecycle overlays', () => {
  const assignment = scoreAssignment()
  const other = scoreAssignment({
    assignmentId: 'assignment-other',
    studentId: 'student-b',
  })
  const validOverlay = transitionAssignmentLifecycleRecord(
    createInitialAssignmentLifecycleRecord(assignment),
    PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    '2026-09-23T08:00:00Z',
  )
  const foreignOverlay = transitionAssignmentLifecycleRecord(
    createInitialAssignmentLifecycleRecord(other),
    PRIVATE_ASSIGNMENT_STATE.COMPLETED,
    '2026-09-23T08:00:00Z',
  )

  for (const overlays of [
    [Object.freeze({ forged: true })],
    [validOverlay, validOverlay],
    [foreignOverlay],
  ]) {
    const { service } = serviceWith({
      assignments: [assignment],
      lifecycleRepository: {
        list() {
          return overlays
        },
        getByAssignmentId() {
          return null
        },
        history() {
          return Object.freeze([])
        },
        transition() {
          throw new Error('unused')
        },
        revoke() {
          throw new Error('unused')
        },
      },
    })

    assert.throws(
      () => service.listAssignments(),
      /lifecycle|duplicate.*assignmentId|unknown assignment/i,
    )
  }
})

test('TD-05 mutation validates complete TD-04 snapshot before accepting point lookup', () => {
  const assignment = scoreAssignment()
  const duplicateClone = scoreAssignment({
    assignmentId: assignment.assignmentId,
  })
  const lifecycleRepository =
    createInMemoryTeacherAssignmentLifecycleRepository()
  const service =
    createTeacherAssignmentLifecycleService({
      assignmentRepository: {
        list() {
          return [assignment, duplicateClone]
        },
        getByAssignmentId() {
          return assignment
        },
      },
      lifecycleRepository,
      now() {
        return '2026-09-23T08:00:00Z'
      },
    })

  assert.throws(
    () => service.markCompleted(assignment.assignmentId),
    /duplicate.*assignmentId/i,
  )
  assert.deepEqual(lifecycleRepository.list(), [])
})

test('TD-05 service history is frozen and revalidates exact assignment identity', () => {
  const assignment = scoreAssignment()
  const { service } = serviceWith({
    assignments: [assignment],
  })

  const completed =
    service.markCompleted(assignment.assignmentId)
  const history =
    service.getAssignmentHistory(assignment.assignmentId)

  assert.equal(Object.isFrozen(history), true)
  assert.deepEqual(history, [completed])
})


test('TD-07 lifecycle service completes promotes and revokes CHORD_BOARD without changing exact source', () => {
  const assignment = chordAssignment()
  const assignmentRepository =
    createInMemoryTeacherChordBoardAssignmentRepository([
      assignment,
    ])
  const lifecycleRepository =
    createInMemoryTeacherAssignmentLifecycleRepository()
  const times = [
    '2026-09-23T08:00:00Z',
    '2026-09-23T09:00:00Z',
    '2026-09-23T10:00:00Z',
  ]
  let index = 0
  const service =
    createTeacherAssignmentLifecycleService({
      assignmentRepository,
      lifecycleRepository,
      now() {
        return times[index++]
      },
    })

  const completed =
    service.markCompleted(
      assignment.assignmentId,
    )
  const repertoire =
    service.moveToRepertoire(
      assignment.assignmentId,
    )
  const revoked =
    service.revokeAssignment(
      assignment.assignmentId,
    )

  assert.equal(completed.assignment, assignment)
  assert.equal(repertoire.assignment, assignment)
  assert.equal(revoked.assignment, assignment)
  assert.equal(
    revoked.assignment.sourceRef,
    assignment.sourceRef,
  )
  assert.equal(
    revoked.assignment.sourceRef.snapshot,
    assignment.sourceRef.snapshot,
  )
  assert.equal(
    revoked.state,
    PRIVATE_ASSIGNMENT_STATE.REPERTOIRE,
  )
  assert.equal(
    revoked.revokedAt,
    '2026-09-23T10:00:00Z',
  )
})
