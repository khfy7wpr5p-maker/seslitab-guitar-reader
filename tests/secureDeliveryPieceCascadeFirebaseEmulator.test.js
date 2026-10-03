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

function scoreAssignment(suffix) {
  return restorePrivateAssignmentV1({
    schemaVersion: 1,
    assignmentId: `ses154-score-${suffix}`,
    studentId: `ses154-student-${suffix}`,
    practiceType: 'SCORE',
    teacherNote: 'SES-154 regression',
    state: 'ACTIVE',
    assignedAt: '2026-10-03T08:00:00Z',
    revokedAt: null,
    sourceRef: {
      schemaVersion: 1,
      sourceKind: 'score_exact_revision',
      studentId: `ses154-student-${suffix}`,
      sourceId: `ses154-source-${suffix}`,
      sourceRevisionId:
        `ses154-source-revision-${suffix}`,
      revisionId: `ses154-revision-${suffix}`,
      revisionKind: 'automatic',
      contentFingerprint:
        `ses154-content-${suffix}`,
      lineageFingerprint:
        `ses154-lineage-${suffix}`,
      approvalId: `ses154-approval-${suffix}`,
      authorizationId:
        `ses154-authorization-${suffix}`,
      qualityEvidenceId:
        `ses154-quality-${suffix}`,
      revalidationEvidenceId: null,
      readinessRoute: 'package12',
      package12Status: 'PASS',
      boundAt: '2026-10-03T07:59:00Z',
    },
  })
}

function preparedRow(suffix) {
  const assignment = scoreAssignment(suffix)
  const pkg = createStudentPrivatePracticePackageV1({
    packageId: `ses154-package-${suffix}`,
    workId: `ses154-work-${suffix}`,
    title: 'SES-154 test work',
    revisionId: `ses154-revision-${suffix}`,
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

function deliveryFor(row) {
  return createDeliveryRecord({
    assignmentId:
      row.prepared.assignment.assignmentId,
    packageId: row.prepared.packageId,
    teacherId: row.prepared.teacherId,
    studentId:
      row.prepared.assignment.studentId,
    deliveredAt: '2026-10-03T08:02:00Z',
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
  const row = preparedRow('happy')
  await store.commitPreparedBatch([row])
  await store.commitDeliveryBatch([
    deliveryFor(row),
  ])

  const piece = createPieceAssignment({
    pieceAssignmentId: 'ses154-piece-happy',
    pieceId: 'ses154-work-piece-happy',
    arrangementId: 'ses154-arrangement-happy',
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
    historyEventId: 'ses154-piece-complete-happy',
  })

  const childId =
    row.prepared.assignment.assignmentId
  assert.equal(
    (await store.getLifecycle(childId)).state,
    'COMPLETED',
  )
  assert.equal(
    (await store.getDelivery(childId)).revokedAt,
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
    historyEventId:
      'ses154-piece-repertoire-happy',
  })

  assert.equal(
    (await store.getLifecycle(childId)).state,
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
    historyEventId: 'ses154-piece-revoke-happy',
  })

  assert.equal(
    (await store.getLifecycle(childId)).revokedAt,
    '2026-10-03T11:00:00Z',
  )
  assert.equal(
    (await store.getDelivery(childId)).revokedAt,
    '2026-10-03T11:00:00Z',
  )

  const aggregateHistory = await db
    .collection('pieceAssignmentLifecycle')
    .doc(id(piece.pieceAssignmentId))
    .collection('history')
    .doc(id('ses154-piece-revoke-happy'))
    .get()
  assert.equal(aggregateHistory.exists, true)
  assert.deepEqual(
    aggregateHistory.data().childAssignmentIds,
    [childId],
  )
})

test('SES-154 Firestore transaction leaves parent and valid child unchanged when another Piece child has no authority', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreSecureDeliveryStore({
    firestore: db,
  })
  const row = preparedRow('atomic')
  await store.commitPreparedBatch([row])
  await store.commitDeliveryBatch([
    deliveryFor(row),
  ])

  const piece = createPieceAssignment({
    pieceAssignmentId: 'ses154-piece-atomic',
    pieceId: 'ses154-work-piece-atomic',
    arrangementId: 'ses154-arrangement-atomic',
    studentId:
      row.prepared.assignment.studentId,
    title: 'SES-154 atomic failure work',
    teacherNote: '',
    assignedAt: '2026-10-03T08:03:00Z',
    contentRefs: {
      scoreAssignmentId:
        row.prepared.assignment.assignmentId,
      chordAssignmentIds: [
        'ses154-missing-chord-atomic',
      ],
    },
  })
  await store.putPieceAssignment(piece)

  const active =
    createInitialPieceLifecycleRecord(piece)
  const completed =
    transitionPieceLifecycleRecord(
      active,
      'COMPLETED',
      '2026-10-03T09:30:00Z',
    )

  await assert.rejects(
    () => store.commitPieceLifecycleMutation({
      currentLifecycle: active,
      nextLifecycle: completed,
      teacherId: 'ses154-teacher-a',
      action: 'COMPLETE',
      changedAt: '2026-10-03T09:30:00Z',
      historyEventId:
        'ses154-piece-complete-atomic',
    }),
    /piece-child-authority-mismatch/i,
  )

  const childId =
    row.prepared.assignment.assignmentId
  assert.equal(
    await store.getPieceLifecycle(
      piece.pieceAssignmentId,
    ),
    null,
  )
  assert.equal(
    await store.getLifecycle(childId),
    null,
  )
  assert.equal(
    (await store.getDelivery(childId)).revokedAt,
    null,
  )

  const aggregateHistory = await db
    .collection('pieceAssignmentLifecycle')
    .doc(id(piece.pieceAssignmentId))
    .collection('history')
    .doc(id('ses154-piece-complete-atomic'))
    .get()
  assert.equal(aggregateHistory.exists, false)
})
