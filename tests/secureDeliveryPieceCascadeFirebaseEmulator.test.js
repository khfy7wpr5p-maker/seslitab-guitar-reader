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
import { backfillPieceEligibilityPage } from '../backend/delivery/firebase/pieceEligibilityBackfill.js'

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

test('SES-238 real Firestore backfill preserves immutable records, repairs eligibility and verifies every cursor page', { skip: !EMULATOR_AVAILABLE }, async () => {
  const { getFirestore } = await import('firebase-admin/firestore')
  const isolatedDb = getFirestore(admin.app, 'ses238-backfill-pages')
  const store = createFirestoreSecureDeliveryStore({
    firestore: isolatedDb,
    env: { STUDENT_PIECE_INDEXED_READS_ENABLED: 'true' },
  })
  const pieces = ['active', 'revoked'].map((suffix) => createPieceAssignment({
    pieceAssignmentId: `ses238-${suffix}`, pieceId: `work-${suffix}`,
    arrangementId: `arr-${suffix}`, studentId: 'ses238-student', title: 'Etüt',
    teacherNote: '', assignedAt: '2026-10-18T08:00:00Z',
    contentRefs: { scoreAssignmentId: `score-${suffix}`, chordAssignmentIds: [] },
  }))
  for (const piece of pieces) {
    await isolatedDb.collection('pieceAssignments').doc(id(piece.pieceAssignmentId)).set(JSON.parse(JSON.stringify(piece)))
  }
  const revoked = revokePieceLifecycleRecord(createInitialPieceLifecycleRecord(pieces[1]), '2026-10-18T09:00:00Z')
  await isolatedDb.collection('pieceAssignmentLifecycle').doc(id(pieces[1].pieceAssignmentId)).set(JSON.parse(JSON.stringify(revoked)))
  const dry = await backfillPieceEligibilityPage({ firestore: isolatedDb })
  assert.equal(dry.wouldUpdate, 2)
  assert.equal(dry.updated, 0)
  let after = null, updated = 0
  do {
    const page = await backfillPieceEligibilityPage({ firestore: isolatedDb, mode: 'apply', limit: 1, after, applyAuthorized: true })
    assert.deepEqual(page.errors, [])
    updated += page.updated
    after = page.nextCursor
  } while (after !== null)
  assert.equal(updated, 2)
  const verify = await backfillPieceEligibilityPage({ firestore: isolatedDb, mode: 'verify' })
  assert.equal(verify.wouldUpdate, 0)
  assert.equal(verify.unchanged, 2)
  assert.equal(verify.pageComplete, true)
  assert.equal(verify.eligible, 1)
  assert.equal(verify.revoked, 1)
  assert.deepEqual(await store.getPieceAssignment(pieces[0].pieceAssignmentId), pieces[0])
  assert.deepEqual(await store.getPieceAssignment(pieces[1].pieceAssignmentId), pieces[1])
  assert.deepEqual((await store.listActivePieceContextsForStudent('ses238-student')).map((row) => row.piece), [pieces[0]])
  assert.equal((await backfillPieceEligibilityPage({ firestore: isolatedDb, mode: 'apply', applyAuthorized: true })).updated, 0)
})

test('SES-238 real backfill transaction observes revoke committed after page discovery', { skip: !EMULATOR_AVAILABLE }, async () => {
  const { getFirestore } = await import('firebase-admin/firestore')
  const isolatedDb = getFirestore(admin.app, 'ses238-backfill-race')
  const piece = createPieceAssignment({
    pieceAssignmentId: 'ses238-race', pieceId: 'work-race', arrangementId: 'arr-race',
    studentId: 'ses238-race-student', title: 'Etüt', teacherNote: '', assignedAt: '2026-10-18T08:00:00Z',
    contentRefs: { scoreAssignmentId: 'score-race', chordAssignmentIds: [] },
  })
  const pieceRef = isolatedDb.collection('pieceAssignments').doc(id(piece.pieceAssignmentId))
  await pieceRef.set(JSON.parse(JSON.stringify(piece)))
  const store = createFirestoreSecureDeliveryStore({ firestore: isolatedDb })
  const initial = createInitialPieceLifecycleRecord(piece)
  const revoked = revokePieceLifecycleRecord(initial, '2026-10-18T09:00:00Z')
  const firestore = {
    collection: (name) => isolatedDb.collection(name),
    async runTransaction(operation) {
      await store.commitPieceLifecycleMutation({ currentLifecycle: initial, nextLifecycle: revoked })
      return isolatedDb.runTransaction(operation)
    },
  }
  const result = await backfillPieceEligibilityPage({ firestore, mode: 'apply', applyAuthorized: true })
  assert.deepEqual(result.errors, [])
  assert.equal(result.revoked, 1)
  assert.equal(result.updated, 0)
  assert.equal((await pieceRef.get()).data().studentListEligible, false)
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

  const pieceRef = db.collection('pieceAssignments')
    .doc(id(piece.pieceAssignmentId))
  assert.equal((await pieceRef.get()).data().studentListEligible, true)
  const indexedStore = createFirestoreSecureDeliveryStore({
    firestore: db,
    env: { STUDENT_PIECE_INDEXED_READS_ENABLED: 'true' },
  })
  assert.deepEqual(
    (await indexedStore.listActivePieceContextsForStudent(piece.studentId)).map((context) => context.piece),
    [piece],
  )

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
  assert.equal((await pieceRef.get()).data().studentListEligible, true)
  assert.equal(
    (await indexedStore.listActivePieceContextsForStudent(piece.studentId))[0].lifecycle.state,
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
  assert.equal((await pieceRef.get()).data().studentListEligible, false)
  assert.deepEqual(await indexedStore.listActivePieceContextsForStudent(piece.studentId), [])
  assert.deepEqual(await store.getPieceAssignment(piece.pieceAssignmentId), piece)
  await store.putPieceAssignment(piece)
  assert.equal((await pieceRef.get()).data().studentListEligible, false)

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
