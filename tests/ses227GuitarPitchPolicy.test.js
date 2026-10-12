import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveGuitarTabEventMidi } from '../src/services/guitarTabPitchPolicy.js'
import {
  GUITAR_TAB_EDITOR_RUNTIME_GLOBAL,
  GUITAR_TAB_EDITOR_RUNTIME_VERSION,
  resolveGuitarTabEditorRuntime,
} from '../src/services/guitarTabEditorRuntimeLoader.js'

function runtime({ pitchPolicy = true } = {}) {
  const noop = () => null
  const value = {
    runtimeVersion: GUITAR_TAB_EDITOR_RUNTIME_VERSION,
    profile: Object.freeze({
      networkCapable: false,
      persistenceCapable: false,
      rendererAuthority: false,
      sourceMutationAuthority: false,
      serverRevisionAuthority: false,
      approvalAuthority: false,
      publicationAuthority: false,
    }),
    inspectMusicXml: noop,
    createSourceSession: noop,
    createTabAssignmentDocument: noop,
    createKeyboardController: noop,
    createFixedSixStringRows: noop,
    positionToMidi: noop,
    validatePositionForEvent: noop,
    serializeGuitarTabMusicXml: noop,
  }
  if (pitchPolicy) {
    value.GUITAR_PITCH_POLICY = Object.freeze({
      SOURCE_SOUNDING: 'source-sounding',
      STANDARD_GUITAR_WRITTEN: 'standard-guitar-written',
    })
  }
  return Object.freeze(value)
}

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

test('SES-227 loader requires the explicit guitar pitch policy contract', () => {
  const valid = runtime()
  assert.equal(resolveGuitarTabEditorRuntime({ [GUITAR_TAB_EDITOR_RUNTIME_GLOBAL]: valid }), valid)
  assert.equal(
    resolveGuitarTabEditorRuntime({ [GUITAR_TAB_EDITOR_RUNTIME_GLOBAL]: runtime({ pitchPolicy: false }) }),
    null,
  )
})
