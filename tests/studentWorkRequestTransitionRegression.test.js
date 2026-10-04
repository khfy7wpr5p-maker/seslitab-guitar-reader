import test from 'node:test'
import assert from 'node:assert/strict'
import { createPendingStudentWorkRequest, createStudentWorkRequest, convertStudentWorkRequest, revokeStudentWorkRequest } from '../src/services/studentWorkRequest.js'
import { createInMemoryStudentWorkRequestStore } from '../backend/delivery/repositories/inMemoryStudentWorkRequestStore.js'
import { createPieceAssignment } from '../src/services/pieceAssignment.js'
import { createInitialPieceLifecycleRecord, transitionPieceLifecycleRecord } from '../src/services/pieceAssignmentLifecycleRecord.js'
import { createFirestoreStudentWorkRequestStore } from '../backend/delivery/firebase/firestoreStudentWorkRequestStore.js'

const pending = () => createPendingStudentWorkRequest({ requestId: 'request-a', teacherId: 'teacher-a', studentId: 'student-a',
  title: 'Requested work', requestedAt: '2026-10-04T08:00:00Z' })
function changed(row, updates) {
  const { schemaVersion: _schema, ...fields } = row
  return createStudentWorkRequest({ ...fields, ...updates })
}
// Runs the actual Firestore adapter against staged transaction reads/writes.
// Real Firestore isolation and retries are covered separately by emulator tests.
function fakeFirestore(initial, extraRows = []) {
  const rows = new Map([['studentWorkRequests/' + Buffer.from(initial.requestId).toString('base64url'), JSON.parse(JSON.stringify(initial))], ...extraRows])
  const ref = (key) => ({ key, get: async () => snapshot(key) })
  const snapshot = (key) => ({ exists: rows.has(key), data: () => structuredClone(rows.get(key)) })
  return { collection: (name) => ({ doc: (id) => ref(`${name}/${id}`) }), runTransaction: async (body) => {
    const writes = []
    const result = await body({ get: async (r) => snapshot(r.key), set: (r, value) => writes.push([r.key, value]) })
    for (const [key, value] of writes) rows.set(key, value)
    return result
  } }
}
const stores = {
  memory: (row) => createInMemoryStudentWorkRequestStore({ requests: [row] }),
  firestoreAdapter: (row) => createFirestoreStudentWorkRequestStore({ firestore: fakeFirestore(row) }),
}
for (const [name, makeStore] of Object.entries(stores)) {
  test(`${name}: revoked request cannot be restored to PENDING`, async () => {
    const current = pending()
    const store = makeStore(current)
    const revoked = revokeStudentWorkRequest(current, { changedAt: '2026-10-04T08:01:00Z' })
    await store.commitWorkRequestTransition(current, revoked)
    await assert.rejects(store.commitWorkRequestTransition(revoked, current))
    assert.deepEqual(await store.getWorkRequest(current.requestId), revoked)
  })
  for (const [field, value] of [['teacherId', 'teacher-b'], ['studentId', 'student-b'], ['title', 'Different work'],
    ['requestedAt', '2026-10-04T07:00:00Z']]) {
    test(`${name}: transition cannot rewrite immutable ${field}`, async () => {
      const current = pending()
      const store = makeStore(current)
      const next = changed(revokeStudentWorkRequest(current, { changedAt: '2026-10-04T08:01:00Z' }), { [field]: value })
      await assert.rejects(store.commitWorkRequestTransition(current, next))
      assert.deepEqual(await store.getWorkRequest(current.requestId), current)
    })
  }
  test(`${name}: converted request cannot be reopened, revoked, retargeted or restamped`, async () => {
    const current = convertStudentWorkRequest(pending(), { pieceAssignmentId: 'piece-a', targetState: 'ACTIVE', changedAt: '2026-10-04T08:01:00Z' })
    const store = makeStore(current)
    const candidates = [pending(), revokeStudentWorkRequest(pending(), { changedAt: '2026-10-04T08:02:00Z' }),
      changed(current, { pieceAssignmentId: 'piece-b' }), changed(current, { targetState: 'REPERTOIRE' }),
      changed(current, { updatedAt: '2026-10-04T08:02:00Z' })]
    for (const next of candidates) await assert.rejects(store.commitWorkRequestTransition(current, next))
    assert.deepEqual(await store.getWorkRequest(current.requestId), current)
    assert.deepEqual(await store.commitWorkRequestTransition(current, current), current)
  })
  test(`${name}: exact terminal replay and competing CAS preserve one-way authority`, async () => {
    const current = pending()
    const store = makeStore(current)
    const revoked = revokeStudentWorkRequest(current, { changedAt: '2026-10-04T08:01:00Z' })
    await store.commitWorkRequestTransition(current, revoked)
    assert.deepEqual(await store.commitWorkRequestTransition(current, revoked), revoked)
    assert.deepEqual(await store.commitWorkRequestTransition(revoked, revoked), revoked)
    const competing = revokeStudentWorkRequest(current, { changedAt: '2026-10-04T08:02:00Z' })
    await assert.rejects(store.commitWorkRequestTransition(current, competing), /current-state conflict/)
    assert.deepEqual(await store.getWorkRequest(current.requestId), revoked)
  })
}

for (const targetState of ['ACTIVE', 'REPERTOIRE']) {
  for (const name of ['memory', 'firestoreAdapter']) {
    test(`${name}: preserves legitimate ${targetState} conversion and exact duplicate acknowledgement`, async () => {
      const current = pending()
      const piece = createPieceAssignment({ pieceAssignmentId: 'piece-a', pieceId: 'work-a', arrangementId: 'arrangement-a',
        studentId: current.studentId, title: 'Existing work', teacherNote: '', assignedAt: '2026-10-04T07:00:00Z',
        contentRefs: { scoreAssignmentId: 'score-a', chordAssignmentIds: [] } })
      const lifecycle = targetState === 'ACTIVE' ? createInitialPieceLifecycleRecord(piece) :
        transitionPieceLifecycleRecord(transitionPieceLifecycleRecord(createInitialPieceLifecycleRecord(piece), 'COMPLETED', '2026-10-04T07:15:00Z'), 'REPERTOIRE', '2026-10-04T07:30:00Z')
      // ACTIVE deliberately tests the established implicit initial-lifecycle path.
      const extraRows = [['pieceAssignments/' + Buffer.from(piece.pieceAssignmentId).toString('base64url'), JSON.parse(JSON.stringify(piece))]]
      if (targetState === 'REPERTOIRE') extraRows.push(['pieceAssignmentLifecycle/' + Buffer.from(piece.pieceAssignmentId).toString('base64url'), JSON.parse(JSON.stringify(lifecycle))])
      const store = name === 'memory' ? createInMemoryStudentWorkRequestStore({ requests: [current], pieces: [piece],
        pieceLifecycles: targetState === 'REPERTOIRE' ? [lifecycle] : [] }) :
        createFirestoreStudentWorkRequestStore({ firestore: fakeFirestore(current, extraRows) })
      const next = convertStudentWorkRequest(current, { pieceAssignmentId: piece.pieceAssignmentId, targetState, changedAt: '2026-10-04T08:01:00Z' })
      assert.deepEqual(await store.commitWorkRequestTransition(current, next), next)
      assert.deepEqual(await store.commitWorkRequestTransition(current, next), next)
      assert.deepEqual(await store.commitWorkRequestTransition(next, next), next)
      assert.deepEqual(await store.getWorkRequest(current.requestId), next)
    })
  }
}
