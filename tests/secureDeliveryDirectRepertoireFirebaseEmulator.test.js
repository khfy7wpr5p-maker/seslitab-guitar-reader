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

function scoreAssignment() {
  return restorePrivateAssignmentV1({
    schemaVersion: 1,
    assignmentId: 'ses154-direct-emulator-score-a',
    studentId: 'ses154-direct-emulator-student-a',
    practiceType: 'SCORE',
    teacherNote: '',
    state: 'ACTIVE',
    assignedAt: '2026-10-03T08:00:00Z',
    revokedAt: null,
    sourceRef: {
      schemaVersion: 1,
      sourceKind: 'score_exact_revision',
      studentId: 'ses154-direct-emulator-student-a',
      sourceId: 'ses154-direct-emulator-source-a',
      sourceRevisionId:
        'ses154-direct-emulator-source-revision-a',
      revisionId:
        'ses154-direct-emulator-revision-a',
      revisionKind: 'automatic',
      contentFingerprint:
        'ses154-direct-emulator-content-a',
      lineageFingerprint:
        'ses154-direct-emulator-lineage-a',
      approvalId:
        'ses154-direct-emulator-approval-a',
      authorizationId:
        'ses154-direct-emulator-authorization-a',
      qualityEvidenceId:
        'ses154-direct-emulator-quality-a',
      revalidationEvidenceId: null,
      readinessRoute: 'package12',
      package12Status: 'PASS',
      boundAt: '2026-10-03T07:59:00Z',
    },
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
    appName:
      'ses154-direct-repertoire-emulator-tests',
  })
  db = admin.firestore
  createFirestoreSecureDeliveryStore =
    storeModule.createFirestoreSecureDeliveryStore
})

after(async () => {
  await admin?.delete()
})

test('SES-154 Firestore transaction commits ACTIVE Piece and child directly as REPERTOIRE with no intermediate persisted state', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreSecureDeliveryStore({
    firestore: db,
  })
  const assignment = scoreAssignment()
  const pkg = createStudentPrivatePracticePackageV1({
    packageId:
      'ses154-direct-emulator-package-a',
    workId: 'ses154-direct-emulator-work-a',
    title: 'Direct repertoire emulator work',
    revisionId:
      'ses154-direct-emulator-revision-a',
    approvedAt: '2026-10-03T07:59:00Z',
    studentId: assignment.studentId,
    musicXml:
      '<score-partwise version="4.0"></score-partwise>',
    canonicalEvents: [],
    practice: { tempoBpm: 80 },
  })
  const prepared = createPreparedAssignmentRecord({
    teacherId:
      'ses154-direct-emulator-teacher-a',
    assignment,
    packageId: pkg.packageId,
    packageFingerprint:
      fingerprintPracticePackage(pkg),
    preparedAt: '2026-10-03T08:01:00Z',
  })
  await store.commitPreparedBatch([
    Object.freeze({ prepared, package: pkg }),
  ])
  await store.commitDeliveryBatch([
    createDeliveryRecord({
      assignmentId: assignment.assignmentId,
      packageId: prepared.packageId,
      teacherId: prepared.teacherId,
      studentId: assignment.studentId,
      deliveredAt: '2026-10-03T08:02:00Z',
    }),
  ])

  const piece = createPieceAssignment({
    pieceAssignmentId:
      'ses154-direct-emulator-piece-a',
    pieceId:
      'ses154-direct-emulator-piece-work-a',
    arrangementId:
      'ses154-direct-emulator-arrangement-a',
    studentId: assignment.studentId,
    title: 'Direct repertoire emulator work',
    teacherNote: '',
    assignedAt: '2026-10-03T08:03:00Z',
    contentRefs: {
      scoreAssignmentId: assignment.assignmentId,
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
  const repertoire =
    transitionPieceLifecycleRecord(
      completed,
      'REPERTOIRE',
      '2026-10-03T09:00:00Z',
    )

  await store.commitPieceLifecycleMutation({
    currentLifecycle: active,
    nextLifecycle: repertoire,
    teacherId:
      'ses154-direct-emulator-teacher-a',
    action: 'MOVE_TO_REPERTOIRE',
    changedAt: '2026-10-03T09:00:00Z',
    historyEventId:
      'ses154-direct-emulator-repertoire-a',
  })

  const storedPiece =
    await store.getPieceLifecycle(
      piece.pieceAssignmentId,
    )
  const storedChild =
    await store.getLifecycle(
      assignment.assignmentId,
    )

  assert.equal(storedPiece.state, 'REPERTOIRE')
  assert.equal(
    storedPiece.stateChangedAt,
    '2026-10-03T09:00:00Z',
  )
  assert.equal(storedChild.state, 'REPERTOIRE')
  assert.equal(
    storedChild.stateChangedAt,
    '2026-10-03T09:00:00Z',
  )
  assert.equal(
    (await store.getDelivery(
      assignment.assignmentId,
    )).revokedAt,
    null,
  )
})
