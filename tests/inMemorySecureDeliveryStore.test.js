import assert from 'node:assert/strict'
import test from 'node:test'

import {
  restorePrivateAssignmentV1,
} from '../src/services/teacherDeliveryWireCodec.js'
import {
  createStudentPrivatePracticePackageV1,
} from '../src/services/studentPracticePackageV1.js'
import {
  fingerprintPracticePackage,
} from '../backend/delivery/integrity/packageFingerprint.js'
import {
  createPreparedAssignmentRecord,
} from '../src/services/preparedAssignmentRecord.js'
import {
  createDeliveryRecord,
} from '../src/services/deliveryRecord.js'
import {
  createSecureDeliveryIdentityMapping,
} from '../src/services/secureDeliveryIdentity.js'
import {
  createTeacherStudentGrant,
} from '../src/services/teacherStudentGrant.js'
import {
  createPieceAssignment,
} from '../src/services/pieceAssignment.js'
import {
  createInitialPieceLifecycleRecord,
  transitionPieceLifecycleRecord,
} from '../src/services/pieceAssignmentLifecycleRecord.js'

async function loadStore() {
  try {
    return await import('../backend/delivery/repositories/inMemorySecureDeliveryStore.js')
  } catch {
    assert.fail('inMemorySecureDeliveryStore module must exist')
  }
}

function rawAssignment(id = 'assignment-a', studentId = 'student-a', revisionId = 'revision-a') {
  return {
    schemaVersion: 1,
    assignmentId: id,
    studentId,
    practiceType: 'SCORE',
    teacherNote: 'Tekrar',
    state: 'ACTIVE',
    assignedAt: '2026-09-23T08:01:00Z',
    revokedAt: null,
    sourceRef: {
      schemaVersion: 1,
      sourceKind: 'score_exact_revision',
      studentId,
      sourceId: 'source-a',
      sourceRevisionId: 'source-revision-a',
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
  }
}

function packageFor({
  packageId = 'package-a',
  studentId = 'student-a',
  revisionId = 'revision-a',
  suffix = '',
} = {}) {
  return createStudentPrivatePracticePackageV1({
    packageId,
    workId: 'work-a',
    title: 'Etüt',
    revisionId,
    approvedAt: '2026-09-23T08:00:00Z',
    studentId,
    musicXml: '<score-partwise version="4.0">' + suffix + '</score-partwise>',
    canonicalEvents: [],
    practice: { tempoBpm: 80 },
  })
}

function prepared({
  assignmentId = 'assignment-a',
  studentId = 'student-a',
  revisionId = 'revision-a',
  packageId = 'package-a',
  suffix = '',
} = {}) {
  const assignment = restorePrivateAssignmentV1(
    rawAssignment(assignmentId, studentId, revisionId),
  )
  const pkg = packageFor({ packageId, studentId, revisionId, suffix })
  return {
    prepared: createPreparedAssignmentRecord({
      teacherId: 'teacher-a',
      assignment,
      packageId,
      packageFingerprint: fingerprintPracticePackage(pkg),
      preparedAt: '2026-09-23T08:02:00Z',
    }),
    package: pkg,
  }
}

test('in-memory secure store seeds identity/grant authority and returns exact records', async () => {
  const { createInMemorySecureDeliveryStore } = await loadStore()
  const mapping = createSecureDeliveryIdentityMapping({
    providerSubject: 'uid-teacher',
    role: 'TEACHER',
    teacherId: 'teacher-a',
    studentId: null,
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    disabledAt: null,
  })
  const grant = createTeacherStudentGrant({
    teacherId: 'teacher-a',
    studentId: 'student-a',
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    revokedAt: null,
  })
  const store = createInMemorySecureDeliveryStore({
    identityMappings: [mapping],
    grants: [grant],
  })

  assert.equal(await store.getIdentityMapping('uid-teacher'), mapping)
  assert.equal(
    await store.getTeacherStudentGrant('teacher-a', 'student-a'),
    grant,
  )
})

test('commitPreparedBatch is all-or-nothing when one assignment conflicts', async () => {
  const { createInMemorySecureDeliveryStore } = await loadStore()
  const store = createInMemorySecureDeliveryStore()
  const first = prepared()
  const conflict = prepared({
    assignmentId: 'assignment-a',
    packageId: 'package-b',
    suffix: '<different/>',
  })

  await assert.rejects(
    () => store.commitPreparedBatch([first, conflict]),
    /conflict|duplicate/i,
  )

  assert.equal(await store.getPreparedAssignment('assignment-a'), null)
  assert.equal(await store.getPracticePackage('package-a'), null)
  assert.equal(await store.getPracticePackage('package-b'), null)
})

test('exact prepared replay is idempotent while conflicting package fingerprint fails closed', async () => {
  const { createInMemorySecureDeliveryStore } = await loadStore()
  const store = createInMemorySecureDeliveryStore()
  const row = prepared()

  const first = await store.commitPreparedBatch([row])
  const second = await store.commitPreparedBatch([row])
  assert.equal(second[0], first[0])
  assert.equal(
    await store.getPreparedAssignment('assignment-a'),
    first[0],
  )
  assert.equal(
    await store.getPracticePackage('package-a'),
    row.package,
  )

  const conflict = prepared({
    assignmentId: 'assignment-a',
    packageId: 'package-a',
    suffix: '<changed/>',
  })
  await assert.rejects(
    () => store.commitPreparedBatch([conflict]),
    /conflict|fingerprint/i,
  )
  assert.equal(
    await store.getPreparedAssignment('assignment-a'),
    first[0],
  )
})

test('delivery batch is atomic and active student/teacher lists are scoped', async () => {
  const { createInMemorySecureDeliveryStore } = await loadStore()
  const store = createInMemorySecureDeliveryStore()
  const a = createDeliveryRecord({
    assignmentId: 'assignment-a',
    packageId: 'package-a',
    teacherId: 'teacher-a',
    studentId: 'student-a',
    deliveredAt: '2026-09-23T08:03:00Z',
  })
  const b = createDeliveryRecord({
    assignmentId: 'assignment-b',
    packageId: 'package-b',
    teacherId: 'teacher-a',
    studentId: 'student-b',
    deliveredAt: '2026-09-23T08:03:00Z',
  })

  const committed = await store.commitDeliveryBatch([a, b])
  assert.deepEqual(committed, Object.freeze([a, b]))
  assert.deepEqual(
    await store.listDeliveriesForTeacher('teacher-a'),
    Object.freeze([a, b]),
  )
  assert.deepEqual(
    await store.listActiveDeliveriesForStudent('student-a'),
    Object.freeze([a]),
  )

  const conflicting = Object.freeze({
    ...b,
    packageId: 'package-other',
  })
  await assert.rejects(
    () => store.commitDeliveryBatch([conflicting]),
    /invalid|conflict/i,
  )
  assert.equal(await store.getDelivery('assignment-b'), b)
})


test('Piece authority persists by exact identity and remains student-scoped', async () => {
  const { createInMemorySecureDeliveryStore } = await loadStore()
  const store = createInMemorySecureDeliveryStore()
  const piece = createPieceAssignment({
    pieceAssignmentId: 'piece-assignment-a',
    pieceId: 'piece-cambaz-a',
    arrangementId: 'arr-cambaz-a',
    studentId: 'student-a',
    title: 'Cambaz',
    teacherNote: '',
    assignedAt: '2026-09-24T08:00:00Z',
    contentRefs: {
      scoreAssignmentId: 'score-a',
      chordAssignmentIds: ['chord-a'],
    },
  })

  assert.equal(await store.putPieceAssignment(piece), piece)
  assert.equal(
    await store.getPieceAssignment('piece-assignment-a'),
    piece,
  )
  assert.deepEqual(
    await store.listPieceAssignmentsForStudent('student-a'),
    Object.freeze([piece]),
  )
  assert.deepEqual(
    await store.listPieceAssignmentsForStudent('student-b'),
    Object.freeze([]),
  )
  assert.equal(
    await store.getPieceLifecycle('piece-assignment-a'),
    null,
  )

  assert.equal(await store.putPieceAssignment(piece), piece)

  const conflict = createPieceAssignment({
    pieceAssignmentId: 'piece-assignment-a',
    pieceId: 'piece-cambaz-a',
    arrangementId: 'arr-cambaz-a',
    studentId: 'student-a',
    title: 'Cambaz - changed',
    teacherNote: '',
    assignedAt: '2026-09-24T08:00:00Z',
    contentRefs: {
      scoreAssignmentId: 'score-a',
      chordAssignmentIds: ['chord-a'],
    },
  })
  await assert.rejects(
    () => store.putPieceAssignment(conflict),
    /piece.*conflict|immutable/i,
  )
  assert.equal(
    (await store.getPieceAssignment('piece-assignment-a')).title,
    'Cambaz',
  )
})

test('Piece lifecycle persistence compares exact current authority before mutation', async () => {
  const { createInMemorySecureDeliveryStore } = await loadStore()
  const store = createInMemorySecureDeliveryStore()
  const piece = createPieceAssignment({
    pieceAssignmentId: 'piece-assignment-lifecycle',
    pieceId: 'piece-work-lifecycle',
    arrangementId: 'arr-lifecycle',
    studentId: 'student-a',
    title: 'Fikrimin İnce Gülü',
    teacherNote: 'Yavaş çalış.',
    assignedAt: '2026-09-24T08:00:00Z',
    contentRefs: {
      scoreAssignmentId: 'score-lifecycle',
      chordAssignmentIds: [],
    },
  })
  await store.putPieceAssignment(piece)

  const active = createInitialPieceLifecycleRecord(piece)
  const completed = transitionPieceLifecycleRecord(
    active,
    'COMPLETED',
    '2026-09-24T09:00:00Z',
  )

  const result = await store.commitPieceLifecycleMutation({
    currentLifecycle: active,
    nextLifecycle: completed,
  })

  assert.equal(result, completed)
  assert.deepEqual(
    await store.getPieceLifecycle(piece.pieceAssignmentId),
    completed,
  )

  await assert.rejects(
    () => store.commitPieceLifecycleMutation({
      currentLifecycle: active,
      nextLifecycle: completed,
    }),
    /current conflict/i,
  )
})
