import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { createCanonicalNote } from '../canonicalNoteModel.js'
import {
  BASIC_GUITAR_POSITION_POLICY_ID,
  BASIC_GUITAR_POSITION_PROVENANCE,
  BASIC_GUITAR_POSITION_SELECTION_STATE,
  selectBasicCanonicalGuitarPosition,
} from '../guitarBasicPositionPolicy.js'

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
    step: 'E',
    alter: 0,
    octave: 4,
    ...overrides,
  })
}

test('Package 4B policy identity and provenance are explicit generated-basic claims', () => {
  assert.equal(BASIC_GUITAR_POSITION_POLICY_ID, 'lowest-fret-v1')
  assert.equal(BASIC_GUITAR_POSITION_PROVENANCE, 'generated-basic')
})

test('Package 4B written E4 deterministically selects D string fret 2 from all physical candidates', () => {
  const result = selectBasicCanonicalGuitarPosition(makeCanonicalNote({ step: 'E', octave: 4 }))

  assert.equal(result.state, BASIC_GUITAR_POSITION_SELECTION_STATE.SELECTED)
  assert.equal(result.policyId, 'lowest-fret-v1')
  assert.equal(result.provenance, 'generated-basic')
  assert.equal(result.sourceFingeringClaimed, false)
  assert.equal(result.candidateCount, 3)
  assert.deepEqual(result.position, {
    stringNumber: 4,
    stringLetter: 'D',
    fret: 2,
    soundingMidi: 52,
    writtenMidi: 64,
  })
})

test('Package 4B written E5 selects first-string open E under lowest-fret-v1', () => {
  const result = selectBasicCanonicalGuitarPosition(makeCanonicalNote({ step: 'E', octave: 5 }))

  assert.equal(result.state, BASIC_GUITAR_POSITION_SELECTION_STATE.SELECTED)
  assert.equal(result.candidateCount, 6)
  assert.equal(result.position.stringNumber, 1)
  assert.equal(result.position.fret, 0)
})

test('Package 4B does not represent generated policy as source technical fingering even if canonical note carries string/fret fields', () => {
  const result = selectBasicCanonicalGuitarPosition(makeCanonicalNote({
    step: 'E',
    octave: 4,
    stringLetter: 'A',
    stringNumber: 5,
    fret: 7,
  }))

  assert.equal(result.state, BASIC_GUITAR_POSITION_SELECTION_STATE.SELECTED)
  assert.equal(result.provenance, 'generated-basic')
  assert.equal(result.sourceFingeringClaimed, false)
  assert.equal(result.position.stringNumber, 4)
  assert.equal(result.position.fret, 2)
})

test('Package 4B rests remain rests and never receive a generated position', () => {
  const result = selectBasicCanonicalGuitarPosition(makeCanonicalNote({
    isRest: true,
    step: null,
    alter: null,
    octave: null,
  }))

  assert.equal(result.state, BASIC_GUITAR_POSITION_SELECTION_STATE.REST)
  assert.equal(result.position, null)
  assert.equal(result.candidateCount, 0)
})

test('Package 4B out-of-range pitch remains unplayable instead of falling back to e0', () => {
  const result = selectBasicCanonicalGuitarPosition(makeCanonicalNote({ step: 'E', octave: 2 }))

  assert.equal(result.state, BASIC_GUITAR_POSITION_SELECTION_STATE.UNPLAYABLE)
  assert.equal(result.position, null)
  assert.equal(result.reason, 'no-basic-guitar-position')
})

test('Package 4B legacy/non-canonical input remains invalid', () => {
  const result = selectBasicCanonicalGuitarPosition({ step: 'E', octave: 4 })

  assert.equal(result.state, BASIC_GUITAR_POSITION_SELECTION_STATE.INVALID)
  assert.equal(result.position, null)
  assert.equal(result.reason, 'canonical-note-required')
})

test('Package 4B is deterministic, immutable, and does not mutate canonical input', () => {
  const note = makeCanonicalNote({ step: 'C', alter: 1, octave: 5 })
  const before = structuredClone(note)

  const first = selectBasicCanonicalGuitarPosition(note)
  const second = selectBasicCanonicalGuitarPosition(note)

  assert.deepEqual(first, second)
  assert.deepEqual(note, before)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.position), true)
})

test('Package 4B remains pure and does not activate production Guitar TAB, OMR, gateway, or quality-gate wiring', async () => {
  const source = await readFile(new URL('../guitarBasicPositionPolicy.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /AudiverisProvider|omrWorker|omrProvider|gatewayProvider|omrService/)
  assert.doesNotMatch(source, /canonicalConsumerBindings|qualityGateIntegration/)
})
