import test from 'node:test'
import assert from 'node:assert/strict'

import { createCanonicalNote } from '../canonicalNoteModel.js'
import {
  BASIC_GUITAR_TAB_PROJECTION_STATE,
  projectCanonicalNotesToBasicGuitarTab,
} from '../guitarBasicTabProjection.js'

function validCanonicalNote() {
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
    voice: 1,
    staff: 1,
    isRest: false,
    isGrace: false,
    isChordNote: false,
    step: 'E',
    alter: 0,
    octave: 4,
  })
}

function expectPhysicalIdentityFailure(note) {
  const result = projectCanonicalNotesToBasicGuitarTab([note])
  assert.equal(result.state, BASIC_GUITAR_TAB_PROJECTION_STATE.INVALID)
  assert.equal(result.reason, 'canonical-physical-identity-required')
  assert.equal(result.blockingNoteIndex, 0)
  assert.deepEqual(result.measures, [])
}

test('Package 4C rejects null, blank, boolean, and string timing instead of coercing them to numbers', () => {
  const base = validCanonicalNote()

  for (const value of [null, '', false, true, '0', '1']) {
    expectPhysicalIdentityFailure({ ...base, startBeat: value })
    expectPhysicalIdentityFailure({ ...base, beats: value })
  }
})

test('Package 4C rejects non-number measure and part indexes instead of coercing them', () => {
  const base = validCanonicalNote()

  for (const value of [null, '', false, true, '0', '1']) {
    expectPhysicalIdentityFailure({ ...base, measureIndex: value })
    expectPhysicalIdentityFailure({ ...base, partIndex: value })
  }
})

test('Package 4C rejects NaN, Infinity, negative timing, and non-integer indexes', () => {
  const base = validCanonicalNote()

  for (const value of [NaN, Infinity, -1]) {
    expectPhysicalIdentityFailure({ ...base, startBeat: value })
    expectPhysicalIdentityFailure({ ...base, beats: value })
  }

  for (const value of [NaN, Infinity, -1, 0.5]) {
    expectPhysicalIdentityFailure({ ...base, measureIndex: value })
    expectPhysicalIdentityFailure({ ...base, partIndex: value })
  }
})
