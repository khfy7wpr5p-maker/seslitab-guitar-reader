import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createInitialAssignmentLifecycleRecord,
  revokeAssignmentLifecycleRecord,
} from '../src/services/assignmentLifecycleRecord.js'
import {
  createChordBoardAssignmentSourceBinding,
} from '../src/services/chordBoardAssignmentSourceBinding.js'
import {
  getChordBoardVoicings,
} from '../src/services/chordBoardCatalog.js'
import {
  createDeliveryRecord,
  revokeDeliveryRecord,
} from '../src/services/deliveryRecord.js'
import {
  PRIVATE_ASSIGNMENT_PRACTICE_TYPE,
  createPrivateAssignment,
} from '../src/services/privateAssignment.js'
import {
  createPreparedAssignmentRecord,
} from '../src/services/preparedAssignmentRecord.js'
import {
  createSecureDeliveryIdentityMapping,
} from '../src/services/secureDeliveryIdentity.js'
import {
  createTeacherStudentGrant,
} from '../src/services/teacherStudentGrant.js'
import {
  restorePrivateAssignmentV1,
} from '../src/services/teacherDeliveryWireCodec.js'
import {
  createSecureDeliveryAuthorization,
} from '../backend/delivery/authorization/secureDeliveryAuthorization.js'
import {
  createInMemorySecureDeliveryStore,
} from '../backend/delivery/repositories/inMemorySecureDeliveryStore.js'

async function loadService() {
  try {
    return await import('../backend/delivery/services/teacherPieceService.js')
  } catch {
    assert.fail('teacherPieceService module must exist')
  }
}

function scoreAssignment(
  assignmentId = 'score-a',
  studentId = 'student-a',
) {
  return restorePrivateAssignmentV1({
    schemaVersion: 1,
    assignmentId,
    studentId,
    practiceType: 'SCORE',
    teacherNote: 'Nota çalış.',
    state: 'ACTIVE',
    assignedAt: '2026-09-24T08:00:00Z',
    revokedAt: null,
    sourceRef: {
      schemaVersion: 1,
      sourceKind: 'score_exact_revision',
      studentId,
      sourceId: 'source-' + assignmentId,
      sourceRevisionId: 'source-revision-' + assignmentId,
      revisionId: 'revision-' + assignmentId,
      revisionKind: 'automatic',
      contentFingerprint: 'content-' + assignmentId,
      lineageFingerprint: 'lineage-' + assignmentId,
      approvalId: 'approval-' + assignmentId,
      authorizationId: 'authorization-' + assignmentId,
      qualityEvidenceId: 'quality-' + assignmentId,
      revalidationEvidenceId: null,
      readinessRoute: 'package12',
      package12Status: 'PASS',
      boundAt: '2026-09-24T07:59:00Z',
    },
  })
}

function chordAssignment(
  assignmentId = 'chord-a',
  studentId = 'student-a',
) {
  return createPrivateAssignment({
    assignmentId,
    studentId,
    practiceType:
      PRIVATE_ASSIGNMENT_PRACTICE_TYPE.CHORD_BOARD,
    teacherNote: 'Akor çalış.',
    assignedAt: '2026-09-24T08:00:00Z',
    sourceRef:
      createChordBoardAssignmentSourceBinding({
        studentId,
        snapshot:
          getChordBoardVoicings('Am')[0],
        boundAt:
          '2026-09-24T07:59:00Z',
      }),
  })
}

function childRecord({
  assignment,
  teacherId = 'teacher-a',
  revoked = false,
} = {}) {
  const packageId =
    'package-' + assignment.assignmentId
  const prepared =
    createPreparedAssignmentRecord({
      teacherId,
      assignment,
      packageId,
      packageFingerprint:
        'a'.repeat(64),
      preparedAt:
        '2026-09-24T08:01:00Z',
    })
  let delivery = createDeliveryRecord({
    assignmentId:
      assignment.assignmentId,
    packageId,
    teacherId,
    studentId:
      assignment.studentId,
    deliveredAt:
      '2026-09-24T08:02:00Z',
  })
  if (revoked) {
    delivery = revokeDeliveryRecord(
      delivery,
      '2026-09-24T08:03:00Z',
    )
  }
  return { prepared, delivery }
}

function teacherMapping() {
  return createSecureDeliveryIdentityMapping({
    providerSubject: 'uid-teacher-a',
    role: 'TEACHER',
    teacherId: 'teacher-a',
    studentId: null,
    active: true,
    createdAt: '2026-09-24T07:00:00Z',
    disabledAt: null,
  })
}

function grant(studentId = 'student-a') {
  return createTeacherStudentGrant({
    teacherId: 'teacher-a',
    studentId,
    active: true,
    createdAt: '2026-09-24T07:00:00Z',
    revokedAt: null,
  })
}

function pieceInput(overrides = {}) {
  return {
    pieceAssignmentId:
      'piece-assignment-a',
    pieceId: 'piece-cambaz-a',
    arrangementId: 'arr-cambaz-a',
    studentId: 'student-a',
    title: 'Cambaz',
    teacherNote: 'Parçayı yavaş çalış.',
    scoreAssignmentId: 'score-a',
    chordAssignmentIds: ['chord-a'],
    ...overrides,
  }
}

async function harness({
  score = childRecord({
    assignment: scoreAssignment(),
  }),
  chord = childRecord({
    assignment: chordAssignment(),
  }),
  extraGrants = [],
  nowValues = [
    '2026-09-24T08:10:00Z',
    '2026-09-24T09:00:00Z',
    '2026-09-24T10:00:00Z',
    '2026-09-24T11:00:00Z',
  ],
} = {}) {
  const { createTeacherPieceService } =
    await loadService()
  const store =
    createInMemorySecureDeliveryStore({
      identityMappings: [
        teacherMapping(),
      ],
      grants: [
        grant('student-a'),
        ...extraGrants,
      ],
      preparedAssignments: [
        score.prepared,
        chord.prepared,
      ],
      deliveries: [
        score.delivery,
        chord.delivery,
      ],
    })
  const authorization =
    createSecureDeliveryAuthorization({
      store,
    })
  let index = 0
  const service =
    createTeacherPieceService({
      authorization,
      store,
      now: () =>
        nowValues[
          Math.min(
            index++,
            nowValues.length - 1,
          )
        ],
    })
  return { service, store }
}

test('teacher creates one Piece only from same-student same-teacher correctly typed delivered children', async () => {
  const { service, store } =
    await harness()

  const piece = await service.createPiece({
    providerSubject: 'uid-teacher-a',
    input: pieceInput(),
  })

  assert.equal(
    piece.pieceAssignmentId,
    'piece-assignment-a',
  )
  assert.equal(piece.pieceId, 'piece-cambaz-a')
  assert.equal(piece.studentId, 'student-a')
  assert.deepEqual(
    piece.contentRefs,
    {
      scoreAssignmentId: 'score-a',
      chordAssignmentIds: ['chord-a'],
    },
  )
  assert.equal(piece.state, 'ACTIVE')
  assert.equal(
    await store.getPieceAssignment(
      piece.pieceAssignmentId,
    ),
    piece,
  )
})

test('teacher Piece creation fails closed for wrong student teacher or child practice type', async () => {
  const wrongStudent =
    childRecord({
      assignment:
        scoreAssignment(
          'score-a',
          'student-b',
        ),
    })
  {
    const { service, store } =
      await harness({
        score: wrongStudent,
      })
    await assert.rejects(
      () => service.createPiece({
        providerSubject:
          'uid-teacher-a',
        input: pieceInput(),
      }),
      /piece-child-authority-mismatch/i,
    )
    assert.equal(
      await store.getPieceAssignment(
        'piece-assignment-a',
      ),
      null,
    )
  }

  const wrongTeacher =
    childRecord({
      assignment: scoreAssignment(),
      teacherId: 'teacher-b',
    })
  {
    const { service } =
      await harness({
        score: wrongTeacher,
      })
    await assert.rejects(
      () => service.createPiece({
        providerSubject:
          'uid-teacher-a',
        input: pieceInput(),
      }),
      /piece-child-authority-mismatch/i,
    )
  }

  {
    const { service } =
      await harness()
    await assert.rejects(
      () => service.createPiece({
        providerSubject:
          'uid-teacher-a',
        input: pieceInput({
          scoreAssignmentId:
            'chord-a',
          chordAssignmentIds: [],
        }),
      }),
      /piece-child-authority-mismatch/i,
    )
  }
})

test('teacher Piece creation rejects revoked child delivery without leaking owner details', async () => {
  const revokedScore =
    childRecord({
      assignment: scoreAssignment(),
      revoked: true,
    })
  const { service } =
    await harness({
      score: revokedScore,
    })

  await assert.rejects(
    () => service.createPiece({
      providerSubject: 'uid-teacher-a',
      input: pieceInput(),
    }),
    (error) => {
      assert.equal(
        error.message,
        'piece-child-authority-mismatch',
      )
      assert.doesNotMatch(
        error.message,
        /student-a|teacher-a|score-a/i,
      )
      return true
    },
  )
})

test('Piece lifecycle actions mutate only Piece lifecycle and leave child delivery active', async () => {
  const { service, store } =
    await harness()

  const piece = await service.createPiece({
    providerSubject: 'uid-teacher-a',
    input: pieceInput(),
  })

  const completed =
    await service.applyPieceAction({
      providerSubject: 'uid-teacher-a',
      pieceAssignmentId:
        piece.pieceAssignmentId,
      action: 'COMPLETE',
    })
  assert.equal(completed.state, 'COMPLETED')

  const repertoire =
    await service.applyPieceAction({
      providerSubject: 'uid-teacher-a',
      pieceAssignmentId:
        piece.pieceAssignmentId,
      action: 'MOVE_TO_REPERTOIRE',
    })
  assert.equal(
    repertoire.state,
    'REPERTOIRE',
  )

  const revoked =
    await service.applyPieceAction({
      providerSubject: 'uid-teacher-a',
      pieceAssignmentId:
        piece.pieceAssignmentId,
      action: 'REVOKE',
    })
  assert.equal(
    revoked.state,
    'REPERTOIRE',
  )
  assert.equal(
    revoked.revokedAt,
    '2026-09-24T11:00:00Z',
  )

  assert.equal(
    (
      await store.getDelivery('score-a')
    ).revokedAt,
    null,
  )
  assert.equal(
    (
      await store.getDelivery('chord-a')
    ).revokedAt,
    null,
  )
})

test('Piece action rejects invalid action and cannot skip ACTIVE directly to repertoire', async () => {
  const { service } =
    await harness()
  const piece = await service.createPiece({
    providerSubject: 'uid-teacher-a',
    input: pieceInput(),
  })

  await assert.rejects(
    () => service.applyPieceAction({
      providerSubject: 'uid-teacher-a',
      pieceAssignmentId:
        piece.pieceAssignmentId,
      action: 'DELETE',
    }),
    /action/i,
  )

  await assert.rejects(
    () => service.applyPieceAction({
      providerSubject: 'uid-teacher-a',
      pieceAssignmentId:
        piece.pieceAssignmentId,
      action: 'MOVE_TO_REPERTOIRE',
    }),
    /transition/i,
  )
})
