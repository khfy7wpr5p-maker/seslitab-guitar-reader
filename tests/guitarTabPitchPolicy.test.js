import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveGuitarTabEventMidi } from '../src/services/guitarTabPitchPolicy.js'

test('SES-220 prefers source-derived sounding MIDI over written and deprecated guitar MIDI', () => {
  assert.equal(resolveGuitarTabEventMidi({
    pitch: { midi: 61 },
    soundingPitchMidi: 61,
    guitarSoundingMidi: 49,
  }), 61)
})

test('SES-220 ignores deprecated guitar MIDI and preserves written MIDI fallback', () => {
  assert.equal(resolveGuitarTabEventMidi({ pitch: { midi: 61 }, guitarSoundingMidi: 49 }), 61)
  assert.equal(resolveGuitarTabEventMidi(null), null)
})
