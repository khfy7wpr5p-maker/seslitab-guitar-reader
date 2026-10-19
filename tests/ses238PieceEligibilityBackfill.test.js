import assert from 'node:assert/strict'
import test from 'node:test'
import { createPieceAssignment } from '../src/services/pieceAssignment.js'
import { createInitialPieceLifecycleRecord, revokePieceLifecycleRecord } from '../src/services/pieceAssignmentLifecycleRecord.js'
import { backfillPieceEligibilityPage } from '../backend/delivery/firebase/pieceEligibilityBackfill.js'
import { parsePieceBackfillArgs, authorizePieceBackfill } from '../backend/delivery/provisioning/pieceEligibilityBackfillCommand.js'

const clone = (v) => JSON.parse(JSON.stringify(v))
const id = (v) => Buffer.from(v).toString('base64url')
const piecePath = (p) => `pieceAssignments/${id(p.pieceAssignmentId)}`
const lifecyclePath = (p) => `pieceAssignmentLifecycle/${id(p.pieceAssignmentId)}`
function piece(name) {
  return createPieceAssignment({ pieceAssignmentId: name, pieceId: `work-${name}`,
    arrangementId: `arr-${name}`, studentId: 'student-a', title: 'Etüt', teacherNote: '',
    assignedAt: '2026-10-18T08:00:00Z', contentRefs: { scoreAssignmentId: `score-${name}`, chordAssignmentIds: [] } })
}

function database(entries, beforeTransaction = () => {}) {
  const docs = new Map(entries.map(([p, v]) => [p, clone(v)]))
  const writes = []
  const reads = []
  let queries = 0
  const ref = (path) => ({ path, id: path.split('/').at(-1) })
  const snap = (r) => ({ ...r, ref: r, exists: docs.has(r.path), data: () => clone(docs.get(r.path)) })
  const firestore = {
    collection(name) {
      let after = '', limit = Infinity
      const query = {
        doc: (key) => ref(`${name}/${key}`),
        orderBy(field) { assert.equal(field, '__name__'); return query },
        startAfter(key) { after = key; return query },
        limit(value) { limit = value; return query },
        async get() {
          queries += 1
          const paths = [...docs.keys()].filter((p) => p.startsWith(`${name}/`) && p.split('/').length === 2 && p.split('/')[1] > after).sort().slice(0, limit)
          reads.push(...paths)
          return { docs: paths.map((p) => snap(ref(p))) }
        },
      }
      return query
    },
    async getAll(...refs) { reads.push(...refs.map((r) => r.path)); return refs.map(snap) },
    async runTransaction(operation) {
      await beforeTransaction(docs)
      const pending = []
      const result = await operation({
        async get(r) { reads.push(r.path); return snap(r) },
        update(r, value) { pending.push([r.path, value]) },
      })
      for (const [p, v] of pending) { docs.set(p, { ...docs.get(p), ...v }); writes.push([p, v]) }
      return result
    },
  }
  return { firestore, docs, reads, writes, queries: () => queries }
}

test('SES-238 dry-run and verify classify legacy, revoked and matching records without writes', async () => {
  const active = piece('active'), revoked = piece('revoked'), marked = piece('marked')
  const entries = [[piecePath(active), active], [piecePath(revoked), revoked],
    [lifecyclePath(revoked), revokePieceLifecycleRecord(createInitialPieceLifecycleRecord(revoked), '2026-10-18T09:00:00Z')],
    [piecePath(marked), { ...marked, studentListEligible: true }]]
  for (const mode of ['dry-run', 'verify']) {
    const db = database(entries)
    const result = await backfillPieceEligibilityPage({ firestore: db.firestore, mode })
    assert.equal(result.processed, 3)
    assert.equal(result.wouldUpdate, 2)
    assert.equal(result.unchanged, 1)
    assert.equal(result.eligible, 2)
    assert.equal(result.revoked, 1)
    assert.equal(result.updated, 0)
    assert.equal(result.pageComplete, true)
    assert.deepEqual(result.errors, [])
    assert.equal(db.reads.length, 6)
    assert.deepEqual(db.writes, [])
  }
})

test('SES-238 apply changes only projection and is idempotent', async () => {
  const p = piece('active')
  const db = database([[piecePath(p), p]])
  const input = { firestore: db.firestore, mode: 'apply', applyAuthorized: true }
  const first = await backfillPieceEligibilityPage(input)
  assert.equal(first.updated, 1)
  assert.deepEqual(db.writes, [[piecePath(p), { studentListEligible: true }]])
  assert.deepEqual(db.docs.get(piecePath(p)), { ...p, studentListEligible: true })
  const second = await backfillPieceEligibilityPage(input)
  assert.equal(second.updated, 0)
  assert.equal(second.unchanged, 1)
  assert.equal(db.writes.length, 1)
})

test('SES-238 apply recomputes revoke state after discovery before transaction', async () => {
  const p = piece('race')
  const db = database([[piecePath(p), p]], (docs) => {
    docs.set(lifecyclePath(p), revokePieceLifecycleRecord(createInitialPieceLifecycleRecord(p), '2026-10-18T09:00:00Z'))
  })
  const result = await backfillPieceEligibilityPage({ firestore: db.firestore, mode: 'apply', applyAuthorized: true })
  assert.equal(result.revoked, 1)
  assert.equal(db.docs.get(piecePath(p)).studentListEligible, false)
})

test('SES-238 cursor pages are bounded and resume without repeated writes', async () => {
  const pieces = [piece('a'), piece('b'), piece('c')]
  const db = database(pieces.map((p) => [piecePath(p), p]))
  let after = null, processed = 0
  do {
    const result = await backfillPieceEligibilityPage({ firestore: db.firestore, mode: 'apply', applyAuthorized: true, limit: 1, after })
    assert.ok(result.scanned <= 1)
    processed += result.processed
    after = result.nextCursor
  } while (after !== null)
  assert.equal(processed, 3)
  assert.equal(db.writes.length, 3)
  assert.equal(db.queries(), 4)
})

test('SES-238 immutable Piece drift after discovery fails closed before updating', async () => {
  const p = piece('drift')
  const db = database([[piecePath(p), p]], (docs) => {
    docs.set(piecePath(p), { ...p, studentId: 'student-b' })
  })
  const result = await backfillPieceEligibilityPage({ firestore: db.firestore, mode: 'apply', applyAuthorized: true })
  assert.equal(result.errors[0].code, 'PIECE_AUTHORITY_CHANGED')
  assert.deepEqual(db.writes, [])
})

test('SES-238 mismatched lifecycle is reported without leaking content or advancing past invalid record', async () => {
  const p = piece('a'), foreign = piece('foreign')
  const db = database([[piecePath(p), p], [lifecyclePath(p), createInitialPieceLifecycleRecord(foreign)]])
  const result = await backfillPieceEligibilityPage({ firestore: db.firestore, mode: 'apply', applyAuthorized: true })
  assert.equal(result.errors.length, 1)
  assert.equal(result.pageComplete, false)
  assert.equal(result.nextCursor, null)
  assert.equal(result.processed, 0)
  assert.equal(result.errors[0].code, 'INVALID_PIECE_LIFECYCLE')
  assert.equal(JSON.stringify(result).includes('Etüt'), false)
  assert.equal(JSON.stringify(result).includes('student-a'), false)
  assert.deepEqual(db.writes, [])
})

test('SES-238 rejects malformed Piece and wrong document key without writing', async () => {
  const p = piece('a')
  for (const entries of [[[piecePath(p), { ...p, studentId: '' }]], [['pieceAssignments/wrong-key', p]]]) {
    const db = database(entries)
    const result = await backfillPieceEligibilityPage({ firestore: db.firestore, mode: 'apply', applyAuthorized: true })
    assert.equal(result.errors.length, 1)
    assert.deepEqual(db.writes, [])
  }
})

test('SES-238 no Firestore calls for invalid limit, cursor, mode or unauthorized apply', async () => {
  for (const input of [{ limit: 0 }, { limit: 101 }, { after: '../bad' }, { mode: 'other' }, { mode: 'apply' }]) {
    const db = database([])
    await assert.rejects(backfillPieceEligibilityPage({ firestore: db.firestore, ...input }))
    assert.equal(db.queries(), 0)
    assert.deepEqual(db.reads, [])
  }
})

test('SES-238 CLI defaults dry-run and production apply requires exact project and writer confirmation', () => {
  const dry = parsePieceBackfillArgs(['--production', '--project', 'project-a'])
  assert.equal(dry.mode, 'dry-run')
  assert.equal(dry.limit, 50)
  const env = { SECURE_DELIVERY_FIREBASE_PROJECT_ID: 'project-a', STUDENT_PIECE_BACKFILL_PRODUCTION_AUTHORIZED: 'true' }
  assert.equal(authorizePieceBackfill(dry, env), false)
  assert.throws(() => authorizePieceBackfill(dry, { ...env, SECURE_DELIVERY_FIREBASE_PROJECT_ID: 'project-b' }), /project/)
  const apply = parsePieceBackfillArgs(['--production', '--project', 'project-a', '--mode', 'apply'])
  assert.throws(() => authorizePieceBackfill(apply, env), /apply/)
  const allowed = { ...env, STUDENT_PIECE_BACKFILL_APPLY: 'true' }
  assert.throws(() => authorizePieceBackfill(apply, allowed), /writer/)
  assert.equal(authorizePieceBackfill({ ...apply, compatibleWritersConfirmed: true }, allowed), true)
  for (const argv of [[], ['--wat'], ['--emulator', '--production'], ['--emulator', '--limit', '0'], ['--emulator', '--mode', 'oops']]) {
    assert.throws(() => parsePieceBackfillArgs(argv))
  }
})
