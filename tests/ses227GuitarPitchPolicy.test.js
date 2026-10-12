import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveGuitarTabEventMidi } from '../src/services/guitarTabPitchPolicy.js'

test('SES-227 Teacher fretboard consumes resolved guitar physical pitch first', () => {
  const event = {
    pitch: { midi: 69 },
    soundingPitchMidi: 69,
    guitarPhysicalPitchMidi: 57,
  }
  assert.equal(resolveGuitarTabEventMidi(event), 57)
})

test('SES-227 pitch policy remains backward compatible for legacy event shapes', () => {
  assert.equal(resolveGuitarTabEventMidi({ pitch: { midi: 69 }, soundingPitchMidi: 67 }), 67)
  assert.equal(resolveGuitarTabEventMidi({ pitch: { midi: 69 } }), 69)
  assert.equal(resolveGuitarTabEventMidi({}), null)
})

test('SES-227 unresolved explicit guitar physical pitch fails closed instead of falling back', () => {
  const event = {
    pitch: { midi: 69 },
    soundingPitchMidi: 69,
    guitarPhysicalPitchMidi: null,
  }
  assert.equal(resolveGuitarTabEventMidi(event), null)
})
