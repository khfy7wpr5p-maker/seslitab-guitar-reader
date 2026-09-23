import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getChordBoardVoicings,
} from '../src/services/chordBoardCatalog.js'

let bindingApi = null
try {
  bindingApi = await import(
    '../src/services/chordBoardAssignmentSourceBinding.js'
  )
} catch {}

function requireBindingApi() {
  assert.ok(
    bindingApi,
    'TD-07 ChordBoardAssignmentSourceBinding module must exist',
  )
  return bindingApi
}

function snapshot() {
  return getChordBoardVoicings('Am')[0]
}

test('TD-07 creates recipient-bound immutable CHORD_BOARD source', () => {
  const {
    createChordBoardAssignmentSourceBinding,
    isChordBoardAssignmentSourceBinding,
  } = requireBindingApi()

  const exact = snapshot()
  const sourceRef =
    createChordBoardAssignmentSourceBinding({
      studentId: 'student-a',
      snapshot: exact,
      boundAt: '2026-09-23T12:00:00Z',
    })

  assert.equal(Object.isFrozen(sourceRef), true)
  assert.equal(sourceRef.studentId, 'student-a')
  assert.equal(sourceRef.snapshot, exact)
  assert.equal(
    sourceRef.voicingFingerprint,
    exact.voicingFingerprint,
  )
  assert.equal(
    sourceRef.sourceKind,
    'chord_board_exact_voicing',
  )
  assert.equal(
    isChordBoardAssignmentSourceBinding(sourceRef),
    true,
  )
})

test('TD-07 binding rejects recipient mismatch data mutation and stale fingerprint', () => {
  const {
    createChordBoardAssignmentSourceBinding,
    isChordBoardAssignmentSourceBinding,
  } = requireBindingApi()

  const sourceRef =
    createChordBoardAssignmentSourceBinding({
      studentId: 'student-a',
      snapshot: snapshot(),
      boundAt: '2026-09-23T12:00:00Z',
    })

  assert.equal(
    isChordBoardAssignmentSourceBinding(
      structuredClone(sourceRef),
    ),
    false,
  )

  assert.equal(
    isChordBoardAssignmentSourceBinding(
      Object.freeze({
        ...sourceRef,
        voicingFingerprint: '0'.repeat(64),
      }),
    ),
    false,
  )

  assert.throws(
    () =>
      createChordBoardAssignmentSourceBinding({
        studentId: '',
        snapshot: snapshot(),
        boundAt: '2026-09-23T12:00:00Z',
      }),
    /studentId/i,
  )
})

test('TD-07 binding rejects non-exact or mutable snapshot values', () => {
  const {
    createChordBoardAssignmentSourceBinding,
  } = requireBindingApi()

  assert.throws(
    () =>
      createChordBoardAssignmentSourceBinding({
        studentId: 'student-a',
        snapshot: structuredClone(snapshot()),
        boundAt: '2026-09-23T12:00:00Z',
      }),
    /snapshot|immutable|exact/i,
  )
})
