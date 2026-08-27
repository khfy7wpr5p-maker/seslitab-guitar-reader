import test from 'node:test'
import assert from 'node:assert/strict'

import { formatBasicViolinProjectionForUi } from '../src/package5Ui.js'

const POLICY_ID = 'first-position-semitone-zone-v1'
const PROVENANCE = 'generated-basic-first-position-fingering'

function validEvent(noteIndex, overrides = {}) {
  const fingering = {
    stringNumber: 4,
    stringName: 'G',
    openMidi: 55,
    writtenMidi: 57,
    semitoneOffset: 2,
    fingerNumber: 1,
    position: 'first',
    policyId: POLICY_ID,
    provenance: PROVENANCE,
    teacherApproved: false,
    ...(overrides.fingering || {}),
  }

  return {
    noteIndex,
    note: { noteName: 'La' },
    measureKey: 'P1:0',
    measureIndex: 0,
    startBeat: noteIndex,
    beats: 1,
    voice: 1,
    staff: 1,
    isRest: false,
    isGrace: false,
    tieStart: false,
    tieStop: false,
    policyId: POLICY_ID,
    provenance: PROVENANCE,
    teacherApproved: false,
    fingering,
    ...overrides,
    fingering,
  }
}

function projection(events) {
  return {
    state: 'projected',
    policyId: POLICY_ID,
    provenance: PROVENANCE,
    teacherApproved: false,
    noteCount: events.length,
    measureCount: 1,
    measures: [{
      measureKey: 'P1:0',
      measureIndex: 0,
      measureNumber: '1',
      partId: 'P1',
      partIndex: 0,
      events,
    }],
  }
}

test('Package 5F review regression: valid complete fingering evidence remains renderable', () => {
  const text = formatBasicViolinProjectionForUi(projection([
    validEvent(0),
    validEvent(1),
  ]))

  assert.match(text, /Dördüncü tel, birinci parmak/)
})

test('Package 5F review regression: duplicate noteIndex with a missing index fails closed', () => {
  const malformed = projection([
    validEvent(0),
    validEvent(0),
  ])

  assert.equal(formatBasicViolinProjectionForUi(malformed), null)
})

test('Package 5F review regression: out-of-range noteIndex fails closed', () => {
  const malformed = projection([
    validEvent(0),
    validEvent(2),
  ])

  assert.equal(formatBasicViolinProjectionForUi(malformed), null)
})

test('Package 5F review regression: contradictory string number and name fails closed', () => {
  const malformed = projection([
    validEvent(0, { fingering: { stringName: 'E' } }),
  ])

  assert.equal(formatBasicViolinProjectionForUi(malformed), null)
})

test('Package 5F review regression: contradictory semitone offset and finger fails closed', () => {
  const malformed = projection([
    validEvent(0, {
      fingering: {
        writtenMidi: 62,
        semitoneOffset: 7,
        fingerNumber: 0,
      },
    }),
  ])

  assert.equal(formatBasicViolinProjectionForUi(malformed), null)
})

test('Package 5F review regression: inconsistent open/written MIDI evidence fails closed', () => {
  const malformed = projection([
    validEvent(0, { fingering: { openMidi: 62 } }),
  ])

  assert.equal(formatBasicViolinProjectionForUi(malformed), null)
})
