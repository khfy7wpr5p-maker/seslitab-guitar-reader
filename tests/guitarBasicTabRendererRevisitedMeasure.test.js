import test from 'node:test'
import assert from 'node:assert/strict'

import { createCanonicalNote } from '../canonicalNoteModel.js'
import { projectCanonicalNotesToBasicGuitarTab } from '../guitarBasicTabProjection.js'
import {
  BASIC_GUITAR_TAB_RENDER_STATE,
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

test('Package 4D accepts a genuine 4C projection when source order revisits a physical measure', () => {
  const projection = projectCanonicalNotesToBasicGuitarTab([
    makeCanonicalNote({ measureKey: 'P1:0', measureIndex: 0, measureNumber: 1, startBeat: 0, step: 'E' }),
    makeCanonicalNote({ measureKey: 'P1:1', measureIndex: 1, measureNumber: 2, startBeat: 0, step: 'G' }),
    makeCanonicalNote({ measureKey: 'P1:0', measureIndex: 0, measureNumber: 1, startBeat: 1, step: 'F' }),
  ])

  assert.equal(projection.state, 'projected')
  assert.deepEqual(projection.measures.map((measure) => measure.measureKey), ['P1:0', 'P1:1'])
  assert.deepEqual(projection.measures[0].events.map((event) => event.noteIndex), [0, 2])
  assert.deepEqual(projection.measures[1].events.map((event) => event.noteIndex), [1])

  const result = renderBasicGuitarTabProjection(projection)

  assert.equal(result.state, BASIC_GUITAR_TAB_RENDER_STATE.RENDERED)
  assert.equal(result.noteCount, 3)
  assert.equal(result.measureCount, 2)
  assert.deepEqual(result.measures.map((measure) => measure.measureKey), ['P1:0', 'P1:1'])
  assert.equal(result.measures[0].eventCount, 2)
  assert.equal(result.measures[1].eventCount, 1)
})

test('Package 4D still rejects duplicate or missing noteIndex evidence', () => {
  const projection = projectCanonicalNotesToBasicGuitarTab([
    makeCanonicalNote({ startBeat: 0 }),
    makeCanonicalNote({ startBeat: 1, step: 'F' }),
  ])

  const duplicate = structuredClone(projection)
  duplicate.measures[0].events[1].noteIndex = 0
  const duplicateResult = renderBasicGuitarTabProjection(duplicate)
  assert.equal(duplicateResult.state, BASIC_GUITAR_TAB_RENDER_STATE.INVALID)
  assert.equal(duplicateResult.reason, 'projection-note-index-duplicate')
  assert.equal(duplicateResult.text, '')

  const missing = structuredClone(projection)
  missing.measures[0].events[1].noteIndex = 2
  const missingResult = renderBasicGuitarTabProjection(missing)
  assert.equal(missingResult.state, BASIC_GUITAR_TAB_RENDER_STATE.INVALID)
  assert.equal(missingResult.reason, 'projection-note-index-invalid')
  assert.equal(missingResult.text, '')
})
