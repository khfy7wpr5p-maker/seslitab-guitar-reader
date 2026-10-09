import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveGuitarTabEventMidi } from '../src/services/guitarTabPitchPolicy.js'

test('GTAB-OCTAVE-01 prefers guitar sounding MIDI over written source MIDI', () => {
  assert.equal(resolveGuitarTabEventMidi({
    pitch: { midi: 69 },
    guitarSoundingMidi: 57,
  }), 57)
})

test('GTAB-OCTAVE-01 preserves legacy written MIDI fallback for non-transposing fixtures', () => {
  assert.equal(resolveGuitarTabEventMidi({ pitch: { midi: 69 } }), 69)
  assert.equal(resolveGuitarTabEventMidi(null), null)
})
