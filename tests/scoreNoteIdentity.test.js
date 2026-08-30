import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveScoreNoteRefForCanonicalNote,
  resolveCanonicalNoteFromScoreRef,
  validateRendererScoreNoteRef,
} from '../src/services/scoreNoteIdentity.js'

function note(overrides = {}) {
  return {
    measureKey: 'P1:m0',
    partId: 'P1',
    partIndex: 0,
    measureIndex: 0,
    measureNumber: 1,
    voice: 1,
    staff: 1,
    startBeat: 0,
    isRest: false,
    ...overrides,
  }
}

test('renderer ScoreNoteRef validation requires explicit voice and bounded exact fields', () => {
  assert.deepEqual(validateRendererScoreNoteRef({ partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 2 }), {
    partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 2,
  })
  assert.equal(validateRendererScoreNoteRef({ partId: 'P1', measureIndex: 0, noteIndex: 0 }), null)
  assert.equal(validateRendererScoreNoteRef({ partId: ' P1 ', measureIndex: 0, noteIndex: 0, voice: 1 }), null)
  assert.equal(validateRendererScoreNoteRef({ partId: 'P1', measureIndex: 0, noteIndex: 0, voice: 1, pitch: 'C4' }), null)
})

test('mapping preserves renderer staff-first traversal without pitch matching', () => {
  const staff2Early = note({ staff: 2, startBeat: 0, step: 'G' })
  const staff1Later = note({ staff: 1, startBeat: 2, step: 'E' })
  const staff1Early = note({ staff: 1, startBeat: 0, step: 'C' })
  const notes = [staff2Early, staff1Later, staff1Early]

  assert.equal(resolveCanonicalNoteFromScoreRef(notes, { partId: 'P1', measureIndex: 0, noteIndex: 0, voice: 1 }).note, staff1Early)
  assert.equal(resolveCanonicalNoteFromScoreRef(notes, { partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 }).note, staff1Later)
  assert.equal(resolveCanonicalNoteFromScoreRef(notes, { partId: 'P1', measureIndex: 0, noteIndex: 2, voice: 1 }).note, staff2Early)
})

test('rests remain in traversal ordinal but cannot become a canonical selectable hit', () => {
  const first = note({ startBeat: 0 })
  const rest = note({ startBeat: 1, isRest: true })
  const afterRest = note({ startBeat: 2 })
  const notes = [first, rest, afterRest]

  assert.equal(resolveCanonicalNoteFromScoreRef(notes, { partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 }), null)
  assert.equal(resolveCanonicalNoteFromScoreRef(notes, { partId: 'P1', measureIndex: 0, noteIndex: 2, voice: 1 }).note, afterRest)
  assert.deepEqual(deriveScoreNoteRefForCanonicalNote(notes, 2), { partId: 'P1', measureIndex: 0, noteIndex: 2, voice: 1 })
})

test('chord members preserve canonical MusicXML source order as the final exact tie-break', () => {
  const chordRoot = note({ startBeat: 0, isChordNote: false, step: 'C' })
  const chordSecond = note({ startBeat: 0, isChordNote: true, step: 'E' })
  const notes = [chordRoot, chordSecond]

  assert.equal(resolveCanonicalNoteFromScoreRef(notes, { partId: 'P1', measureIndex: 0, noteIndex: 0, voice: 1 }).note, chordRoot)
  assert.equal(resolveCanonicalNoteFromScoreRef(notes, { partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 }).note, chordSecond)
  assert.deepEqual(deriveScoreNoteRefForCanonicalNote(notes, 1), { partId: 'P1', measureIndex: 0, noteIndex: 1, voice: 1 })
})

test('voice filtering is exact and ambiguous/unstructured canonical data fails closed', () => {
  const voice1 = note({ voice: 1, startBeat: 0 })
  const voice2 = note({ voice: 2, startBeat: 0 })
  const notes = [voice1, voice2]
  assert.equal(resolveCanonicalNoteFromScoreRef(notes, { partId: 'P1', measureIndex: 0, noteIndex: 0, voice: 2 }).note, voice2)

  assert.equal(resolveCanonicalNoteFromScoreRef([{ ...voice1, staff: undefined }], { partId: 'P1', measureIndex: 0, noteIndex: 0, voice: 1 }), null)
  assert.equal(deriveScoreNoteRefForCanonicalNote([{ ...voice1, voice: undefined }], 0), null)
  assert.equal(resolveCanonicalNoteFromScoreRef(notes, { partId: 'P1', measureIndex: 0, noteIndex: 99, voice: 1 }), null)
})
