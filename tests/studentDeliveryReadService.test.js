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

function makeHarness() {
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
    deliveries: [deliveryA, deliveryB],
  })
  return {
    store,
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
  assert.equal(rows[0].packageId, 'package-a')
  assert.equal(rows[0].package.publication.recipientStudentId, 'student-a')
  assert.equal(rows[0].teacherNote, 'Ölçü 8 tekrar')
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
