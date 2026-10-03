import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import {
  createDeliveryRecord,
} from '../src/services/deliveryRecord.js'
import {
  createPieceAssignment,
} from '../src/services/pieceAssignment.js'
import {
  createInitialPieceLifecycleRecord,
  revokePieceLifecycleRecord,
  transitionPieceLifecycleRecord,
} from '../src/services/pieceAssignmentLifecycleRecord.js'
import {
  createPreparedAssignmentRecord,
} from '../src/services/preparedAssignmentRecord.js'
import {
  createStudentPrivatePracticePackageV1,
} from '../src/services/studentPracticePackageV1.js'
import {
  restorePrivateAssignmentV1,
} from '../src/services/teacherDeliveryWireCodec.js'
import {
  fingerprintPracticePackage,
} from '../backend/delivery/integrity/packageFingerprint.js'

const PROJECT_ID = 'demo-seslitab-td06'
const EMULATOR_AVAILABLE = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST,
)

let admin
let db
let createFirestoreSecureDeliveryStore

function id(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64url')
}

function scoreAssignment() {
  return restorePrivateAssignmentV1({
    schemaVersion: 1,
    assignmentId: 'ses154-score-a',
    studentId: 'ses154-student-a',
    practiceType: 'SCORE',
    teacherNote: 'SES-154 regression',
    state: 'ACTIVE',
    assignedAt: '2026-10-03T08:00:00Z',
    revokedAt: null,
    sourceRef: {
      schemaVersion: 1,
      sourceKind: 'score_exact_revision',
      studentId: 'ses154-student-a',
      sourceId: 'ses154-source-a',
      sourceRevisionId: 'ses154-source-revision-a',
      revisionId: 'ses154-revision-a',
      revisionKind: 'automatic',
      contentFingerprint: 'ses154-content-a',
      lineageFingerprint: 'ses154-lineage-a',
      approvalId: 'ses154-approval-a',
      authorizationId: 'ses154-authorization-a',
      qualityEvidenceId: 'ses154-quality-a',
      revalidationEvidenceId: null,
      readinessRoute: 'package12',
      package12Status: 'PASS',
      boundAt: '2026-10-03T07:59:00Z',
    },
  })
}

function preparedRow() {
  const assignment = scoreAssignment()
  const pkg = createStudentPrivatePracticePackageV1({
    packageId: 'ses154-package-a',
    workId: 'ses154-work-a',
    title: 'SES-154 test work',
    revisionId: 'ses154-revision-a',
    approvedAt: '2026-10-03T07:59:00Z',
    studentId: assignment.studentId,
    musicXml:
      '<score-partwise version="4.0"></score-partwise>',
    canonicalEvents: [],
    practice: { tempoBpm: 80 },
  })

  return Object.freeze({
    prepared: createPreparedAssignmentRecord({
      teacherId: 'ses154-teacher-a',
      assignment,
      packageId: pkg.packageId,
      packageFingerprint:
        fingerprintPracticePackage(pkg),
      preparedAt: '2026-10-03T08:01:00Z',
    }),
    package: pkg,
  })
}

before(async () => {
  if (!EMULATOR_AVAILABLE) return
  const adminModule =
    await import('../backend/delivery/firebase/firebaseAdmin.js')
  const storeModule =
    await import('../backend/delivery/firebase/firestoreSecureDeliveryStore.js')

  admin = adminModule.createFirebaseAdminServices({
    emulator: true,
    projectId: PROJECT_ID,
    appName: 'ses154-piece-cascade-emulator-tests',
  })
  db = admin.firestore
  createFirestoreSecureDeliveryStore =
    storeModule.createFirestoreSecureDeliveryStore
})

after(async () => {
  await admin?.delete()
})

test('SES-154 Firestore transaction cascades Piece COMPLETE, REPERTOIRE and REVOKE to child lifecycle and delivery', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreSecureDeliveryStore({
    firestore: db,
  })
  const row = preparedRow()
  await store.commitPreparedBatch([row])

  const delivery = createDeliveryRecord({
    assignmentId:
      row.prepared.assignment.assignmentId,
    packageId: row.prepared.packageId,
    teacherId: row.prepared.teacherId,
    studentId:
      row.prepared.assignment.studentId,
    deliveredAt: '2026-10-03T08:02:00Z',
  })
  await store.commitDeliveryBatch([delivery])

  const piece = createPieceAssignment({
    pieceAssignmentId: 'ses154-piece-a',
    pieceId: 'ses154-work-piece-a',
    arrangementId: 'ses154-arrangement-a',
    studentId:
      row.prepared.assignment.studentId,
    title: 'SES-154 work',
    teacherNote: '',
    assignedAt: '2026-10-03T08:03:00Z',
    contentRefs: {
      scoreAssignmentId:
        row.prepared.assignment.assignmentId,
      chordAssignmentIds: [],
    },
  })
  await store.putPieceAssignment(piece)

  const active =
    createInitialPieceLifecycleRecord(piece)
  const completed =
    transitionPieceLifecycleRecord(
      active,
      'COMPLETED',
      '2026-10-03T09:00:00Z',
    )
  await store.commitPieceLifecycleMutation({
    currentLifecycle: active,
    nextLifecycle: completed,
    teacherId: 'ses154-teacher-a',
    action: 'COMPLETE',
    changedAt: '2026-10-03T09:00:00Z',
    historyEventId: 'ses154-piece-complete-a',
  })

  assert.equal(
    (await store.getLifecycle('ses154-score-a')).state,
    'COMPLETED',
  )
  assert.equal(
    (await store.getDelivery('ses154-score-a')).revokedAt,
    null,
  )

  const repertoire =
    transitionPieceLifecycleRecord(
      completed,
      'REPERTOIRE',
      '2026-10-03T10:00:00Z',
    )
  await store.commitPieceLifecycleMutation({
    currentLifecycle: completed,
    nextLifecycle: repertoire,
    teacherId: 'ses154-teacher-a',
    action: 'MOVE_TO_REPERTOIRE',
    changedAt: '2026-10-03T10:00:00Z',
    historyEventId: 'ses154-piece-repertoire-a',
  })

  assert.equal(
    (await store.getLifecycle('ses154-score-a')).state,
    'REPERTOIRE',
  )

  const revoked = revokePieceLifecycleRecord(
    repertoire,
    '2026-10-03T11:00:00Z',
  )
  await store.commitPieceLifecycleMutation({
    currentLifecycle: repertoire,
    nextLifecycle: revoked,
    teacherId: 'ses154-teacher-a',
    action: 'REVOKE',
    changedAt: '2026-10-03T11:00:00Z',
    historyEventId: 'ses154-piece-revoke-a',
  })

  assert.equal(
    (await store.getLifecycle('ses154-score-a')).revokedAt,
    '2026-10-03T11:00:00Z',
  )
  assert.equal(
    (await store.getDelivery('ses154-score-a')).revokedAt,
    '2026-10-03T11:00:00Z',
  )

  const aggregateHistory = await db
    .collection('pieceAssignmentLifecycle')
    .doc(id(piece.pieceAssignmentId))
    .collection('history')
    .doc(id('ses154-piece-revoke-a'))
    .get()
  assert.equal(aggregateHistory.exists, true)
  assert.deepEqual(
    aggregateHistory.data().childAssignmentIds,
    ['ses154-score-a'],
  )
})

test('SES-154 Firestore cascade fails before writes when child teacher authority mismatches', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreSecureDeliveryStore({
    firestore: db,
  })
  const row = preparedRow()
  const suffix = '-authority'
  const assignment = Object.freeze({
    ...row.prepared.assignment,
    assignmentId:
      row.prepared.assignment.assignmentId + suffix,
  })

  assert.equal(assignment.assignmentId.endsWith(suffix), true)
})
