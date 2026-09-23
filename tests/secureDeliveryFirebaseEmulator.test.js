import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import {
  createInitialAssignmentLifecycleRecord,
  revokeAssignmentLifecycleRecord,
  transitionAssignmentLifecycleRecord,
} from '../src/services/assignmentLifecycleRecord.js'
import {
  createDeliveryRecord,
  revokeDeliveryRecord,
} from '../src/services/deliveryRecord.js'
import {
  createPoolItem,
  POOL_AUDIENCE_MODE,
} from '../src/services/poolItem.js'
import {
  createActivePoolPublicationRecord,
} from '../src/services/poolPublicationRecord.js'
import {
  createPreparedAssignmentRecord,
} from '../src/services/preparedAssignmentRecord.js'
import {
  createSecureDeliveryIdentityMapping,
} from '../src/services/secureDeliveryIdentity.js'
import {
  createStudentPrivatePracticePackageV1,
} from '../src/services/studentPracticePackageV1.js'
import {
  createStudentRosterEntry,
} from '../src/services/studentRosterEntry.js'
import {
  createTeacherStudentGrant,
} from '../src/services/teacherStudentGrant.js'
import {
  restorePrivateAssignmentV1,
} from '../src/services/teacherDeliveryWireCodec.js'
import {
  fingerprintPracticePackage,
} from '../backend/delivery/integrity/packageFingerprint.js'

const PROJECT_ID = 'demo-seslitab-td06'
let admin
let db
let createFirestoreSecureDeliveryStore
let createFirebaseTokenVerifier

function id(value) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function assignment(assignmentId, studentId, revisionId) {
  return restorePrivateAssignmentV1({
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
      revalidationEvidenceId: null,
      readinessRoute: 'package12',
      package12Status: 'PASS',
      boundAt: '2026-09-23T08:00:00Z',
    },
  })
}

function packageFor(packageId, studentId, revisionId) {
  return createStudentPrivatePracticePackageV1({
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
}

function preparedRow(suffix, overrides = {}) {
  const assignmentId = overrides.assignmentId ?? 'assignment-' + suffix
  const studentId = overrides.studentId ?? 'student-' + suffix
  const revisionId = overrides.revisionId ?? 'revision-' + suffix
  const packageId = overrides.packageId ?? 'package-' + suffix
  const a = assignment(assignmentId, studentId, revisionId)
  const pkg = packageFor(packageId, studentId, revisionId)
  return Object.freeze({
    prepared: createPreparedAssignmentRecord({
      teacherId: overrides.teacherId ?? 'teacher-a',
      assignment: a,
      packageId,
      packageFingerprint: fingerprintPracticePackage(pkg),
      preparedAt: '2026-09-23T08:02:00Z',
    }),
    package: pkg,
  })
}

async function seedIdentityAndGrant(studentId = 'student-a') {
  const teacher = createSecureDeliveryIdentityMapping({
    providerSubject: 'uid-teacher',
    role: 'TEACHER',
    teacherId: 'teacher-a',
    studentId: null,
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    disabledAt: null,
  })
  const student = createSecureDeliveryIdentityMapping({
    providerSubject: 'uid-' + studentId,
    role: 'STUDENT',
    teacherId: null,
    studentId,
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    disabledAt: null,
  })
  const grant = createTeacherStudentGrant({
    teacherId: 'teacher-a',
    studentId,
    active: true,
    createdAt: '2026-09-23T08:00:00Z',
    revokedAt: null,
  })
  await Promise.all([
    db.collection('identityMappings').doc(id(teacher.providerSubject)).set(plain(teacher)),
    db.collection('identityMappings').doc(id(student.providerSubject)).set(plain(student)),
    db.collection('teacherStudentGrants').doc(id(JSON.stringify(['teacher-a', studentId]))).set(plain(grant)),
  ])
}

before(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
  const adminModule = await import('../backend/delivery/firebase/firebaseAdmin.js')
  const tokenModule = await import('../backend/delivery/firebase/firebaseTokenVerifier.js')
  const storeModule = await import('../backend/delivery/firebase/firestoreSecureDeliveryStore.js')
  admin = adminModule.createFirebaseAdminServices({
    emulator: true,
    projectId: PROJECT_ID,
    appName: 'td06-emulator-tests',
  })
  db = admin.firestore
  createFirebaseTokenVerifier = tokenModule.createFirebaseTokenVerifier
  createFirestoreSecureDeliveryStore = storeModule.createFirestoreSecureDeliveryStore
})

after(async () => {
  await admin?.delete()
})

test('Firebase token verifier passes raw token only to verifyIdToken(token, true) and returns uid only', async () => {
  const calls = []
  const verifier = createFirebaseTokenVerifier({
    auth: {
      async verifyIdToken(token, checkRevoked) {
        calls.push([token, checkRevoked])
        return {
          uid: 'uid-teacher',
          email: 'private@example.invalid',
          role: 'ignored',
        }
      },
    },
  })

  assert.deepEqual(
    await verifier.verifyIdToken('raw-secret-token'),
    Object.freeze({ uid: 'uid-teacher' }),
  )
  assert.deepEqual(calls, [['raw-secret-token', true]])
  assert.equal('token' in verifier, false)
})

test('Firestore prepared batch is atomic, exact-replay idempotent and rereads exact links', async () => {
  const store = createFirestoreSecureDeliveryStore({ firestore: db })
  const a = preparedRow('prep-a')
  const b = preparedRow('prep-b')

  const first = await store.commitPreparedBatch([a, b])
  assert.equal(first.length, 2)
  assert.equal((await store.getPreparedAssignment(a.prepared.assignment.assignmentId)).packageId, a.prepared.packageId)
  assert.equal((await store.getPracticePackage(a.package.packageId)).approvedRevision.revisionId, a.package.approvedRevision.revisionId)

  const replay = await store.commitPreparedBatch([a, b])
  assert.equal(replay[0].preparedAt, first[0].preparedAt)
  assert.equal(replay[1].packageFingerprint, first[1].packageFingerprint)
})

test('one prepared conflict rejects the whole transaction with zero new documents', async () => {
  const store = createFirestoreSecureDeliveryStore({ firestore: db })
  const existing = preparedRow('conflict-existing', { packageId: 'package-conflict-shared' })
  await store.commitPreparedBatch([existing])

  const pending = preparedRow('conflict-pending')
  const conflicting = preparedRow('conflict-new', { packageId: 'package-conflict-shared' })

  await assert.rejects(
    () => store.commitPreparedBatch([pending, conflicting]),
    /conflict/i,
  )
  assert.equal(
    await store.getPreparedAssignment(pending.prepared.assignment.assignmentId),
    null,
  )
})

test('delivery transaction is atomic and exact active replay is idempotent', async () => {
  const store = createFirestoreSecureDeliveryStore({ firestore: db })
  const a = preparedRow('delivery-a')
  const b = preparedRow('delivery-b')
  await store.commitPreparedBatch([a, b])

  const deliveryA = createDeliveryRecord({
    assignmentId: a.prepared.assignment.assignmentId,
    packageId: a.prepared.packageId,
    teacherId: a.prepared.teacherId,
    studentId: a.prepared.assignment.studentId,
    deliveredAt: '2026-09-23T08:03:00Z',
  })
  const deliveryB = createDeliveryRecord({
    assignmentId: b.prepared.assignment.assignmentId,
    packageId: b.prepared.packageId,
    teacherId: b.prepared.teacherId,
    studentId: b.prepared.assignment.studentId,
    deliveredAt: '2026-09-23T08:03:00Z',
  })

  const first = await store.commitDeliveryBatch([deliveryA, deliveryB])
  const replay = await store.commitDeliveryBatch([deliveryA, deliveryB])
  assert.deepEqual(replay, first)
  assert.deepEqual(await store.getDelivery(deliveryA.assignmentId), deliveryA)
})

test('one missing prepared delivery row rejects whole batch without silent partial success', async () => {
  const store = createFirestoreSecureDeliveryStore({ firestore: db })
  const valid = preparedRow('delivery-atomic-valid')
  await store.commitPreparedBatch([valid])
  const validDelivery = createDeliveryRecord({
    assignmentId: valid.prepared.assignment.assignmentId,
    packageId: valid.prepared.packageId,
    teacherId: valid.prepared.teacherId,
    studentId: valid.prepared.assignment.studentId,
    deliveredAt: '2026-09-23T08:04:00Z',
  })
  const missingDelivery = createDeliveryRecord({
    assignmentId: 'assignment-not-prepared',
    packageId: 'package-not-prepared',
    teacherId: 'teacher-a',
    studentId: 'student-missing',
    deliveredAt: '2026-09-23T08:04:00Z',
  })

  await assert.rejects(
    () => store.commitDeliveryBatch([validDelivery, missingDelivery]),
    /prepared|missing/i,
  )
  assert.equal(await store.getDelivery(validDelivery.assignmentId), null)
})

test('revoked lifecycle blocks a new delivery transaction', async () => {
  const store = createFirestoreSecureDeliveryStore({ firestore: db })
  const row = preparedRow('delivery-revoked')
  await store.commitPreparedBatch([row])
  const initial = createInitialAssignmentLifecycleRecord(row.prepared.assignment)
  const revoked = revokeAssignmentLifecycleRecord(initial, '2026-09-23T08:05:00Z')
  await store.commitLifecycleMutation({
    teacherId: row.prepared.teacherId,
    assignment: row.prepared.assignment,
    currentLifecycle: initial,
    nextLifecycle: revoked,
    deliveryBefore: null,
    deliveryAfter: null,
    historyEventId: 'history-delivery-revoked',
  })

  await assert.rejects(
    () => store.commitDeliveryBatch([
      createDeliveryRecord({
        assignmentId: row.prepared.assignment.assignmentId,
        packageId: row.prepared.packageId,
        teacherId: row.prepared.teacherId,
        studentId: row.prepared.assignment.studentId,
        deliveredAt: '2026-09-23T08:06:00Z',
      }),
    ]),
    /revoked/i,
  )
})

test('lifecycle mutation persists current state, append-only history and delivery revoke atomically', async () => {
  const store = createFirestoreSecureDeliveryStore({ firestore: db })
  const row = preparedRow('lifecycle-a')
  await store.commitPreparedBatch([row])
  const delivery = createDeliveryRecord({
    assignmentId: row.prepared.assignment.assignmentId,
    packageId: row.prepared.packageId,
    teacherId: row.prepared.teacherId,
    studentId: row.prepared.assignment.studentId,
    deliveredAt: '2026-09-23T08:03:00Z',
  })
  await store.commitDeliveryBatch([delivery])

  const initial = createInitialAssignmentLifecycleRecord(row.prepared.assignment)
  const completed = transitionAssignmentLifecycleRecord(initial, 'COMPLETED', '2026-09-23T08:07:00Z')
  await store.commitLifecycleMutation({
    teacherId: row.prepared.teacherId,
    assignment: row.prepared.assignment,
    currentLifecycle: initial,
    nextLifecycle: completed,
    deliveryBefore: delivery,
    deliveryAfter: delivery,
    historyEventId: 'history-complete-a',
  })

  const revoked = revokeAssignmentLifecycleRecord(completed, '2026-09-23T08:08:00Z')
  const revokedDelivery = revokeDeliveryRecord(delivery, '2026-09-23T08:08:00Z')
  await store.commitLifecycleMutation({
    teacherId: row.prepared.teacherId,
    assignment: row.prepared.assignment,
    currentLifecycle: completed,
    nextLifecycle: revoked,
    deliveryBefore: delivery,
    deliveryAfter: revokedDelivery,
    historyEventId: 'history-revoke-a',
  })

  assert.equal((await store.getLifecycle(delivery.assignmentId)).revokedAt, '2026-09-23T08:08:00Z')
  assert.equal((await store.getDelivery(delivery.assignmentId)).revokedAt, '2026-09-23T08:08:00Z')

  const historyRef = db
    .collection('assignmentLifecycle')
    .doc(id(delivery.assignmentId))
    .collection('history')
  assert.equal((await historyRef.get()).size, 2)

  await store.commitLifecycleMutation({
    teacherId: row.prepared.teacherId,
    assignment: row.prepared.assignment,
    currentLifecycle: revoked,
    nextLifecycle: revoked,
    deliveryBefore: revokedDelivery,
    deliveryAfter: revokedDelivery,
    historyEventId: 'history-revoke-should-not-append',
  })
  assert.equal((await historyRef.get()).size, 2)
  assert.equal((await store.getDelivery(delivery.assignmentId)).revokedAt, '2026-09-23T08:08:00Z')
})

test('identity/grant lookup and roster/Pool provisioning round-trip through Admin-only persistence', async () => {
  await seedIdentityAndGrant('student-provision')
  const store = createFirestoreSecureDeliveryStore({ firestore: db })

  assert.equal(
    (await store.getIdentityMapping('uid-teacher')).teacherId,
    'teacher-a',
  )
  assert.equal(
    (await store.getTeacherStudentGrant('teacher-a', 'student-provision')).active,
    true,
  )

  const roster = createStudentRosterEntry({
    studentId: 'student-provision',
    displayNameOrNickname: 'Öğrenci',
    active: true,
  })
  await store.putRosterEntriesForProvisioning([roster])
  assert.deepEqual(
    (await db.collection('studentRoster').doc(id(roster.studentId)).get()).data(),
    plain(roster),
  )

  const selectedItem = createPoolItem({
    poolItemId: 'pool-selected',
    title: 'Seçili Etüt',
    shortDescription: 'Çalışma',
    detailText: '',
    publishedAt: '2026-09-23T08:00:00Z',
    audienceMode: POOL_AUDIENCE_MODE.SELECTED,
    recipientStudentIds: ['student-provision', 'student-second', 'student-provision'],
  })
  const allItem = createPoolItem({
    poolItemId: 'pool-all',
    title: 'Genel Etüt',
    shortDescription: 'Çalışma',
    detailText: '',
    publishedAt: '2026-09-23T08:00:00Z',
    audienceMode: POOL_AUDIENCE_MODE.ALL,
    recipientStudentIds: [],
  })
  await store.putPoolPublicationsForProvisioning([
    createActivePoolPublicationRecord(selectedItem),
    createActivePoolPublicationRecord(allItem),
  ])

  const selectedRecipients = await db
    .collection('poolPublications')
    .doc(id('pool-selected'))
    .collection('recipients')
    .get()
  const allRecipients = await db
    .collection('poolPublications')
    .doc(id('pool-all'))
    .collection('recipients')
    .get()
  assert.equal(selectedRecipients.size, 2)
  assert.equal(allRecipients.size, 0)
})
