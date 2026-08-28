import test from 'node:test'
import assert from 'node:assert/strict'

import {
  HARMONY_PARSE_STATE,
  HARMONY_TIMING_STATE,
  normalizeHarmonyDescriptor,
} from '../musicXmlHarmonyParser.js'
import {
  CHORD_PRESENTATION_STATE,
  buildChordPresentationModel,
} from '../src/services/chordPresentation.js'

function event(descriptor, overrides = {}) {
  return Object.freeze({
    ...descriptor,
    partId: 'P1',
    partIndex: 0,
    measureNumber: 1,
    measureNumberText: '1',
    measureIndex: 0,
    measureKey: 'P1:0',
    sequenceIndex: 0,
    divisions: 4,
    offsetDivisions: 0,
    startDivisions: 4,
    startBeat: 1,
    timingState: HARMONY_TIMING_STATE.MEASURED,
    ...overrides,
  })
}

function result(harmonies) {
  return Object.freeze({
    state: HARMONY_PARSE_STATE.PARSED,
    harmonies: Object.freeze(harmonies),
    parts: Object.freeze([]),
  })
}

test('Package 7A review regression: contradictory redundant timing evidence fails closed', () => {
  const descriptor = normalizeHarmonyDescriptor({ rootStep: 'G', kindValue: 'dominant' })
  const corrupted = event(descriptor, {
    divisions: 4,
    startDivisions: 4,
    startBeat: 2,
  })

  const model = buildChordPresentationModel(result([corrupted]))
  assert.equal(model.state, CHORD_PRESENTATION_STATE.INVALID)
  assert.equal(model.items.length, 0)
  assert.equal(model.displayText, '')
  assert.equal(model.spokenText, '')
})

test('Package 7A review regression: N.C. with inversion metadata fails closed', () => {
  const descriptor = normalizeHarmonyDescriptor({ kindValue: 'none', inversion: 1 })
  assert.equal(descriptor.state, HARMONY_PARSE_STATE.PARSED)
  assert.equal(descriptor.symbol, 'N.C.')

  const model = buildChordPresentationModel(result([event(descriptor)]))
  assert.equal(model.state, CHORD_PRESENTATION_STATE.INVALID)
  assert.equal(model.items.length, 0)
})

test('Package 7A review regression: N.C. with degree metadata fails closed', () => {
  const descriptor = normalizeHarmonyDescriptor({
    kindValue: 'none',
    degrees: [{ type: 'add', value: 9, alter: 0 }],
  })
  assert.equal(descriptor.state, HARMONY_PARSE_STATE.PARSED)

  const model = buildChordPresentationModel(result([event(descriptor)]))
  assert.equal(model.state, CHORD_PRESENTATION_STATE.INVALID)
  assert.equal(model.displayText, '')
  assert.equal(model.spokenText, '')
})
