import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ADVANCED_VIOLIN_POSITION_STATE,
  enumerateAdvancedViolinPositionCandidates,
} from '../violinAdvancedPositionResolver.js'
import {
  ADVANCED_VIOLIN_PROJECTION_STATE,
  projectCanonicalNotesToAdvancedViolin,
} from '../violinAdvancedProjection.js'

function upperRangeNote() {
  return {
    measureNumber: 1,
    measureKey: 'P1:0',
    measureIndex: 0,
    partId: 'P1',
    partIndex: 0,
    startBeat: 0,
    beats: 1,
    voice: 1,
    staff: 1,
    isRest: false,
    isGrace: false,
    tieStart: false,
    tieStop: false,
    step: 'F',
    alter: 0,
    octave: 6,
  }
}

test('Package 10 fails closed above the explicit third-position range', () => {
  const note = upperRangeNote()
  const positions = enumerateAdvancedViolinPositionCandidates(note)
  assert.equal(positions.state, ADVANCED_VIOLIN_POSITION_STATE.OUT_OF_RANGE)

  const projection = projectCanonicalNotesToAdvancedViolin([note])
  assert.equal(projection.state, ADVANCED_VIOLIN_PROJECTION_STATE.UNPLAYABLE)
  assert.equal(projection.reason, 'outside-bounded-first-through-third-position')
  assert.equal(projection.noteCount, 0)
  assert.equal(projection.measureCount, 0)
  assert.deepEqual(projection.measures, [])
})