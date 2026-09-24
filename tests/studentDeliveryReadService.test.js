import assert from 'node:assert/strict'
import test from 'node:test'

import { restorePrivateAssignmentV1 } from '../src/services/teacherDeliveryWireCodec.js'
import { createStudentPrivatePracticePackageV1 } from '../src/services/studentPracticePackageV1.js'
import { fingerprintPracticePackage } from '../backend/delivery/integrity/packageFingerprint.js'
import { createPreparedAssignmentRecord } from '../src/services/preparedAssignmentRecord.js'
import { createDeliveryRecord, revokeDeliveryRecord } from '../src/services/deliveryRecord.js'
import { createSecureDeliveryIdentityMapping } from '../src/services/secureDeliveryIdentity.js'
import { createTeacherStudentGrant } from '../src/services/teacherStudentGrant.js'
import { createSecureDeliveryAuthorization } from '../backend/delivery/authorization/secureDeliveryAuthorization.js'
import { createInMemorySecureDeliveryStore } from '../backend/delivery/repositories/inMemorySecureDeliveryStore.js'
import { createTeacherSecureDeliveryService } from '../backend/delivery/services/teacherDeliveryService.js'
import {
  createInitialAssignmentLifecycleRecord,
  transitionAssignmentLifecycleRecord,
} from '../src/services/assignmentLifecycleRecord.js'
import {
  createPieceAssignment,
} from '../src/services/pieceAssignment.js'
import {
  createInitialPieceLifecycleRecord,
  revokePieceLifecycleRecord,
  transitionPieceLifecycleRecord,
} from '../src/services/pieceAssignmentLifecycleRecord.js'

async function loadService() {
  try {
    return await import('../backend/delivery/services/studentDeliveryReadService.js')
  } catch {
    assert.fail('studentDeliveryReadService module must exist')
  }
}

function prepared(assignmentId, studentId, revisionId, packageId) {
  const assignment = restorePrivateAssignmentV1({
    schemaVersion: 1,
    assignmentId,
    studentId,
    practiceType: 'SCORE',
    teacherNote: 'Ölçü 8 tekrar',
    state: 'ACTIVE',
    assignedAt: '2026-09-23T08:01:00Z',
    revokedAt: null,
    sourceRef: {
      schemaVersion: 1,
      sourceKind: 'score_exact_revision',
      studentId,
      sourceId: 'source-' + assignmentId,
      sourceRevisionId: 'root-' + assignmentId,
      revisionId,
      revisionKind: 'automatic',
      contentFingerprint: 'content-' + revisionId,
      lineageFingerprint: 'lineage-' + revisionId,
      approvalId: 'approval-' + revisionId,
      authorizationId: 'authorization-' + revisionId,
      qualityEvidenceId: 'quality-' + revisionId,
      revalidationEvidenceId: 'revalidation-' + revisionId,
      readinessRoute: 'package12',
      package12Status: 'PASS',
      boundAt: '2026-09-23T08:00:00Z',
    },
  })
  const pkg = createStudentPrivatePracticePackageV1({
    packageId,
    workId: 'work-' + packageId,
    title: 'Etüt',
    revisionId,
    approvedAt: '2026-09-23T08:00:00Z',
    studentId,
    musicXml: '<score-partwise version="4.0"></score-partwise>',
    canonicalEvents: [],
    practice: { tempoBpm: 80 },
  })
  return {
    record: createPreparedAssignmentRecord({
      teacherId: 'teacher-a',
      assignment,
      packageId,
      packageFingerprint: fingerprintPracticePackage(pkg),
      preparedAt: '2026-09-23T08:02:00Z',
    }),
    package: pkg,
  }
}

function studentMapping(uid, studentId) {
  return createSecureDeliveryIdentityMapping({
    providerSubject: uid,
    role: 'STUDENT',
    teacherId: null,
    studentId,
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    disabledAt: null,
  })
}

function teacherMapping() {
  return createSecureDeliveryIdentityMapping({
    providerSubject: 'uid-teacher',
    role: 'TEACHER',
    teacherId: 'teacher-a',
    studentId: null,
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    disabledAt: null,
  })
}

function makeHarness({ lifecycleA = null } = {}) {
  const a = prepared('assignment-a', 'student-a', 'revision-a', 'package-a')
  const b = prepared('assignment-b', 'student-b', 'revision-b', 'package-b')
  const deliveryA = createDeliveryRecord({
    assignmentId: 'assignment-a',
    packageId: 'package-a',
    teacherId: 'teacher-a',
    studentId: 'student-a',
    deliveredAt: '2026-09-23T08:03:00Z',
  })
  const deliveryB = createDeliveryRecord({
    assignmentId: 'assignment-b',
    packageId: 'package-b',
    teacherId: 'teacher-a',
    studentId: 'student-b',
    deliveredAt: '2026-09-23T08:03:00Z',
  })
  const grants = ['student-a', 'student-b'].map((studentId) =>
    createTeacherStudentGrant({
      teacherId: 'teacher-a',
      studentId,
      active: true,
      createdAt: '2026-09-23T08:00:00Z',
      revokedAt: null,
    }),
  )
  const store = createInMemorySecureDeliveryStore({
    identityMappings: [
      teacherMapping(),
      studentMapping('uid-student-a', 'student-a'),
      studentMapping('uid-student-b', 'student-b'),
    ],
    grants,
    preparedAssignments: [a.record, b.record],
    practicePackages: [a.package, b.package],
    lifecycles: lifecycleA === null ? [] : [lifecycleA],
    deliveries: [deliveryA, deliveryB],
  })
  return {
    store,
    preparedA: a.record,
    authorization: createSecureDeliveryAuthorization({ store }),
  }
}

test('student list returns only the authenticated student private work', async () => {
  const { createStudentDeliveryReadService } = await loadService()
  const h = makeHarness()
  const service = createStudentDeliveryReadService(h)

  const rows = await service.listAssignments({
    providerSubject: 'uid-student-a',
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].deliveryId, 'assignment-a')
  assert.deepEqual(
    {
      deliveryId: rows[0].deliveryId,
      assignmentId: rows[0].assignmentId,
      packageId: rows[0].packageId,
      practiceType: rows[0].practiceType,
      state: rows[0].state,
      assignedAt: rows[0].assignedAt,
      deliveredAt: rows[0].deliveredAt,
    },
    {
      deliveryId: 'assignment-a',
      assignmentId: 'assignment-a',
      packageId: 'package-a',
      practiceType: 'SCORE',
      state: 'ACTIVE',
      assignedAt: '2026-09-23T08:01:00Z',
      deliveredAt: '2026-09-23T08:03:00Z',
    },
  )
  assert.equal(rows[0].package.publication.recipientStudentId, 'student-a')
  assert.equal(rows[0].teacherNote, 'Ölçü 8 tekrar')
})

test('student read model carries current lifecycle state', async () => {
  const { createStudentDeliveryReadService } = await loadService()

  const base = makeHarness()
  const active =
    createInitialAssignmentLifecycleRecord(
      base.preparedA.assignment,
    )
  const completed =
    transitionAssignmentLifecycleRecord(
      active,
      'COMPLETED',
      '2026-09-23T08:20:00Z',
    )
  const repertoire =
    transitionAssignmentLifecycleRecord(
      completed,
      'REPERTOIRE',
      '2026-09-23T08:30:00Z',
    )

  for (const [lifecycle, expected] of [
    [completed, 'COMPLETED'],
    [repertoire, 'REPERTOIRE'],
  ]) {
    const h = makeHarness({ lifecycleA: lifecycle })
    const service = createStudentDeliveryReadService(h)
    const [row] = await service.listAssignments({
      providerSubject: 'uid-student-a',
    })

    assert.equal(row.state, expected)
    assert.equal(row.assignmentId, 'assignment-a')
    assert.equal(row.practiceType, 'SCORE')
    assert.equal(row.assignedAt, '2026-09-23T08:01:00Z')
  }
})

test('Student A cannot read Student B even with exact deliveryId and error does not reveal owner', async () => {
  const { createStudentDeliveryReadService } = await loadService()
  const h = makeHarness()
  const service = createStudentDeliveryReadService(h)

  await assert.rejects(
    () => service.getAssignment({
      providerSubject: 'uid-student-a',
      deliveryId: 'assignment-b',
    }),
    (error) => {
      assert.match(error.message, /not-found|forbidden/i)
      assert.doesNotMatch(error.message, /student-b|teacher-a/i)
      return true
    },
  )
})

test('student read model strips teacher/provider/evidence diagnostics', async () => {
  const { createStudentDeliveryReadService } = await loadService()
  const h = makeHarness()
  const service = createStudentDeliveryReadService(h)
  const result = await service.getAssignment({
    providerSubject: 'uid-student-a',
    deliveryId: 'assignment-a',
  })
  const serialized = JSON.stringify(result)

  assert.deepEqual(
    Object.keys(result).sort(),
    [
      'assignedAt',
      'assignmentId',
      'deliveredAt',
      'deliveryId',
      'package',
      'packageId',
      'practiceType',
      'state',
      'teacherNote',
    ],
  )

  for (const forbidden of [
    'firebaseUid',
    'providerSubject',
    'teacherId',
    'authorizationId',
    'qualityEvidenceId',
    'revalidationEvidenceId',
    'readinessRoute',
    'package12Status',
    'firestorePath',
    'serviceAccount',
    'token',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden)
  }
})

test('fresh student reads exclude delivery after teacher revoke commits', async () => {
  const { createStudentDeliveryReadService } = await loadService()
  const h = makeHarness()
  const student = createStudentDeliveryReadService(h)
  const teacher = createTeacherSecureDeliveryService({
    authorization: h.authorization,
    store: h.store,
    now: () => '2026-09-23T08:10:00Z',
    createHistoryEventId: () => 'history-revoke-a',
  })

  assert.equal(
    (await student.listAssignments({ providerSubject: 'uid-student-a' })).length,
    1,
  )
  await teacher.applyAssignmentAction({
    providerSubject: 'uid-teacher',
    assignmentId: 'assignment-a',
    action: 'REVOKE',
  })
  assert.deepEqual(
    await student.listAssignments({ providerSubject: 'uid-student-a' }),
    Object.freeze([]),
  )
})

test('student list rereads current delivery and fails closed across revoke race', async () => {
  const { createStudentDeliveryReadService } = await loadService()
  const h = makeHarness()
  const active = await h.store.getDelivery('assignment-a')
  const revoked = revokeDeliveryRecord(active, '2026-09-23T08:11:00Z')
  let listed = false
  const racedStore = {
    ...h.store,
    async listActiveDeliveriesForStudent(studentId) {
      listed = true
      return Object.freeze([active])
    },
    async getDelivery(assignmentId) {
      if (listed && assignmentId === 'assignment-a') return revoked
      return h.store.getDelivery(assignmentId)
    },
  }
  const authorization = createSecureDeliveryAuthorization({ store: racedStore })
  const service = createStudentDeliveryReadService({
    authorization,
    store: racedStore,
  })

  assert.deepEqual(
    await service.listAssignments({ providerSubject: 'uid-student-a' }),
    Object.freeze([]),
  )
})


test('student Piece list uses Piece lifecycle and exposes bounded manifest metadata only', async () => {
  const { createStudentDeliveryReadService } = await loadService()
  const h = makeHarness()
  const piece = createPieceAssignment({
    pieceAssignmentId: 'piece-student-a',
    pieceId: 'work-cambaz-a',
    arrangementId: 'arr-cambaz-a',
    studentId: 'student-a',
    title: 'Cambaz',
    teacherNote: 'Yavaş çalış.',
    assignedAt: '2026-09-24T08:10:00Z',
    contentRefs: {
      scoreAssignmentId: 'assignment-a',
      chordAssignmentIds: [],
    },
  })
  await h.store.putPieceAssignment(piece)
  const active = createInitialPieceLifecycleRecord(piece)
  const completed = transitionPieceLifecycleRecord(
    active,
    'COMPLETED',
    '2026-09-24T08:20:00Z',
  )
  await h.store.commitPieceLifecycleMutation({
    currentLifecycle: active,
    nextLifecycle: completed,
  })

  const service = createStudentDeliveryReadService(h)
  const rows = await service.listPieces({
    providerSubject: 'uid-student-a',
  })

  assert.equal(rows.length, 1)
  assert.deepEqual(
    Object.keys(rows[0]).sort(),
    [
      'arrangementId',
      'assignedAt',
      'contentRefs',
      'pieceAssignmentId',
      'pieceId',
      'schemaVersion',
      'state',
      'teacherNote',
      'title',
    ],
  )
  assert.equal(rows[0].state, 'COMPLETED')
  assert.equal(rows[0].title, 'Cambaz')
  assert.deepEqual(rows[0].contentRefs, {
    scoreAssignmentId: 'assignment-a',
    chordAssignmentIds: [],
  })
  const serialized = JSON.stringify(rows[0])
  assert.equal(serialized.includes('studentId'), false)
  assert.equal(serialized.includes('teacherId'), false)
  assert.equal(serialized.includes('package'), false)
})

test('student cannot read another student Piece by exact Piece ID and error hides ownership', async () => {
  const { createStudentDeliveryReadService } = await loadService()
  const h = makeHarness()
  await h.store.putPieceAssignment(
    createPieceAssignment({
      pieceAssignmentId: 'piece-student-b',
      pieceId: 'work-b',
      arrangementId: 'arr-b',
      studentId: 'student-b',
      title: 'Cambaz',
      teacherNote: '',
      assignedAt: '2026-09-24T08:10:00Z',
      contentRefs: {
        scoreAssignmentId: 'assignment-b',
        chordAssignmentIds: [],
      },
    }),
  )

  const service = createStudentDeliveryReadService(h)
  await assert.rejects(
    () => service.getPiece({
      providerSubject: 'uid-student-a',
      pieceAssignmentId: 'piece-student-b',
    }),
    (error) => {
      assert.match(error.message, /not-found|forbidden/i)
      assert.doesNotMatch(error.message, /student-b|piece-student-b/i)
      return true
    },
  )
})

test('revoked Piece is absent from student list and cannot reopen by exact ID', async () => {
  const { createStudentDeliveryReadService } = await loadService()
  const h = makeHarness()
  const piece = createPieceAssignment({
    pieceAssignmentId: 'piece-revoked-a',
    pieceId: 'work-revoked-a',
    arrangementId: 'arr-revoked-a',
    studentId: 'student-a',
    title: 'Fikrimin İnce Gülü',
    teacherNote: '',
    assignedAt: '2026-09-24T08:10:00Z',
    contentRefs: {
      scoreAssignmentId: 'assignment-a',
      chordAssignmentIds: [],
    },
  })
  await h.store.putPieceAssignment(piece)
  const active = createInitialPieceLifecycleRecord(piece)
  const revoked = revokePieceLifecycleRecord(
    active,
    '2026-09-24T08:30:00Z',
  )
  await h.store.commitPieceLifecycleMutation({
    currentLifecycle: active,
    nextLifecycle: revoked,
  })

  const service = createStudentDeliveryReadService(h)
  assert.deepEqual(
    await service.listPieces({
      providerSubject: 'uid-student-a',
    }),
    Object.freeze([]),
  )
  await assert.rejects(
    () => service.getPiece({
      providerSubject: 'uid-student-a',
      pieceAssignmentId: piece.pieceAssignmentId,
    }),
    /not-found|forbidden/i,
  )
})
