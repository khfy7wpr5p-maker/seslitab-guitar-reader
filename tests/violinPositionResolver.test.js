import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { createCanonicalNote } from '../canonicalNoteModel.js'
import {
  BASIC_VIOLIN_FIRST_POSITION_MAX_SEMITONES,
  BASIC_VIOLIN_TUNING,
  VIOLIN_POSITION_CANDIDATE_STATE,
  enumerateCanonicalViolinFirstPositionCandidates,
} from '../violinPositionResolver.js'

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
    step: 'G',
    alter: 0,
    octave: 3,
    ...overrides,
  })
}

test('Package 5A standard violin tuning and first-position span are immutable', () => {
  assert.equal(BASIC_VIOLIN_FIRST_POSITION_MAX_SEMITONES, 7)
  assert.deepEqual(BASIC_VIOLIN_TUNING, [
    { stringNumber: 1, stringName: 'E', openMidi: 76 },
    { stringNumber: 2, stringName: 'A', openMidi: 69 },
    { stringNumber: 3, stringName: 'D', openMidi: 62 },
    { stringNumber: 4, stringName: 'G', openMidi: 55 },
  ])
  assert.equal(Object.isFrozen(BASIC_VIOLIN_TUNING), true)
  assert.equal(BASIC_VIOLIN_TUNING.every(Object.isFrozen), true)
})

test('Package 5A open G3 maps only to the fourth string with no transposition', () => {
  const result = enumerateCanonicalViolinFirstPositionCandidates(
    makeCanonicalNote({ step: 'G', octave: 3 }),
  )

  assert.equal(result.state, VIOLIN_POSITION_CANDIDATE_STATE.CANDIDATES)
  assert.equal(result.writtenMidi, 55)
  assert.deepEqual(result.candidates, [
    {
      stringNumber: 4,
      stringName: 'G',
      openMidi: 55,
      semitoneOffset: 0,
      writtenMidi: 55,
      position: 'first',
      provenance: 'generated-basic-physical-candidate',
    },
  ])
})

test('Package 5A D4 preserves both open-D and fourth-finger-equivalent G-string candidates', () => {
  const result = enumerateCanonicalViolinFirstPositionCandidates(
    makeCanonicalNote({ step: 'D', octave: 4 }),
  )

  assert.equal(result.state, VIOLIN_POSITION_CANDIDATE_STATE.CANDIDATES)
  assert.equal(result.writtenMidi, 62)
  assert.deepEqual(
    result.candidates.map(({ stringNumber, stringName, semitoneOffset }) => ({
      stringNumber,
      stringName,
      semitoneOffset,
    })),
    [
      { stringNumber: 3, stringName: 'D', semitoneOffset: 0 },
      { stringNumber: 4, stringName: 'G', semitoneOffset: 7 },
    ],
  )
})

test('Package 5A A4 and E5 retain open-string overlap ambiguity instead of choosing a fingering', () => {
  const a4 = enumerateCanonicalViolinFirstPositionCandidates(
    makeCanonicalNote({ step: 'A', octave: 4 }),
  )
  const e5 = enumerateCanonicalViolinFirstPositionCandidates(
    makeCanonicalNote({ step: 'E', octave: 5 }),
  )

  assert.deepEqual(
    a4.candidates.map(({ stringNumber, semitoneOffset }) => ({ stringNumber, semitoneOffset })),
    [
      { stringNumber: 2, semitoneOffset: 0 },
      { stringNumber: 3, semitoneOffset: 7 },
    ],
  )
  assert.deepEqual(
    e5.candidates.map(({ stringNumber, semitoneOffset }) => ({ stringNumber, semitoneOffset })),
    [
      { stringNumber: 1, semitoneOffset: 0 },
      { stringNumber: 2, semitoneOffset: 7 },
    ],
  )
})

test('Package 5A B5 is the supported first-position upper boundary on the E string', () => {
  const result = enumerateCanonicalViolinFirstPositionCandidates(
    makeCanonicalNote({ step: 'B', octave: 5 }),
  )

  assert.equal(result.state, VIOLIN_POSITION_CANDIDATE_STATE.CANDIDATES)
  assert.deepEqual(
    result.candidates.map(({ stringNumber, stringName, semitoneOffset }) => ({
      stringNumber,
      stringName,
      semitoneOffset,
    })),
    [{ stringNumber: 1, stringName: 'E', semitoneOffset: 7 }],
  )
})

test('Package 5A pitch above the first-position contract remains out of range', () => {
  const result = enumerateCanonicalViolinFirstPositionCandidates(
    makeCanonicalNote({ step: 'C', octave: 6 }),
  )

  assert.equal(result.state, VIOLIN_POSITION_CANDIDATE_STATE.OUT_OF_RANGE)
  assert.equal(result.reason, 'no-basic-first-position-string')
  assert.deepEqual(result.candidates, [])
})

test('Package 5A chromatic notes remain physical candidates without inventing finger numbers', () => {
  const result = enumerateCanonicalViolinFirstPositionCandidates(
    makeCanonicalNote({ step: 'A', alter: 1, octave: 4 }),
  )

  assert.equal(result.state, VIOLIN_POSITION_CANDIDATE_STATE.CANDIDATES)
  assert.deepEqual(
    result.candidates.map(({ stringNumber, semitoneOffset }) => ({ stringNumber, semitoneOffset })),
    [{ stringNumber: 2, semitoneOffset: 1 }],
  )
  assert.equal('fingerNumber' in result.candidates[0], false)
})

test('Package 5A rests produce no pitch or string candidate', () => {
  const result = enumerateCanonicalViolinFirstPositionCandidates(
    makeCanonicalNote({
      isRest: true,
      step: null,
      alter: null,
      octave: null,
    }),
  )

  assert.equal(result.state, VIOLIN_POSITION_CANDIDATE_STATE.REST)
  assert.equal(result.writtenMidi, null)
  assert.deepEqual(result.candidates, [])
})

test('Package 5A rejects legacy/non-canonical note shapes', () => {
  const result = enumerateCanonicalViolinFirstPositionCandidates({
    step: 'G',
    alter: 0,
    octave: 3,
  })

  assert.equal(result.state, VIOLIN_POSITION_CANDIDATE_STATE.INVALID)
  assert.equal(result.reason, 'canonical-note-required')
})

test('Package 5A requires written pitch and does not substitute unrelated guitar position fields', () => {
  const result = enumerateCanonicalViolinFirstPositionCandidates(
    makeCanonicalNote({
      step: null,
      octave: null,
      midi: 62,
      stringLetter: 'D',
      fret: 0,
    }),
  )

  assert.equal(result.state, VIOLIN_POSITION_CANDIDATE_STATE.INVALID)
  assert.equal(result.reason, 'missing-written-pitch')
})

test('Package 5A invalid written pitch fails closed', () => {
  const result = enumerateCanonicalViolinFirstPositionCandidates(
    makeCanonicalNote({ step: 'H', octave: 4 }),
  )

  assert.equal(result.state, VIOLIN_POSITION_CANDIDATE_STATE.INVALID)
  assert.equal(result.reason, 'invalid-step')
})

test('Package 5A output is deterministic, deeply frozen, and never mutates canonical input', () => {
  const note = makeCanonicalNote({ step: 'C', alter: 1, octave: 5 })
  const before = structuredClone(note)

  const first = enumerateCanonicalViolinFirstPositionCandidates(note)
  const second = enumerateCanonicalViolinFirstPositionCandidates(note)

  assert.deepEqual(first, second)
  assert.deepEqual(note, before)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.candidates), true)
  assert.equal(first.candidates.every(Object.isFrozen), true)
})

test('Package 5A remains pure and does not activate OMR, quality-gate, or violin consumer wiring', async () => {
  const source = await readFile(
    new URL('../violinPositionResolver.js', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(
    source,
    /AudiverisProvider|omrWorker|omrProvider|gatewayProvider|omrService/,
  )
  assert.doesNotMatch(source, /canonicalConsumerBindings|qualityGateIntegration/)
  assert.doesNotMatch(source, /fingerNumber\s*:/)
})
