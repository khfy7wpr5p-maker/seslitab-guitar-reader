import assert from 'node:assert/strict'
import test from 'node:test'

async function loadApis() {
  try {
    const [piece, lifecycle] = await Promise.all([
      import('../src/services/pieceAssignment.js'),
      import('../src/services/pieceAssignmentLifecycleRecord.js'),
    ])
    return { ...piece, ...lifecycle }
  } catch {
    assert.fail('Piece lifecycle modules must exist')
  }
}

function pieceInput() {
  return {
    pieceAssignmentId: 'piece-assignment-a',
    pieceId: 'piece-cambaz-a',
    arrangementId: 'arr-cambaz-a',
    studentId: 'student-a',
    title: 'Cambaz',
    teacherNote: 'Yavaş çalış.',
    assignedAt: '2026-09-24T08:00:00Z',
    contentRefs: {
      scoreAssignmentId: 'score-a',
      chordAssignmentIds: ['chord-a'],
    },
  }
}

test('Piece lifecycle follows ACTIVE -> COMPLETED -> REPERTOIRE without changing Piece authority', async () => {
  const {
    createPieceAssignment,
    createInitialPieceLifecycleRecord,
    transitionPieceLifecycleRecord,
    PIECE_ASSIGNMENT_STATE,
  } = await loadApis()

  const piece = createPieceAssignment(pieceInput())
  const active = createInitialPieceLifecycleRecord(piece)
  const completed = transitionPieceLifecycleRecord(
    active,
    PIECE_ASSIGNMENT_STATE.COMPLETED,
    '2026-09-24T09:00:00Z',
  )
  const repertoire = transitionPieceLifecycleRecord(
    completed,
    PIECE_ASSIGNMENT_STATE.REPERTOIRE,
    '2026-09-24T10:00:00Z',
  )

  assert.equal(active.piece, piece)
  assert.equal(completed.piece, piece)
  assert.equal(repertoire.piece, piece)
  assert.equal(active.state, 'ACTIVE')
  assert.equal(completed.state, 'COMPLETED')
  assert.equal(repertoire.state, 'REPERTOIRE')
  assert.equal(Object.isFrozen(repertoire), true)
})

test('Piece lifecycle rejects skipped, reverse and post-revoke transitions', async () => {
  const {
    createPieceAssignment,
    createInitialPieceLifecycleRecord,
    transitionPieceLifecycleRecord,
    revokePieceLifecycleRecord,
    PIECE_ASSIGNMENT_STATE,
  } = await loadApis()

  const active = createInitialPieceLifecycleRecord(
    createPieceAssignment(pieceInput()),
  )

  assert.throws(
    () => transitionPieceLifecycleRecord(
      active,
      PIECE_ASSIGNMENT_STATE.REPERTOIRE,
      '2026-09-24T09:00:00Z',
    ),
    /transition/i,
  )

  const completed = transitionPieceLifecycleRecord(
    active,
    PIECE_ASSIGNMENT_STATE.COMPLETED,
    '2026-09-24T09:00:00Z',
  )

  assert.throws(
    () => transitionPieceLifecycleRecord(
      completed,
      PIECE_ASSIGNMENT_STATE.ACTIVE,
      '2026-09-24T09:30:00Z',
    ),
    /transition/i,
  )

  const revoked = revokePieceLifecycleRecord(
    completed,
    '2026-09-24T10:00:00Z',
  )

  assert.throws(
    () => transitionPieceLifecycleRecord(
      revoked,
      PIECE_ASSIGNMENT_STATE.REPERTOIRE,
      '2026-09-24T11:00:00Z',
    ),
    /revoked/i,
  )
})

test('Piece lifecycle revoke is idempotent and validator rejects mutable copies', async () => {
  const {
    createPieceAssignment,
    createInitialPieceLifecycleRecord,
    revokePieceLifecycleRecord,
    isPieceAssignmentLifecycleRecord,
  } = await loadApis()

  const active = createInitialPieceLifecycleRecord(
    createPieceAssignment(pieceInput()),
  )
  const first = revokePieceLifecycleRecord(
    active,
    '2026-09-24T10:00:00Z',
  )
  const retry = revokePieceLifecycleRecord(
    first,
    '2026-09-24T11:00:00Z',
  )

  assert.equal(retry, first)
  assert.equal(retry.revokedAt, '2026-09-24T10:00:00Z')
  assert.equal(isPieceAssignmentLifecycleRecord(first), true)
  assert.equal(
    isPieceAssignmentLifecycleRecord(structuredClone(first)),
    false,
  )
})
