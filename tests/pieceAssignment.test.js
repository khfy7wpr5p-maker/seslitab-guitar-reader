import assert from 'node:assert/strict'
import test from 'node:test'

async function loadApi() {
  try {
    return await import('../src/services/pieceAssignment.js')
  } catch {
    assert.fail('pieceAssignment module must exist')
  }
}

function validInput(overrides = {}) {
  return {
    pieceAssignmentId: 'piece-assignment-a',
    pieceId: 'piece-cambaz-a',
    arrangementId: 'arr-cambaz-a',
    studentId: 'student-a',
    title: 'Cambaz',
    teacherNote: '',
    assignedAt: '2026-09-24T08:00:00Z',
    contentRefs: {
      scoreAssignmentId: 'score-a',
      chordAssignmentIds: ['chord-a', 'chord-b'],
    },
    ...overrides,
  }
}

test('PieceAssignmentV1 keeps title separate from authority identity', async () => {
  const { createPieceAssignment } = await loadApi()
  const a = createPieceAssignment(validInput())
  const b = createPieceAssignment(validInput({
    pieceAssignmentId: 'piece-assignment-b',
    pieceId: 'piece-cambaz-b',
    arrangementId: 'arr-cambaz-b',
    contentRefs: {
      scoreAssignmentId: 'score-b',
      chordAssignmentIds: [],
    },
  }))

  assert.equal(a.schemaVersion, '1.0.0')
  assert.equal(a.title, b.title)
  assert.notEqual(a.pieceId, b.pieceId)
  assert.notEqual(a.arrangementId, b.arrangementId)
  assert.equal(a.state, 'ACTIVE')
  assert.equal(a.revokedAt, null)
  assert.equal(Object.isFrozen(a), true)
  assert.equal(Object.isFrozen(a.contentRefs), true)
  assert.equal(Object.isFrozen(a.contentRefs.chordAssignmentIds), true)
})

test('PieceAssignmentV1 requires at least one supported child and allows score-only or chords-only', async () => {
  const { createPieceAssignment } = await loadApi()

  assert.equal(
    createPieceAssignment(validInput({
      contentRefs: {
        scoreAssignmentId: 'score-only',
        chordAssignmentIds: [],
      },
    })).contentRefs.scoreAssignmentId,
    'score-only',
  )

  assert.deepEqual(
    createPieceAssignment(validInput({
      contentRefs: {
        scoreAssignmentId: null,
        chordAssignmentIds: ['chord-only'],
      },
    })).contentRefs.chordAssignmentIds,
    ['chord-only'],
  )

  assert.throws(
    () => createPieceAssignment(validInput({
      contentRefs: {
        scoreAssignmentId: null,
        chordAssignmentIds: [],
      },
    })),
    /at least one supported child/i,
  )
})

test('PieceAssignmentV1 rejects duplicate child IDs and unsupported caller authority fields', async () => {
  const { createPieceAssignment } = await loadApi()

  assert.throws(
    () => createPieceAssignment(validInput({
      contentRefs: {
        scoreAssignmentId: null,
        chordAssignmentIds: ['chord-a', 'chord-a'],
      },
    })),
    /duplicate.*chord/i,
  )

  assert.throws(
    () => createPieceAssignment(validInput({
      contentRefs: {
        scoreAssignmentId: 'shared-child',
        chordAssignmentIds: ['shared-child'],
      },
    })),
    /duplicate.*child|same assignment/i,
  )

  for (const extra of [
    { state: 'COMPLETED' },
    { revokedAt: '2026-09-24T09:00:00Z' },
    { tabAssignmentId: 'tab-a' },
  ]) {
    assert.throws(
      () => createPieceAssignment({
        ...validInput(),
        ...extra,
      }),
      /unsupported field/i,
    )
  }
})

test('PieceAssignmentV1 validates strict contentRefs and stable authority IDs', async () => {
  const { createPieceAssignment, isPieceAssignment } = await loadApi()
  const valid = createPieceAssignment(validInput())

  assert.equal(isPieceAssignment(valid), true)
  assert.equal(isPieceAssignment(structuredClone(valid)), false)

  assert.throws(
    () => createPieceAssignment(validInput({
      pieceId: '   ',
    })),
    /pieceId/i,
  )
  assert.throws(
    () => createPieceAssignment(validInput({
      contentRefs: {
        scoreAssignmentId: 'score-a',
        chordAssignmentIds: [' '],
      },
    })),
    /chordAssignmentIds/i,
  )
  assert.throws(
    () => createPieceAssignment(validInput({
      contentRefs: {
        scoreAssignmentId: 'score-a',
        chordAssignmentIds: [],
        tabAssignmentId: 'tab-a',
      },
    })),
    /unsupported field/i,
  )
})
