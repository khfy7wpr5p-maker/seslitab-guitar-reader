import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { createCanonicalNote } from '../canonicalNoteModel.js'
import { projectCanonicalNotesToBasicGuitarTab } from '../guitarBasicTabProjection.js'
import {
  BASIC_GUITAR_TAB_RENDER_STATE,
  BASIC_GUITAR_TAB_FORMAT_ID,
  renderBasicGuitarTabProjection,
} from '../guitarBasicTabRenderer.js'

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

function makeManualProjection(position = { stringNumber: 1, stringLetter: 'e', fret: 10 }) {
  const note = Object.freeze({ source: 'manual-render-contract-fixture' })
  return {
    state: 'projected',
    reason: null,
    blockingNoteIndex: null,
    policyId: 'lowest-fret-v1',
    provenance: 'generated-basic',
    sourceFingeringClaimed: false,
    noteCount: 1,
    measureCount: 1,
    measures: [
      {
        measureKey: 'P1:0',
        measureIndex: 0,
        measureNumber: 1,
        partId: 'P1',
        partIndex: 0,
        events: [
          {
            noteIndex: 0,
            note,
            measureKey: 'P1:0',
            measureIndex: 0,
            startBeat: 0,
            beats: 1,
            voice: 1,
            staff: 1,
            isRest: false,
            isGrace: false,
            tieStart: false,
            tieStop: false,
            policyId: 'lowest-fret-v1',
            provenance: 'generated-basic',
            sourceFingeringClaimed: false,
            position,
          },
        ],
      },
    ],
  }
}

test('Package 4D renders a 4C monophonic projection as deterministic six-line ASCII TAB', () => {
  const projection = projectCanonicalNotesToBasicGuitarTab([
    makeCanonicalNote({ step: 'E', octave: 4, startBeat: 0 }),
    makeCanonicalNote({ step: 'F', octave: 4, startBeat: 1 }),
  ])

  const result = renderBasicGuitarTabProjection(projection)

  assert.equal(result.state, BASIC_GUITAR_TAB_RENDER_STATE.RENDERED)
  assert.equal(result.formatId, BASIC_GUITAR_TAB_FORMAT_ID)
  assert.equal(result.policyId, 'lowest-fret-v1')
  assert.equal(result.provenance, 'generated-basic')
  assert.equal(result.sourceFingeringClaimed, false)
  assert.equal(result.noteCount, 2)
  assert.equal(result.measureCount, 1)
  assert.equal(result.text, [
    'e|--------|',
    'B|--------|',
    'G|--------|',
    'D|-2---3--|',
    'A|--------|',
    'E|--------|',
  ].join('\n'))
})

test('Package 4D uses fixed-width cells so two-digit frets do not shift later events', () => {
  const result = renderBasicGuitarTabProjection(makeManualProjection())

  assert.equal(result.state, BASIC_GUITAR_TAB_RENDER_STATE.RENDERED)
  assert.equal(result.cellWidth, 4)
  assert.equal(result.text.split('\n')[0], 'e|-10-|')
  assert.equal(result.measures[0].lines[0].body, '-10-')
})

test('Package 4D preserves physical measure identity even when visible measure numbers repeat', () => {
  const projection = projectCanonicalNotesToBasicGuitarTab([
    makeCanonicalNote({ measureNumber: 1, measureKey: 'P1:0', measureIndex: 0, startBeat: 0 }),
    makeCanonicalNote({ measureNumber: 1, measureKey: 'P1:1', measureIndex: 1, startBeat: 0, step: 'G' }),
  ])

  const result = renderBasicGuitarTabProjection(projection)

  assert.equal(result.state, BASIC_GUITAR_TAB_RENDER_STATE.RENDERED)
  assert.deepEqual(result.measures.map((measure) => measure.measureNumber), [1, 1])
  assert.deepEqual(result.measures.map((measure) => measure.measureKey), ['P1:0', 'P1:1'])
  assert.equal(result.text.split('\n\n').length, 2)
})

test('Package 4D renders rests as empty fixed-width slots without inventing fret or pitch', () => {
  const projection = projectCanonicalNotesToBasicGuitarTab([
    makeCanonicalNote({
      isRest: true,
      step: null,
      alter: null,
      octave: null,
      startBeat: 0,
    }),
    makeCanonicalNote({ startBeat: 1 }),
  ])

  const result = renderBasicGuitarTabProjection(projection)

  assert.equal(result.state, BASIC_GUITAR_TAB_RENDER_STATE.RENDERED)
  assert.equal(result.measures[0].eventCount, 2)
  assert.equal(result.text.split('\n')[3], 'D|-----2--|')
  assert.equal(result.rhythmEncoded, false)
})

test('Package 4D keeps grace and tie semantics outside ASCII instead of inventing notation symbols', () => {
  const projection = projectCanonicalNotesToBasicGuitarTab([
    makeCanonicalNote({
      step: 'D',
      startBeat: 0,
      beats: 0,
      durationValue: 0,
      isGrace: true,
    }),
    makeCanonicalNote({ step: 'E', startBeat: 0, tieStart: true }),
  ])

  const result = renderBasicGuitarTabProjection(projection)

  assert.equal(result.state, BASIC_GUITAR_TAB_RENDER_STATE.RENDERED)
  assert.equal(result.graceEncoded, false)
  assert.equal(result.tieEncoded, false)
  assert.equal(result.roundTripLossless, false)
  assert.doesNotMatch(result.text, /~/)
})

test('Package 4D refuses non-projected 4C results and never emits partial TAB', () => {
  const projection = projectCanonicalNotesToBasicGuitarTab([
    makeCanonicalNote({ step: 'E', octave: 2 }),
  ])

  const result = renderBasicGuitarTabProjection(projection)

  assert.equal(result.state, BASIC_GUITAR_TAB_RENDER_STATE.NOT_RENDERABLE)
  assert.equal(result.reason, 'projection-not-renderable')
  assert.equal(result.text, '')
  assert.deepEqual(result.measures, [])
  assert.equal(result.noteCount, 0)
})

test('Package 4D fails closed on malformed string/fret position evidence', () => {
  const badString = makeManualProjection({ stringNumber: 7, stringLetter: 'e', fret: 3 })
  const badLetter = makeManualProjection({ stringNumber: 4, stringLetter: 'A', fret: 3 })
  const badFret = makeManualProjection({ stringNumber: 1, stringLetter: 'e', fret: 25 })

  for (const projection of [badString, badLetter, badFret]) {
    const result = renderBasicGuitarTabProjection(projection)
    assert.equal(result.state, BASIC_GUITAR_TAB_RENDER_STATE.INVALID)
    assert.equal(result.text, '')
    assert.deepEqual(result.measures, [])
  }
})

test('Package 4D rejects incomplete or contradictory projection counts and event identity', () => {
  const countMismatch = structuredClone(makeManualProjection())
  countMismatch.noteCount = 2

  const identityMismatch = structuredClone(makeManualProjection())
  identityMismatch.measures[0].events[0].measureKey = 'P1:other'

  const policyMismatch = structuredClone(makeManualProjection())
  policyMismatch.measures[0].events[0].policyId = 'other-policy'

  for (const projection of [countMismatch, identityMismatch, policyMismatch]) {
    const result = renderBasicGuitarTabProjection(projection)
    assert.equal(result.state, BASIC_GUITAR_TAB_RENDER_STATE.INVALID)
    assert.equal(result.text, '')
  }
})

test('Package 4D is deterministic, deeply freezes renderer containers, and never mutates projection input', () => {
  const projection = projectCanonicalNotesToBasicGuitarTab([
    makeCanonicalNote({ startBeat: 0 }),
    makeCanonicalNote({ startBeat: 1, step: 'F' }),
  ])
  const before = structuredClone(projection)

  const first = renderBasicGuitarTabProjection(projection)
  const second = renderBasicGuitarTabProjection(projection)

  assert.deepEqual(first, second)
  assert.deepEqual(projection, before)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.stringOrder), true)
  assert.equal(Object.isFrozen(first.measures), true)
  assert.equal(Object.isFrozen(first.measures[0]), true)
  assert.equal(Object.isFrozen(first.measures[0].lines), true)
  assert.equal(Object.isFrozen(first.measures[0].lines[0]), true)
})

test('Package 4D source remains a pure renderer and does not activate production Guitar TAB or OMR boundaries', async () => {
  const source = await readFile(new URL('../guitarBasicTabRenderer.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /AudiverisProvider|omrWorker|omrProvider|gatewayProvider|omrService/)
  assert.doesNotMatch(source, /canonicalConsumerBindings|qualityGateIntegration/)
  assert.doesNotMatch(source, /tabParser|musicXmlParser/)
  assert.doesNotMatch(source, /document\.|window\.|fetch\(/)
})
