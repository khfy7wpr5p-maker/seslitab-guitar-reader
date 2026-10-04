import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import {
  createPendingStudentWorkRequest,
  convertStudentWorkRequest,
} from '../src/services/studentWorkRequest.js'
import {
  createTeacherStudentGrant,
} from '../src/services/teacherStudentGrant.js'
import {
  createPieceAssignment,
} from '../src/services/pieceAssignment.js'
import {
  createInitialPieceLifecycleRecord,
  revokePieceLifecycleRecord,
} from '../src/services/pieceAssignmentLifecycleRecord.js'

const PROJECT_ID = 'demo-seslitab-td06'
const EMULATOR_AVAILABLE = Boolean(process.env.FIRESTORE_EMULATOR_HOST)

let admin
let db
let createFirestoreStudentWorkRequestStore

function documentId(value) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

function piece() {
  return createPieceAssignment({
    pieceAssignmentId: 'ses170-piece-a',
    pieceId: 'ses170-work-a',
    arrangementId: 'ses170-arrangement-a',
    studentId: 'ses170-student-a',
    title: 'SES-170 work',
    teacherNote: '',
    assignedAt: '2026-10-04T08:00:00Z',
    contentRefs: {
      scoreAssignmentId: 'ses170-score-a',
      chordAssignmentIds: [],
    },
  })
}

before(async () => {
  if (!EMULATOR_AVAILABLE) return
  const adminModule = await import('../backend/delivery/firebase/firebaseAdmin.js')
  const storeModule = await import('../backend/delivery/firebase/firestoreStudentWorkRequestStore.js')

  admin = adminModule.createFirebaseAdminServices({
    emulator: true,
    projectId: PROJECT_ID,
    appName: 'ses170-work-request-emulator-tests',
  })
  db = admin.firestore
  createFirestoreStudentWorkRequestStore =
    storeModule.createFirestoreStudentWorkRequestStore
})

after(async () => {
  await admin?.delete()
})

test('SES-170 Firestore request authority stays separate from pool and commits exact ACTIVE Piece evidence', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreStudentWorkRequestStore({ firestore: db })
  const grant = createTeacherStudentGrant({
    teacherId: 'ses170-teacher-a',
    studentId: 'ses170-student-a',
    active: true,
    createdAt: '2026-10-04T07:59:00Z',
    revokedAt: null,
  })
  await db.collection('teacherStudentGrants').doc('ses170-grant-a').set(plain(grant))

  const workPiece = piece()
  await db.collection('pieceAssignments')
    .doc(documentId(workPiece.pieceAssignmentId))
    .set(plain(workPiece))

  const request = createPendingStudentWorkRequest({
    requestId: 'ses170-request-a',
    teacherId: grant.teacherId,
    studentId: grant.studentId,
    title: 'SES-170 work',
    requestedAt: '2026-10-04T08:01:00Z',
  })
  await store.putWorkRequest(request)

  assert.equal(
    (await store.listActiveTeacherGrantsForStudent(grant.studentId)).length,
    1,
  )
  assert.equal(
    (await store.getPieceEvidence(workPiece.pieceAssignmentId)).lifecycle.state,
    'ACTIVE',
  )

  const converted = convertStudentWorkRequest(request, {
    pieceAssignmentId: workPiece.pieceAssignmentId,
    targetState: 'ACTIVE',
    changedAt: '2026-10-04T08:02:00Z',
  })
  const ack = await store.commitWorkRequestTransition(request, converted)
  assert.equal(ack.state, 'CONVERTED')
  assert.equal(
    (await store.listWorkRequestsForTeacher(grant.teacherId))[0].state,
    'CONVERTED',
  )

  const poolSnapshot = await db.collection('poolPublications').get()
  assert.equal(poolSnapshot.size, 0)
})

test('SES-170 conversion transaction fails closed when Piece becomes revoked before commit', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreStudentWorkRequestStore({ firestore: db })
  const workPiece = piece()
  await db.collection('pieceAssignments')
    .doc(documentId(workPiece.pieceAssignmentId))
    .set(plain(workPiece))

  const request = createPendingStudentWorkRequest({
    requestId: 'ses170-request-race',
    teacherId: 'ses170-teacher-a',
    studentId: workPiece.studentId,
    title: 'SES-170 race work',
    requestedAt: '2026-10-04T09:00:00Z',
  })
  await store.putWorkRequest(request)
  const next = convertStudentWorkRequest(request, {
    pieceAssignmentId: workPiece.pieceAssignmentId,
    targetState: 'ACTIVE',
    changedAt: '2026-10-04T09:01:00Z',
  })

  const revoked = revokePieceLifecycleRecord(
    createInitialPieceLifecycleRecord(workPiece),
    '2026-10-04T09:00:30Z',
  )
  await db.collection('pieceAssignmentLifecycle')
    .doc(documentId(workPiece.pieceAssignmentId))
    .set(plain(revoked))

  await assert.rejects(
    store.commitWorkRequestTransition(request, next),
    /piece-evidence-mismatch/,
  )
  assert.equal(
    (await store.getWorkRequest(request.requestId)).state,
    'PENDING',
  )
})
