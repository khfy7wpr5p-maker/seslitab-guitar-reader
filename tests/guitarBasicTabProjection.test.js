import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { createCanonicalNote } from '../canonicalNoteModel.js'
import {
  BASIC_GUITAR_TAB_PROJECTION_STATE,
  projectCanonicalNotesToBasicGuitarTab,
} from '../guitarBasicTabProjection.js'

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
    isChordNote: false,
    isGrace: false,
    tieStart: false,
    tieStop: false,
    step: 'E',
    alter: 0,
    octave: 4,
    ...overrides,
  })
}

test('Package 4C projects sequential canonical notes with exact original NoteObject references', () => {
  const first = makeCanonicalNote({ step: 'E', octave: 4, startBeat: 0 })
  const second = makeCanonicalNote({ step: 'F', octave: 4, startBeat: 1 })
  const notes = [first, second]

  const result = projectCanonicalNotesToBasicGuitarTab(notes)

  assert.equal(result.state, BASIC_GUITAR_TAB_PROJECTION_STATE.PROJECTED)
  assert.equal(result.policyId, 'lowest-fret-v1')
  assert.equal(result.provenance, 'generated-basic')
  assert.equal(result.sourceFingeringClaimed, false)
  assert.equal(result.noteCount, 2)
  assert.equal(result.measureCount, 1)
  assert.equal(result.measures[0].events[0].note, first)
  assert.equal(result.measures[0].events[1].note, second)
  assert.deepEqual(result.measures[0].events.map((event) => event.position?.fret), [2, 3])
})

test('Package 4C duplicate visible measure numbers remain distinct through canonical measureKey', () => {
  const notes = [
    makeCanonicalNote({ measureNumber: 1, measureKey: 'P1:0', measureIndex: 0, startBeat: 0 }),
    makeCanonicalNote({ measureNumber: 1, measureKey: 'P1:1', measureIndex: 1, startBeat: 0, step: 'G' }),
  ]

  const result = projectCanonicalNotesToBasicGuitarTab(notes)

  assert.equal(result.state, BASIC_GUITAR_TAB_PROJECTION_STATE.PROJECTED)
  assert.equal(result.measureCount, 2)
  assert.deepEqual(result.measures.map((measure) => measure.measureNumber), [1, 1])
  assert.deepEqual(result.measures.map((measure) => measure.measureKey), ['P1:0', 'P1:1'])
})

test('Package 4C preserves rests without inventing a fret', () => {
  const rest = makeCanonicalNote({
    isRest: true,
    step: null,
    alter: null,
    octave: null,
    startBeat: 0,
  })
  const note = makeCanonicalNote({ startBeat: 1 })

  const result = projectCanonicalNotesToBasicGuitarTab([rest, note])

  assert.equal(result.state, BASIC_GUITAR_TAB_PROJECTION_STATE.PROJECTED)
  assert.equal(result.measures[0].events[0].isRest, true)
  assert.equal(result.measures[0].events[0].position, null)
  assert.equal(result.measures[0].events[0].note, rest)
})

test('Package 4C unplayable pitch aborts the whole projection with no partial TAB', () => {
  const notes = [
    makeCanonicalNote({ step: 'E', octave: 4, startBeat: 0 }),
    makeCanonicalNote({ step: 'E', octave: 2, startBeat: 1 }),
  ]

  const result = projectCanonicalNotesToBasicGuitarTab(notes)

  assert.equal(result.state, BASIC_GUITAR_TAB_PROJECTION_STATE.UNPLAYABLE)
  assert.equal(result.reason, 'no-basic-guitar-position')
  assert.equal(result.blockingNoteIndex, 1)
  assert.deepEqual(result.measures, [])
  assert.equal(result.noteCount, 0)
})

test('Package 4C chord continuation is delegated to the advanced Guitar TAB package', () => {
  const notes = [
    makeCanonicalNote({ startBeat: 0 }),
    makeCanonicalNote({ startBeat: 0, step: 'G', isChordNote: true }),
  ]

  const result = projectCanonicalNotesToBasicGuitarTab(notes)

  assert.equal(result.state, BASIC_GUITAR_TAB_PROJECTION_STATE.ADVANCED_REQUIRED)
  assert.equal(result.reason, 'chord-structure')
  assert.equal(result.blockingNoteIndex, 1)
  assert.deepEqual(result.measures, [])
})

test('Package 4C independent simultaneous pitched events are never flattened into sequential basic TAB', () => {
  const notes = [
    makeCanonicalNote({ startBeat: 0, voice: 1 }),
    makeCanonicalNote({ startBeat: 0, step: 'G', voice: 1 }),
  ]

  const result = projectCanonicalNotesToBasicGuitarTab(notes)

  assert.equal(result.state, BASIC_GUITAR_TAB_PROJECTION_STATE.ADVANCED_REQUIRED)
  assert.equal(result.reason, 'simultaneous-pitched-events')
  assert.deepEqual(result.measures, [])
})

test('Package 4C multiple pitched voices require the advanced package even when their onsets are sequential', () => {
  const notes = [
    makeCanonicalNote({ startBeat: 0, voice: 1 }),
    makeCanonicalNote({ startBeat: 1, step: 'G', voice: 2 }),
  ]

  const result = projectCanonicalNotesToBasicGuitarTab(notes)

  assert.equal(result.state, BASIC_GUITAR_TAB_PROJECTION_STATE.ADVANCED_REQUIRED)
  assert.equal(result.reason, 'multiple-voices')
  assert.equal(result.blockingNoteIndex, 1)
})

test('Package 4C multiple parts or multiple pitched staves require advanced handling', () => {
  const multipleParts = projectCanonicalNotesToBasicGuitarTab([
    makeCanonicalNote({ startBeat: 0, partId: 'P1', partIndex: 0 }),
    makeCanonicalNote({ startBeat: 1, partId: 'P2', partIndex: 1 }),
  ])
  assert.equal(multipleParts.state, BASIC_GUITAR_TAB_PROJECTION_STATE.ADVANCED_REQUIRED)
  assert.equal(multipleParts.reason, 'multiple-parts')

  const multipleStaves = projectCanonicalNotesToBasicGuitarTab([
    makeCanonicalNote({ startBeat: 0, staff: 1 }),
    makeCanonicalNote({ startBeat: 1, staff: 2 }),
  ])
  assert.equal(multipleStaves.state, BASIC_GUITAR_TAB_PROJECTION_STATE.ADVANCED_REQUIRED)
  assert.equal(multipleStaves.reason, 'multiple-staves')
})

test('Package 4C canonical grace note may share the next onset without being mislabeled as independent polyphony', () => {
  const grace = makeCanonicalNote({
    startBeat: 0,
    beats: 0,
    durationValue: 0,
    isGrace: true,
    step: 'D',
  })
  const main = makeCanonicalNote({ startBeat: 0, step: 'E' })

  const result = projectCanonicalNotesToBasicGuitarTab([grace, main])

  assert.equal(result.state, BASIC_GUITAR_TAB_PROJECTION_STATE.PROJECTED)
  assert.equal(result.measures[0].events[0].isGrace, true)
  assert.equal(result.measures[0].events[0].note, grace)
  assert.equal(result.measures[0].events[1].note, main)
})

test('Package 4C tie metadata and position remain evidence, not a new attack/fingering claim', () => {
  const start = makeCanonicalNote({ startBeat: 0, beats: 2, tieStart: true })
  const stop = makeCanonicalNote({
    measureKey: 'P1:1',
    measureIndex: 1,
    measureNumber: 2,
    startBeat: 0,
    beats: 2,
    tieStop: true,
  })

  const result = projectCanonicalNotesToBasicGuitarTab([start, stop])

  assert.equal(result.state, BASIC_GUITAR_TAB_PROJECTION_STATE.PROJECTED)
  assert.equal(result.measures[0].events[0].tieStart, true)
  assert.equal(result.measures[1].events[0].tieStop, true)
  assert.deepEqual(result.measures[0].events[0].position, result.measures[1].events[0].position)
})

test('Package 4C missing physical measure identity fails closed instead of grouping by visible number', () => {
  const result = projectCanonicalNotesToBasicGuitarTab([
    makeCanonicalNote({ measureKey: null }),
  ])

  assert.equal(result.state, BASIC_GUITAR_TAB_PROJECTION_STATE.INVALID)
  assert.equal(result.reason, 'canonical-physical-identity-required')
  assert.equal(result.blockingNoteIndex, 0)
  assert.deepEqual(result.measures, [])
})

test('Package 4C conflicting physical metadata for one measureKey fails closed', () => {
  const result = projectCanonicalNotesToBasicGuitarTab([
    makeCanonicalNote({ measureKey: 'P1:0', measureIndex: 0, startBeat: 0 }),
    makeCanonicalNote({ measureKey: 'P1:0', measureIndex: 1, startBeat: 1 }),
  ])

  assert.equal(result.state, BASIC_GUITAR_TAB_PROJECTION_STATE.INVALID)
  assert.equal(result.reason, 'conflicting-measure-identity')
  assert.deepEqual(result.measures, [])
})

test('Package 4C is deterministic, freezes projection containers, and never mutates input notes', () => {
  const notes = [
    makeCanonicalNote({ startBeat: 0 }),
    makeCanonicalNote({ startBeat: 1, step: 'F' }),
  ]
  const before = structuredClone(notes)

  const first = projectCanonicalNotesToBasicGuitarTab(notes)
  const second = projectCanonicalNotesToBasicGuitarTab(notes)

  assert.deepEqual(first, second)
  assert.deepEqual(notes, before)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.measures), true)
  assert.equal(Object.isFrozen(first.measures[0]), true)
  assert.equal(Object.isFrozen(first.measures[0].events), true)
  assert.equal(Object.isFrozen(first.measures[0].events[0]), true)
  assert.equal(first.measures[0].events[0].note, notes[0])
})

test('Package 4C source has no production OMR/gateway/quality-gate/consumer binding activation', async () => {
  const source = await readFile(new URL('../guitarBasicTabProjection.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /AudiverisProvider|omrWorker|omrProvider|gatewayProvider|omrService/)
  assert.doesNotMatch(source, /canonicalConsumerBindings|qualityGateIntegration/)
  assert.doesNotMatch(source, /note\.grace\b/)
})
