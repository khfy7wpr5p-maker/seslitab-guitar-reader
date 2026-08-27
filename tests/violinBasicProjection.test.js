import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { createCanonicalNote } from '../canonicalNoteModel.js'
import {
  BASIC_VIOLIN_PROJECTION_STATE,
  projectCanonicalNotesToBasicViolin,
} from '../violinBasicProjection.js'

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
    isChord: false,
    isChordNote: false,
    chordNotes: null,
    isGrace: false,
    tieStart: false,
    tieStop: false,
    step: 'G',
    alter: 0,
    octave: 3,
    ...overrides,
  })
}

test('Package 5C projects unique sequential first-position notes with exact original NoteObject references', () => {
  const first = makeCanonicalNote({ step: 'G', octave: 3, startBeat: 0 })
  const second = makeCanonicalNote({ step: 'A', octave: 3, startBeat: 1 })
  const third = makeCanonicalNote({ step: 'B', octave: 3, startBeat: 2 })
  const notes = [first, second, third]

  const result = projectCanonicalNotesToBasicViolin(notes)

  assert.equal(result.state, BASIC_VIOLIN_PROJECTION_STATE.PROJECTED)
  assert.equal(result.policyId, 'first-position-semitone-zone-v1')
  assert.equal(result.provenance, 'generated-basic-first-position-fingering')
  assert.equal(result.teacherApproved, false)
  assert.equal(result.noteCount, 3)
  assert.equal(result.measureCount, 1)
  assert.equal(result.measures[0].events[0].note, first)
  assert.equal(result.measures[0].events[1].note, second)
  assert.equal(result.measures[0].events[2].note, third)
  assert.deepEqual(
    result.measures[0].events.map(({ fingering }) => ({
      stringNumber: fingering.stringNumber,
      semitoneOffset: fingering.semitoneOffset,
      fingerNumber: fingering.fingerNumber,
    })),
    [
      { stringNumber: 4, semitoneOffset: 0, fingerNumber: 0 },
      { stringNumber: 4, semitoneOffset: 2, fingerNumber: 1 },
      { stringNumber: 4, semitoneOffset: 4, fingerNumber: 2 },
    ],
  )
})

test('Package 5C duplicate visible measure numbers remain distinct through canonical measureKey', () => {
  const notes = [
    makeCanonicalNote({
      measureNumber: 1,
      measureKey: 'P1:0',
      measureIndex: 0,
      startBeat: 0,
      step: 'G',
      octave: 3,
    }),
    makeCanonicalNote({
      measureNumber: 1,
      measureKey: 'P1:1',
      measureIndex: 1,
      startBeat: 0,
      step: 'A',
      octave: 3,
    }),
  ]

  const result = projectCanonicalNotesToBasicViolin(notes)

  assert.equal(result.state, BASIC_VIOLIN_PROJECTION_STATE.PROJECTED)
  assert.equal(result.measureCount, 2)
  assert.deepEqual(result.measures.map(({ measureNumber }) => measureNumber), [1, 1])
  assert.deepEqual(result.measures.map(({ measureKey }) => measureKey), ['P1:0', 'P1:1'])
})

test('Package 5C preserves rests with no invented violin fingering', () => {
  const rest = makeCanonicalNote({
    isRest: true,
    step: null,
    alter: null,
    octave: null,
    startBeat: 0,
  })
  const note = makeCanonicalNote({ step: 'A', octave: 3, startBeat: 1 })

  const result = projectCanonicalNotesToBasicViolin([rest, note])

  assert.equal(result.state, BASIC_VIOLIN_PROJECTION_STATE.PROJECTED)
  assert.equal(result.measures[0].events[0].isRest, true)
  assert.equal(result.measures[0].events[0].fingering, null)
  assert.equal(result.measures[0].events[0].note, rest)
})

test('Package 5C unresolved D4 string crossing requires review and emits no partial projection', () => {
  const notes = [
    makeCanonicalNote({ step: 'G', octave: 3, startBeat: 0 }),
    makeCanonicalNote({ step: 'D', octave: 4, startBeat: 1 }),
  ]

  const result = projectCanonicalNotesToBasicViolin(notes)

  assert.equal(result.state, BASIC_VIOLIN_PROJECTION_STATE.REVIEW_REQUIRED)
  assert.equal(result.reason, 'multiple-first-position-string-candidates')
  assert.equal(result.blockingNoteIndex, 1)
  assert.equal(result.noteCount, 0)
  assert.equal(result.measureCount, 0)
  assert.deepEqual(result.measures, [])
  assert.equal(result.teacherApproved, false)
})

test('Package 5C out-of-range pitch aborts the whole projection with no fallback position', () => {
  const notes = [
    makeCanonicalNote({ step: 'G', octave: 3, startBeat: 0 }),
    makeCanonicalNote({ step: 'C', octave: 6, startBeat: 1 }),
  ]

  const result = projectCanonicalNotesToBasicViolin(notes)

  assert.equal(result.state, BASIC_VIOLIN_PROJECTION_STATE.OUT_OF_RANGE)
  assert.equal(result.reason, 'no-basic-first-position-string')
  assert.equal(result.blockingNoteIndex, 1)
  assert.deepEqual(result.measures, [])
})

test('Package 5C double-stop or chord structure is delegated to Advanced Violin', () => {
  const result = projectCanonicalNotesToBasicViolin([
    makeCanonicalNote({ step: 'A', octave: 3, startBeat: 0 }),
    makeCanonicalNote({ step: 'C', octave: 4, startBeat: 0, isChordNote: true }),
  ])

  assert.equal(result.state, BASIC_VIOLIN_PROJECTION_STATE.ADVANCED_REQUIRED)
  assert.equal(result.reason, 'double-stop-or-chord-structure')
  assert.equal(result.blockingNoteIndex, 1)
  assert.deepEqual(result.measures, [])
})

test('Package 5C independent simultaneous pitched attacks are never flattened into basic violin fingering', () => {
  const result = projectCanonicalNotesToBasicViolin([
    makeCanonicalNote({ step: 'A', octave: 3, startBeat: 0 }),
    makeCanonicalNote({ step: 'B', octave: 3, startBeat: 0 }),
  ])

  assert.equal(result.state, BASIC_VIOLIN_PROJECTION_STATE.ADVANCED_REQUIRED)
  assert.equal(result.reason, 'simultaneous-pitched-events')
  assert.equal(result.blockingNoteIndex, 1)
  assert.deepEqual(result.measures, [])
})

test('Package 5C multiple pitched voices, staves, or parts require advanced handling', () => {
  const multipleVoices = projectCanonicalNotesToBasicViolin([
    makeCanonicalNote({ step: 'A', octave: 3, startBeat: 0, voice: 1 }),
    makeCanonicalNote({ step: 'B', octave: 3, startBeat: 1, voice: 2 }),
  ])
  assert.equal(multipleVoices.state, BASIC_VIOLIN_PROJECTION_STATE.ADVANCED_REQUIRED)
  assert.equal(multipleVoices.reason, 'multiple-voices')

  const multipleStaves = projectCanonicalNotesToBasicViolin([
    makeCanonicalNote({ step: 'A', octave: 3, startBeat: 0, staff: 1 }),
    makeCanonicalNote({ step: 'B', octave: 3, startBeat: 1, staff: 2 }),
  ])
  assert.equal(multipleStaves.state, BASIC_VIOLIN_PROJECTION_STATE.ADVANCED_REQUIRED)
  assert.equal(multipleStaves.reason, 'multiple-staves')

  const multipleParts = projectCanonicalNotesToBasicViolin([
    makeCanonicalNote({ step: 'A', octave: 3, startBeat: 0, partId: 'P1', partIndex: 0 }),
    makeCanonicalNote({ step: 'B', octave: 3, startBeat: 1, partId: 'P2', partIndex: 1 }),
  ])
  assert.equal(multipleParts.state, BASIC_VIOLIN_PROJECTION_STATE.ADVANCED_REQUIRED)
  assert.equal(multipleParts.reason, 'multiple-parts')
})

test('Package 5C canonical grace note may share the next onset without being mislabeled as a double stop', () => {
  const grace = makeCanonicalNote({
    step: 'A',
    octave: 3,
    startBeat: 0,
    beats: 0,
    durationValue: 0,
    isGrace: true,
  })
  const main = makeCanonicalNote({ step: 'B', octave: 3, startBeat: 0 })

  const result = projectCanonicalNotesToBasicViolin([grace, main])

  assert.equal(result.state, BASIC_VIOLIN_PROJECTION_STATE.PROJECTED)
  assert.equal(result.measures[0].events[0].isGrace, true)
  assert.equal(result.measures[0].events[0].note, grace)
  assert.equal(result.measures[0].events[1].note, main)
})

test('Package 5C preserves tie metadata and exact generated fingering without creating teacher truth', () => {
  const start = makeCanonicalNote({
    step: 'C',
    octave: 4,
    startBeat: 0,
    beats: 2,
    tieStart: true,
  })
  const stop = makeCanonicalNote({
    step: 'C',
    octave: 4,
    measureNumber: 2,
    measureKey: 'P1:1',
    measureIndex: 1,
    startBeat: 0,
    beats: 2,
    tieStop: true,
  })

  const result = projectCanonicalNotesToBasicViolin([start, stop])

  assert.equal(result.state, BASIC_VIOLIN_PROJECTION_STATE.PROJECTED)
  assert.equal(result.measures[0].events[0].tieStart, true)
  assert.equal(result.measures[1].events[0].tieStop, true)
  assert.deepEqual(
    result.measures[0].events[0].fingering,
    result.measures[1].events[0].fingering,
  )
  assert.equal(result.measures[0].events[0].teacherApproved, false)
  assert.equal(result.measures[1].events[0].teacherApproved, false)
})

test('Package 5C missing physical measure identity fails closed instead of grouping by visible number', () => {
  const result = projectCanonicalNotesToBasicViolin([
    makeCanonicalNote({ measureKey: null }),
  ])

  assert.equal(result.state, BASIC_VIOLIN_PROJECTION_STATE.INVALID)
  assert.equal(result.reason, 'canonical-physical-identity-required')
  assert.equal(result.blockingNoteIndex, 0)
  assert.deepEqual(result.measures, [])
})

test('Package 5C rejects coercible or non-finite physical identity fields', () => {
  for (const overrides of [
    { startBeat: '0' },
    { beats: '1' },
    { measureIndex: '0' },
    { partIndex: '0' },
    { startBeat: Number.NaN },
    { beats: Number.POSITIVE_INFINITY },
    { measureIndex: -1 },
  ]) {
    const result = projectCanonicalNotesToBasicViolin([makeCanonicalNote(overrides)])
    assert.equal(result.state, BASIC_VIOLIN_PROJECTION_STATE.INVALID)
    assert.equal(result.reason, 'canonical-physical-identity-required')
    assert.deepEqual(result.measures, [])
  }
})

test('Package 5C conflicting physical metadata for one measureKey fails closed', () => {
  const result = projectCanonicalNotesToBasicViolin([
    makeCanonicalNote({
      measureKey: 'P1:0',
      measureIndex: 0,
      startBeat: 0,
      step: 'G',
      octave: 3,
    }),
    makeCanonicalNote({
      measureKey: 'P1:0',
      measureIndex: 1,
      startBeat: 1,
      step: 'A',
      octave: 3,
    }),
  ])

  assert.equal(result.state, BASIC_VIOLIN_PROJECTION_STATE.INVALID)
  assert.equal(result.reason, 'conflicting-measure-identity')
  assert.deepEqual(result.measures, [])
})

test('Package 5C is deterministic, freezes projection containers, and never mutates input notes', () => {
  const notes = [
    makeCanonicalNote({ step: 'G', octave: 3, startBeat: 0 }),
    makeCanonicalNote({ step: 'A', octave: 3, startBeat: 1 }),
  ]
  const before = structuredClone(notes)

  const first = projectCanonicalNotesToBasicViolin(notes)
  const second = projectCanonicalNotesToBasicViolin(notes)

  assert.deepEqual(first, second)
  assert.deepEqual(notes, before)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.measures), true)
  assert.equal(Object.isFrozen(first.measures[0]), true)
  assert.equal(Object.isFrozen(first.measures[0].events), true)
  assert.equal(Object.isFrozen(first.measures[0].events[0]), true)
  assert.equal(Object.isFrozen(first.measures[0].events[0].fingering), true)
  assert.equal(first.measures[0].events[0].note, notes[0])
})

test('Package 5C remains isolated and does not activate production violin, OMR, parser, or quality-gate wiring', async () => {
  const source = await readFile(
    new URL('../violinBasicProjection.js', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(
    source,
    /AudiverisProvider|omrWorker|omrProvider|gatewayProvider|omrService/,
  )
  assert.doesNotMatch(
    source,
    /canonicalConsumerBindings|qualityGateIntegration|musicXmlParser/,
  )
  assert.doesNotMatch(source, /CANONICAL_CONSUMER_TYPE/)
})
