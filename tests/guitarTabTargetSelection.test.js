import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GUITAR_TAB_TARGET_SELECTION_STATE,
  resolveGuitarTabTargetSelection,
  selectCanonicalNotesForGuitarTabTarget,
} from '../src/services/guitarTabTargetSelection.js'

const singleInventory = Object.freeze({
  parts: Object.freeze([
    Object.freeze({
      partId: 'P1',
      partIndex: 0,
      name: 'Violin',
      staves: Object.freeze([
        Object.freeze({
          staff: 1,
          voices: Object.freeze([
            Object.freeze({ voice: 1, pitchedEventCount: 3 }),
          ]),
        }),
      ]),
    }),
  ]),
})

const complexInventory = Object.freeze({
  parts: Object.freeze([
    Object.freeze({
      partId: 'P1',
      partIndex: 0,
      name: 'Piano',
      staves: Object.freeze([
        Object.freeze({
          staff: 1,
          voices: Object.freeze([
            Object.freeze({ voice: 1, pitchedEventCount: 4 }),
            Object.freeze({ voice: 2, pitchedEventCount: 2 }),
          ]),
        }),
        Object.freeze({
          staff: 2,
          voices: Object.freeze([
            Object.freeze({ voice: 1, pitchedEventCount: 4 }),
          ]),
        }),
      ]),
    }),
    Object.freeze({
      partId: 'P2',
      partIndex: 1,
      name: 'Violin',
      staves: Object.freeze([
        Object.freeze({
          staff: 1,
          voices: Object.freeze([
            Object.freeze({ voice: 1, pitchedEventCount: 2 }),
          ]),
        }),
      ]),
    }),
  ]),
})

test('auto-resolves an exact single Part Staff Voice target', () => {
  const result = resolveGuitarTabTargetSelection(singleInventory)
  assert.equal(result.state, GUITAR_TAB_TARGET_SELECTION_STATE.RESOLVED)
  assert.deepEqual(result.targetSelection, {
    partId: 'P1', partIndex: 0, staff: 1, voice: 1,
  })
  assert.equal(Object.isFrozen(result.targetSelection), true)
})

test('requires explicit selection only at ambiguous hierarchy levels', () => {
  const initial = resolveGuitarTabTargetSelection(complexInventory)
  assert.equal(initial.state, GUITAR_TAB_TARGET_SELECTION_STATE.PART_REQUIRED)
  assert.equal(initial.targetSelection, null)
  assert.equal(initial.partCandidates.length, 2)

  const piano = resolveGuitarTabTargetSelection(complexInventory, {
    partId: 'P1', partIndex: 0,
  })
  assert.equal(piano.state, GUITAR_TAB_TARGET_SELECTION_STATE.STAFF_REQUIRED)
  assert.equal(piano.staffCandidates.length, 2)

  const upper = resolveGuitarTabTargetSelection(complexInventory, {
    partId: 'P1', partIndex: 0, staff: 1,
  })
  assert.equal(upper.state, GUITAR_TAB_TARGET_SELECTION_STATE.VOICE_REQUIRED)
  assert.equal(upper.voiceCandidates.length, 2)

  const melody = resolveGuitarTabTargetSelection(complexInventory, {
    partId: 'P1', partIndex: 0, staff: 1, voice: 1,
  })
  assert.equal(melody.state, GUITAR_TAB_TARGET_SELECTION_STATE.RESOLVED)
  assert.deepEqual(melody.targetSelection, {
    partId: 'P1', partIndex: 0, staff: 1, voice: 1,
  })
})

test('auto-resolves downstream singleton levels after an explicit part choice', () => {
  const violin = resolveGuitarTabTargetSelection(complexInventory, {
    partId: 'P2', partIndex: 1,
  })
  assert.equal(violin.state, GUITAR_TAB_TARGET_SELECTION_STATE.RESOLVED)
  assert.deepEqual(violin.targetSelection, {
    partId: 'P2', partIndex: 1, staff: 1, voice: 1,
  })
})

test('fails closed for stale or contradictory exact target identity', () => {
  assert.equal(
    resolveGuitarTabTargetSelection(complexInventory, {
      partId: 'P1', partIndex: 1,
    }).state,
    GUITAR_TAB_TARGET_SELECTION_STATE.INVALID,
  )
  assert.equal(
    resolveGuitarTabTargetSelection(complexInventory, {
      partId: 'P1', partIndex: 0, staff: 9,
    }).state,
    GUITAR_TAB_TARGET_SELECTION_STATE.INVALID,
  )
  assert.equal(
    resolveGuitarTabTargetSelection(complexInventory, {
      partId: 'P1', partIndex: 0, staff: 1, voice: 9,
    }).state,
    GUITAR_TAB_TARGET_SELECTION_STATE.INVALID,
  )
})

test('returns EMPTY when no physical pitched target candidates exist', () => {
  const empty = Object.freeze({
    parts: Object.freeze([
      Object.freeze({
        partId: 'P1', partIndex: 0, name: 'Rest only', staves: Object.freeze([]),
      }),
    ]),
  })
  const result = resolveGuitarTabTargetSelection(empty)
  assert.equal(result.state, GUITAR_TAB_TARGET_SELECTION_STATE.EMPTY)
  assert.equal(result.targetSelection, null)
})

test('filters canonical notes by exact partId partIndex staff voice without dropping chord tones', () => {
  const notes = [
    { partId: 'P1', partIndex: 0, staff: 1, voice: 1, isRest: false, midi: 60, isChordNote: false },
    { partId: 'P1', partIndex: 0, staff: 1, voice: 1, isRest: false, midi: 64, isChordNote: true },
    { partId: 'P1', partIndex: 0, staff: 1, voice: 2, isRest: false, midi: 67 },
    { partId: 'P1', partIndex: 0, staff: 2, voice: 1, isRest: false, midi: 48 },
    { partId: 'P2', partIndex: 1, staff: 1, voice: 1, isRest: false, midi: 69 },
    { partId: 'P1', partIndex: 0, staff: 1, voice: 1, isRest: true },
  ]
  const selected = selectCanonicalNotesForGuitarTabTarget(notes, {
    partId: 'P1', partIndex: 0, staff: 1, voice: 1,
  })
  assert.equal(Object.isFrozen(selected), true)
  assert.deepEqual(selected.map((note) => note.midi), [60, 64])
})

test('exact canonical filtering fails closed on invalid or empty target evidence', () => {
  const notes = [
    { partId: 'P1', partIndex: 0, staff: 1, voice: 1, isRest: false, midi: 60 },
  ]
  assert.throws(
    () => selectCanonicalNotesForGuitarTabTarget(notes, {
      partId: 'P1', partIndex: 1, staff: 1, voice: 1,
    }),
    /empty|target|selection/i,
  )
  assert.throws(
    () => selectCanonicalNotesForGuitarTabTarget(notes, {
      partId: 'P1', partIndex: 0, staff: 1,
    }),
    /invalid|target|selection/i,
  )
})
