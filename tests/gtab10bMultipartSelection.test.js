import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GUITAR_TAB_TARGET_SELECTION_STATE,
  resolveGuitarTabTargetSelection,
  selectCanonicalNotesForGuitarTabTarget,
} from '../src/services/guitarTabTargetSelection.js'

const multipartInventory = Object.freeze({
  parts: Object.freeze([
    Object.freeze({
      partId: 'Piano', partIndex: 0, name: 'Piyano', staves: Object.freeze([
        Object.freeze({ staff: 1, voices: Object.freeze([
          Object.freeze({ voice: 1, pitchedEventCount: 2 }),
          Object.freeze({ voice: 2, pitchedEventCount: 1 }),
        ]) }),
        Object.freeze({ staff: 2, voices: Object.freeze([
          Object.freeze({ voice: 1, pitchedEventCount: 2 }),
        ]) }),
      ]),
    }),
    Object.freeze({
      partId: 'Guitar', partIndex: 1, name: 'Gitar', staves: Object.freeze([
        Object.freeze({ staff: 1, voices: Object.freeze([
          Object.freeze({ voice: 1, pitchedEventCount: 1 }),
        ]) }),
      ]),
    }),
  ]),
})

test('GTAB-10B multipart inventory exposes all exact part/staff/voice candidates', () => {
  const result = resolveGuitarTabTargetSelection(multipartInventory)
  assert.equal(result.state, GUITAR_TAB_TARGET_SELECTION_STATE.PART_REQUIRED)
  assert.deepEqual(result.partCandidates.map(({ partId, partIndex }) => ({ partId, partIndex })), [
    { partId: 'Piano', partIndex: 0 },
    { partId: 'Guitar', partIndex: 1 },
  ])
})

test('GTAB-10B exact part/staff/voice selection returns only the chosen canonical notes', () => {
  const notes = [
    { partId: 'Piano', partIndex: 0, staff: 1, voice: 1, isRest: false, midi: 60 },
    { partId: 'Piano', partIndex: 0, staff: 1, voice: 1, isRest: false, midi: 64, isChordNote: true },
    { partId: 'Piano', partIndex: 0, staff: 1, voice: 2, isRest: false, midi: 67 },
    { partId: 'Piano', partIndex: 0, staff: 2, voice: 1, isRest: false, midi: 48 },
    { partId: 'Guitar', partIndex: 1, staff: 1, voice: 1, isRest: false, midi: 64 },
  ]
  const selection = resolveGuitarTabTargetSelection(multipartInventory, {
    partId: 'Piano', partIndex: 0, staff: 1, voice: 1,
  })
  assert.equal(selection.state, GUITAR_TAB_TARGET_SELECTION_STATE.RESOLVED)
  assert.deepEqual(
    selectCanonicalNotesForGuitarTabTarget(notes, selection.targetSelection).map((note) => note.midi),
    [60, 64],
  )
})

test('GTAB-10B ambiguous candidates leave target selection unset', () => {
  const result = resolveGuitarTabTargetSelection(multipartInventory)
  assert.equal(result.state, GUITAR_TAB_TARGET_SELECTION_STATE.PART_REQUIRED)
  assert.equal(result.targetSelection, null)
})

test('GTAB-10B staff fallback resolves only when that selected part has one staff', () => {
  const guitar = resolveGuitarTabTargetSelection(multipartInventory, { partId: 'Guitar', partIndex: 1 })
  assert.equal(guitar.state, GUITAR_TAB_TARGET_SELECTION_STATE.RESOLVED)
  assert.deepEqual(guitar.targetSelection, { partId: 'Guitar', partIndex: 1, staff: 1, voice: 1 })

  const piano = resolveGuitarTabTargetSelection(multipartInventory, { partId: 'Piano', partIndex: 0 })
  assert.equal(piano.state, GUITAR_TAB_TARGET_SELECTION_STATE.STAFF_REQUIRED)
  assert.equal(piano.targetSelection, null)
})
