import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'

import {
  createPendingStudentWorkRequest,
  createStudentWorkRequest,
  revokeStudentWorkRequest,
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
  transitionPieceLifecycleRecord,
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

function piece(pieceAssignmentId = 'ses170-piece-a') {
  return createPieceAssignment({
    pieceAssignmentId,
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
  const poolSizeBefore =
    (await db.collection('poolPublications').get()).size
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

  const poolSizeAfter =
    (await db.collection('poolPublications').get()).size
  assert.equal(poolSizeAfter, poolSizeBefore)
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

function pendingRequest(requestId) {
  return createPendingStudentWorkRequest({ requestId, teacherId: 'ses170-teacher-a', studentId: 'ses170-student-a',
    title: 'SES-170 immutable requested work', requestedAt: '2026-10-04T10:00:00Z' })
}

function alteredRequest(row, updates) {
  const { schemaVersion: _schema, ...fields } = row
  return createStudentWorkRequest({ ...fields, ...updates })
}

test('SES-170 Firestore rejects unrevoke without any partial write and preserves terminal retries', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreStudentWorkRequestStore({ firestore: db })
  const current = pendingRequest('ses170-regression-unrevoke')
  await store.putWorkRequest(current)
  const revoked = revokeStudentWorkRequest(current, { changedAt: '2026-10-04T10:01:00Z' })
  await store.commitWorkRequestTransition(current, revoked)
  await assert.rejects(store.commitWorkRequestTransition(revoked, current), /terminal transition conflict/)
  assert.deepEqual(await store.getWorkRequest(current.requestId), revoked)
  assert.deepEqual(await store.commitWorkRequestTransition(current, revoked), revoked)
  assert.deepEqual(await store.commitWorkRequestTransition(revoked, revoked), revoked)
})

for (const [field, value] of [['teacherId', 'foreign-teacher'], ['studentId', 'foreign-student'],
  ['title', 'Replacement work'], ['requestedAt', '2026-10-04T09:00:00Z']]) {
  test(`SES-170 Firestore rejects immutable ${field} rewrite before any write`, { skip: !EMULATOR_AVAILABLE }, async () => {
    const store = createFirestoreStudentWorkRequestStore({ firestore: db })
    const current = pendingRequest(`ses170-regression-immutable-${field}`)
    await store.putWorkRequest(current)
    const next = alteredRequest(revokeStudentWorkRequest(current, { changedAt: '2026-10-04T10:01:00Z' }), { [field]: value })
    await assert.rejects(store.commitWorkRequestTransition(current, next), /immutable authority transition conflict/)
    assert.deepEqual(await store.getWorkRequest(current.requestId), current)
  })
}

test('SES-170 Firestore concurrent terminal writes keep exactly one CAS winner and immutable snapshot', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreStudentWorkRequestStore({ firestore: db })
  const current = pendingRequest('ses170-regression-concurrent')
  await store.putWorkRequest(current)
  const choices = ['2026-10-04T10:01:00Z', '2026-10-04T10:02:00Z'].map((changedAt) => revokeStudentWorkRequest(current, { changedAt }))
  const outcomes = await Promise.allSettled(choices.map((next) => store.commitWorkRequestTransition(current, next)))
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(outcomes.filter((result) => result.status === 'rejected').length, 1)
  const winner = outcomes.find((result) => result.status === 'fulfilled').value
  assert.deepEqual(await store.getWorkRequest(current.requestId), winner)
  assert.deepEqual(await store.commitWorkRequestTransition(current, winner), winner)
  await assert.rejects(store.commitWorkRequestTransition(winner, current), /terminal transition conflict/)
})

test('SES-170 Firestore converted terminal snapshot cannot be reopened or reassigned', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreStudentWorkRequestStore({ firestore: db })
  const current = convertStudentWorkRequest(pendingRequest('ses170-regression-converted'), {
    pieceAssignmentId: 'ses170-historical-piece', targetState: 'ACTIVE', changedAt: '2026-10-04T10:01:00Z' })
  await db.collection('studentWorkRequests').doc(documentId(current.requestId)).set(plain(current))
  for (const next of [pendingRequest(current.requestId), alteredRequest(current, { pieceAssignmentId: 'foreign-piece' }),
    alteredRequest(current, { targetState: 'REPERTOIRE' }), alteredRequest(current, { updatedAt: '2026-10-04T10:02:00Z' })]) {
    await assert.rejects(store.commitWorkRequestTransition(current, next), /terminal transition conflict/)
    assert.deepEqual(await store.getWorkRequest(current.requestId), current)
  }
  assert.deepEqual(await store.commitWorkRequestTransition(current, current), current)
})


test('SES-170 Firestore retains REPERTOIRE conversion with existing same-student lifecycle evidence', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreStudentWorkRequestStore({ firestore: db })
  const current = pendingRequest('ses170-regression-repertoire')
  const existingPiece = piece('ses170-regression-repertoire-piece')
  const lifecycle = transitionPieceLifecycleRecord(
    transitionPieceLifecycleRecord(createInitialPieceLifecycleRecord(existingPiece), 'COMPLETED', '2026-10-04T09:00:00Z'),
    'REPERTOIRE', '2026-10-04T09:30:00Z')
  await db.collection('pieceAssignments').doc(documentId(existingPiece.pieceAssignmentId)).set(plain(existingPiece))
  await db.collection('pieceAssignmentLifecycle').doc(documentId(existingPiece.pieceAssignmentId)).set(plain(lifecycle))
  await store.putWorkRequest(current)
  const next = convertStudentWorkRequest(current, { pieceAssignmentId: existingPiece.pieceAssignmentId,
    targetState: 'REPERTOIRE', changedAt: '2026-10-04T10:01:00Z' })
  assert.deepEqual(await store.commitWorkRequestTransition(current, next), next)
  assert.deepEqual(await store.commitWorkRequestTransition(current, next), next)
  assert.deepEqual(await store.getPieceEvidence(existingPiece.pieceAssignmentId), { piece: existingPiece, lifecycle })
})

test('SES-170 Firestore competing conversion/revoke keeps one terminal result and does not create a Piece', { skip: !EMULATOR_AVAILABLE }, async () => {
  const store = createFirestoreStudentWorkRequestStore({ firestore: db })
  const current = pendingRequest('ses170-regression-conversion-race')
  const existingPiece = piece('ses170-regression-conversion-race-piece')
  await db.collection('pieceAssignments').doc(documentId(existingPiece.pieceAssignmentId)).set(plain(existingPiece))
  const piecesBefore = (await db.collection('pieceAssignments').get()).size
  const poolBefore = (await db.collection('poolPublications').get()).size
  await store.putWorkRequest(current)
  const next = convertStudentWorkRequest(current, { pieceAssignmentId: existingPiece.pieceAssignmentId,
    targetState: 'ACTIVE', changedAt: '2026-10-04T10:01:00Z' })
  const revoked = revokeStudentWorkRequest(current, { changedAt: '2026-10-04T10:01:00Z' })
  const results = await Promise.allSettled([next, revoked].map((row) => store.commitWorkRequestTransition(current, row)))
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  const winner = results.find((result) => result.status === 'fulfilled').value
  assert.deepEqual(await store.getWorkRequest(current.requestId), winner)
  assert.deepEqual(await store.commitWorkRequestTransition(current, winner), winner)
  assert.equal((await db.collection('pieceAssignments').get()).size, piecesBefore)
  assert.equal((await db.collection('poolPublications').get()).size, poolBefore)
})
