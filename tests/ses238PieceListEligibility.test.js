import assert from 'node:assert/strict'
import test from 'node:test'
import { createFirestoreSecureDeliveryStore } from '../backend/delivery/firebase/firestoreSecureDeliveryStore.js'
import { createPieceAssignment } from '../src/services/pieceAssignment.js'
import {
  createInitialPieceLifecycleRecord,
  revokePieceLifecycleRecord,
  transitionPieceLifecycleRecord,
} from '../src/services/pieceAssignmentLifecycleRecord.js'

const indexedEnv = { STUDENT_PIECE_INDEXED_READS_ENABLED: 'true' }
const key = (id) => Buffer.from(id).toString('base64url')
const path = (piece) => `pieceAssignments/${key(piece.pieceAssignmentId)}`
const lifecyclePath = (piece) => `pieceAssignmentLifecycle/${key(piece.pieceAssignmentId)}`
const plain = (value) => JSON.parse(JSON.stringify(value))

function piece(id = 'current', studentId = 'student-a') {
  return createPieceAssignment({
    pieceAssignmentId: id,
    pieceId: `work-${id}`,
    arrangementId: `arrangement-${id}`,
    studentId,
    title: 'Etüt',
    teacherNote: '',
    assignedAt: '2026-10-18T08:00:00Z',
    contentRefs: { scoreAssignmentId: `score-${id}`, chordAssignmentIds: [] },
  })
}

// Buffered writes make rejected mutations observable without committing partial state.
function database(entries = [], { beforeBatch = () => {} } = {}) {
  const documents = new Map(entries.map(([p, v]) => [p, plain(v)]))
  const queryReads = []
  const batchReads = []
  const commits = []
  const snapshot = (ref) => ({
    ref,
    exists: documents.has(ref.path),
    data: () => plain(documents.get(ref.path)),
  })
  function collection(name, filters = []) {
    return {
      doc(id) {
        const p = `${name}/${id}`
        return { path: p, get: async () => snapshot({ path: p }), collection: (child) => collection(`${p}/${child}`) }
      },
      where(field, op, value) {
        assert.equal(op, '==')
        return collection(name, [...filters, [field, value]])
      },
      async get() {
        const refs = [...documents].filter(([p, v]) =>
          p.startsWith(`${name}/`) && p.split('/').length === name.split('/').length + 1 &&
          filters.every(([field, value]) => v[field] === value),
        ).map(([p]) => ({ path: p }))
        queryReads.push(...refs.map((ref) => ref.path))
        return { docs: refs.map(snapshot) }
      },
    }
  }
  const firestore = {
    collection,
    batch() { throw new Error('unused') },
    async getAll(...refs) {
      beforeBatch(documents)
      batchReads.push(...refs.map((ref) => ref.path))
      return refs.map(snapshot)
    },
    async runTransaction(operation) {
      const writes = []
      const tx = {
        get: async (ref) => snapshot(ref),
        create: (ref, value) => {
          assert.equal(documents.has(ref.path), false)
          writes.push([ref.path, plain(value)])
        },
        set: (ref, value) => writes.push([ref.path, plain(value)]),
        update: (ref, value) => {
          assert.equal(documents.has(ref.path), true)
          writes.push([ref.path, { ...documents.get(ref.path), ...plain(value) }])
        },
      }
      const result = await operation(tx)
      for (const [p, value] of writes) documents.set(p, value)
      commits.push(writes)
      return result
    },
  }
  return { firestore, documents, queryReads, batchReads, commits }
}

test('SES-238 indexed list reads no revoked history or other student documents', async () => {
  const current = piece()
  const rows = [[path(current), { ...current, studentListEligible: true }]]
  for (let i = 0; i < 50; i += 1) {
    const old = piece(`old-${i}`)
    rows.push([path(old), { ...old, studentListEligible: false }])
    rows.push([lifecyclePath(old), revokePieceLifecycleRecord(createInitialPieceLifecycleRecord(old), '2026-10-18T09:00:00Z')])
  }
  const other = piece('other', 'student-b')
  rows.push([path(other), { ...other, studentListEligible: true }])
  const db = database(rows)
  const store = createFirestoreSecureDeliveryStore({ firestore: db.firestore, env: indexedEnv })
  assert.deepEqual(await store.listActivePieceContextsForStudent(current.studentId), [{ piece: current, lifecycle: null }])
  assert.deepEqual(db.queryReads, [path(current)])
  assert.deepEqual(db.batchReads, [path(current), lifecyclePath(current)])
})

test('SES-238 default list preserves legacy records and still checks revoked lifecycle', async () => {
  const current = piece()
  const old = piece('revoked')
  const db = database([
    [path(current), current],
    [path(old), { ...old, studentListEligible: false }],
    [lifecyclePath(old), revokePieceLifecycleRecord(createInitialPieceLifecycleRecord(old), '2026-10-18T09:00:00Z')],
  ])
  const store = createFirestoreSecureDeliveryStore({ firestore: db.firestore })
  assert.deepEqual(await store.listActivePieceContextsForStudent(current.studentId), [{ piece: current, lifecycle: null }])
  assert.equal(db.queryReads.length, 2)
  assert.equal(db.batchReads.length, 4)
})

test('SES-238 explicit false flag retains unbackfilled records; indexed empty result does not batch read', async () => {
  const current = piece()
  const db = database([[path(current), current]])
  const legacy = createFirestoreSecureDeliveryStore({
    firestore: db.firestore,
    env: { STUDENT_PIECE_INDEXED_READS_ENABLED: 'false' },
  })
  assert.equal((await legacy.listActivePieceContextsForStudent(current.studentId)).length, 1)
  db.batchReads.length = 0
  const indexed = createFirestoreSecureDeliveryStore({ firestore: db.firestore, env: indexedEnv })
  assert.deepEqual(await indexed.listActivePieceContextsForStudent(current.studentId), [])
  assert.deepEqual(db.batchReads, [])
})

test('SES-238 stale eligible marker cannot bypass lifecycle revoke', async () => {
  const current = piece()
  const db = database([
    [path(current), { ...current, studentListEligible: true }],
    [lifecyclePath(current), revokePieceLifecycleRecord(createInitialPieceLifecycleRecord(current), '2026-10-18T09:00:00Z')],
  ])
  const store = createFirestoreSecureDeliveryStore({ firestore: db.firestore, env: indexedEnv })
  assert.deepEqual(await store.listActivePieceContextsForStudent(current.studentId), [])
  assert.equal(db.batchReads.length, 2)
})

test('SES-238 eligibility change after query is rechecked against current lifecycle', async () => {
  const current = piece()
  const db = database([[path(current), { ...current, studentListEligible: true }]], {
    beforeBatch(documents) {
      documents.set(path(current), { ...current, studentListEligible: false })
      documents.set(lifecyclePath(current), revokePieceLifecycleRecord(createInitialPieceLifecycleRecord(current), '2026-10-18T09:00:00Z'))
    },
  })
  const store = createFirestoreSecureDeliveryStore({ firestore: db.firestore, env: indexedEnv })
  assert.deepEqual(await store.listActivePieceContextsForStudent(current.studentId), [])
})

test('SES-238 creation stores eligibility without changing public immutable Piece or replay', async () => {
  const current = piece()
  const db = database()
  const store = createFirestoreSecureDeliveryStore({ firestore: db.firestore })
  assert.deepEqual(await store.putPieceAssignment(current), current)
  assert.equal(db.documents.get(path(current)).studentListEligible, true)
  assert.deepEqual(await store.getPieceAssignment(current.pieceAssignmentId), current)
  assert.deepEqual(await store.listPieceAssignmentsForStudent(current.studentId), [current])
  assert.deepEqual(await store.putPieceAssignment(current), current)
  assert.deepEqual(db.commits.at(-1), [])
})

test('SES-238 completed and repertoire remain eligible; revoke changes marker and lifecycle in one commit', async () => {
  const current = piece()
  const db = database([[path(current), current]])
  const store = createFirestoreSecureDeliveryStore({ firestore: db.firestore })
  let lifecycle = createInitialPieceLifecycleRecord(current)
  for (const [state, time] of [['COMPLETED', '09'], ['REPERTOIRE', '10']]) {
    const next = transitionPieceLifecycleRecord(lifecycle, state, `2026-10-18T${time}:00:00Z`)
    await store.commitPieceLifecycleMutation({ currentLifecycle: lifecycle, nextLifecycle: next })
    assert.equal(db.documents.get(path(current)).studentListEligible, true)
    if (state === 'REPERTOIRE') {
      assert.deepEqual(db.commits.at(-1).map(([p]) => p), [lifecyclePath(current)])
    }
    lifecycle = next
  }
  const next = revokePieceLifecycleRecord(lifecycle, '2026-10-18T11:00:00Z')
  await store.commitPieceLifecycleMutation({ currentLifecycle: lifecycle, nextLifecycle: next })
  assert.equal(db.documents.get(path(current)).studentListEligible, false)
  assert.deepEqual(new Set(db.commits.at(-1).map(([p]) => p)), new Set([path(current), lifecyclePath(current)]))
  await store.putPieceAssignment(current)
  assert.equal(db.documents.get(path(current)).studentListEligible, false)
  await store.commitPieceLifecycleMutation({ currentLifecycle: next, nextLifecycle: next })
  assert.deepEqual(db.commits.at(-1), [])
})

test('SES-238 rejected cascade cannot partially change eligibility or lifecycle', async () => {
  const current = piece()
  const db = database([[path(current), { ...current, studentListEligible: true }]])
  const store = createFirestoreSecureDeliveryStore({ firestore: db.firestore })
  const lifecycle = createInitialPieceLifecycleRecord(current)
  const before = [...db.documents]
  await assert.rejects(store.commitPieceLifecycleMutation({
    currentLifecycle: lifecycle,
    nextLifecycle: revokePieceLifecycleRecord(lifecycle, '2026-10-18T09:00:00Z'),
    teacherId: 'teacher-a',
    action: 'REVOKE',
    changedAt: '2026-10-18T09:00:00Z',
    historyEventId: 'event-a',
  }), /child|missing/i)
  assert.deepEqual([...db.documents], before)
  assert.equal(db.commits.length, 0)
})

test('SES-238 persistence still rejects malformed metadata and unknown authority fields', async () => {
  const current = piece()
  for (const extra of [{ studentListEligible: 'true' }, { unexpected: true, studentListEligible: true }]) {
    const db = database([[path(current), { ...current, ...extra }]])
    const store = createFirestoreSecureDeliveryStore({ firestore: db.firestore })
    await assert.rejects(store.getPieceAssignment(current.pieceAssignmentId), /invalid PieceAssignment persistence/)
  }
})
