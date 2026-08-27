import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { createCanonicalNote } from '../canonicalNoteModel.js'
import {
  BASIC_GUITAR_MAX_FRET,
  BASIC_GUITAR_TUNING,
  BASIC_GUITAR_WRITTEN_TRANSPOSITION,
  GUITAR_POSITION_CANDIDATE_STATE,
  enumerateCanonicalGuitarPositionCandidates,
} from '../guitarPositionResolver.js'

function makeCanonicalNote(overrides = {}) {
  return createCanonicalNote({
    measureNumber: 1,
    measureKey: 'P1:0',
    measureIndex: 0,
    partId: 'P1',
    partIndex: 0,
    startBeat: 0,
    duration: 'quarter',
    beats: 1,
    durationValue: 4,
    divisions: 4,
    dotCount: 0,
    voice: 1,
    staff: 1,
    isRest: false,
    step: 'E',
    alter: 0,
    octave: 4,
    ...overrides,
  })
}

test('Package 4A standard tuning contract is immutable and keeps the existing 24-fret boundary', () => {
  assert.equal(BASIC_GUITAR_MAX_FRET, 24)
  assert.equal(BASIC_GUITAR_WRITTEN_TRANSPOSITION, -12)
  assert.deepEqual(
    BASIC_GUITAR_TUNING.map(({ stringNumber, stringLetter, openMidi }) => ({ stringNumber, stringLetter, openMidi })),
    [
      { stringNumber: 1, stringLetter: 'e', openMidi: 64 },
      { stringNumber: 2, stringLetter: 'B', openMidi: 59 },
      { stringNumber: 3, stringLetter: 'G', openMidi: 55 },
      { stringNumber: 4, stringLetter: 'D', openMidi: 50 },
      { stringNumber: 5, stringLetter: 'A', openMidi: 45 },
      { stringNumber: 6, stringLetter: 'E', openMidi: 40 },
    ],
  )
  assert.equal(Object.isFrozen(BASIC_GUITAR_TUNING), true)
  assert.equal(BASIC_GUITAR_TUNING.every(Object.isFrozen), true)
})

test('Package 4A written E4 preserves the existing octave-transposed guitar mapping candidates', () => {
  const result = enumerateCanonicalGuitarPositionCandidates(makeCanonicalNote({ step: 'E', octave: 4 }))

  assert.equal(result.state, GUITAR_POSITION_CANDIDATE_STATE.CANDIDATES)
  assert.equal(result.writtenMidi, 64)
  assert.equal(result.mappingMidi, 52)
  assert.deepEqual(
    result.candidates.map(({ stringNumber, stringLetter, fret }) => ({ stringNumber, stringLetter, fret })),
    [
      { stringNumber: 4, stringLetter: 'D', fret: 2 },
      { stringNumber: 5, stringLetter: 'A', fret: 7 },
      { stringNumber: 6, stringLetter: 'E', fret: 12 },
    ],
  )
})

test('Package 4A written E5 includes first-string open E and every basic alternative through fret 24', () => {
  const result = enumerateCanonicalGuitarPositionCandidates(makeCanonicalNote({ step: 'E', octave: 5 }))

  assert.equal(result.state, GUITAR_POSITION_CANDIDATE_STATE.CANDIDATES)
  assert.equal(result.writtenMidi, 76)
  assert.equal(result.mappingMidi, 64)
  assert.deepEqual(
    result.candidates.map(({ stringNumber, stringLetter, fret }) => ({ stringNumber, stringLetter, fret })),
    [
      { stringNumber: 1, stringLetter: 'e', fret: 0 },
      { stringNumber: 2, stringLetter: 'B', fret: 5 },
      { stringNumber: 3, stringLetter: 'G', fret: 9 },
      { stringNumber: 4, stringLetter: 'D', fret: 14 },
      { stringNumber: 5, stringLetter: 'A', fret: 19 },
      { stringNumber: 6, stringLetter: 'E', fret: 24 },
    ],
  )
})

test('Package 4A never invents e0 when the written pitch has no basic guitar position', () => {
  const result = enumerateCanonicalGuitarPositionCandidates(makeCanonicalNote({ step: 'E', octave: 2 }))

  assert.equal(result.state, GUITAR_POSITION_CANDIDATE_STATE.UNPLAYABLE)
  assert.equal(result.reason, 'no-basic-guitar-position')
  assert.deepEqual(result.candidates, [])
})

test('Package 4A rests produce no pitch or fingering candidate', () => {
  const result = enumerateCanonicalGuitarPositionCandidates(makeCanonicalNote({
    isRest: true,
    step: null,
    alter: null,
    octave: null,
  }))

  assert.equal(result.state, GUITAR_POSITION_CANDIDATE_STATE.REST)
  assert.equal(result.writtenMidi, null)
  assert.equal(result.mappingMidi, null)
  assert.deepEqual(result.candidates, [])
})

test('Package 4A rejects legacy/non-canonical note shapes instead of silently promoting them', () => {
  const result = enumerateCanonicalGuitarPositionCandidates({ step: 'E', alter: 0, octave: 4 })

  assert.equal(result.state, GUITAR_POSITION_CANDIDATE_STATE.INVALID)
  assert.equal(result.reason, 'canonical-note-required')
  assert.deepEqual(result.candidates, [])
})

test('Package 4A requires written MusicXML pitch and does not substitute unrelated MIDI/string fields', () => {
  const result = enumerateCanonicalGuitarPositionCandidates(makeCanonicalNote({
    step: null,
    octave: null,
    midi: 64,
    stringLetter: 'e',
    fret: 0,
  }))

  assert.equal(result.state, GUITAR_POSITION_CANDIDATE_STATE.INVALID)
  assert.equal(result.reason, 'missing-written-pitch')
})

test('Package 4A invalid written pitch fails closed', () => {
  const result = enumerateCanonicalGuitarPositionCandidates(makeCanonicalNote({ step: 'H', octave: 4 }))

  assert.equal(result.state, GUITAR_POSITION_CANDIDATE_STATE.INVALID)
  assert.equal(result.reason, 'invalid-step')
  assert.deepEqual(result.candidates, [])
})

test('Package 4A result is deterministic, deeply frozen at its public containers, and never mutates the canonical note', () => {
  const note = makeCanonicalNote({ step: 'C', alter: 1, octave: 5 })
  const before = structuredClone(note)

  const first = enumerateCanonicalGuitarPositionCandidates(note)
  const second = enumerateCanonicalGuitarPositionCandidates(note)

  assert.deepEqual(first, second)
  assert.deepEqual(note, before)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.candidates), true)
  assert.equal(first.candidates.every(Object.isFrozen), true)
})

test('Package 4A source has no production OMR/gateway imports and does not activate Guitar TAB consumer wiring', async () => {
  const source = await readFile(new URL('../guitarPositionResolver.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /AudiverisProvider|omrWorker|omrProvider|gatewayProvider|omrService/)
  assert.doesNotMatch(source, /canonicalConsumerBindings|qualityGateIntegration/)
})
