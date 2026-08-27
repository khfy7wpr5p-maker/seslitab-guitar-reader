import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { createCanonicalNote } from '../canonicalNoteModel.js'
import {
  BASIC_VIOLIN_FINGERING_POLICY_ID,
  BASIC_VIOLIN_FINGERING_STATE,
  basicViolinFingerForSemitoneOffset,
  resolveBasicViolinFirstPositionFingering,
} from '../violinFingeringPolicy.js'

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
    step: 'F',
    alter: 0,
    octave: 5,
    ...overrides,
  })
}

test('Package 5B policy identity and semitone zones are explicit and deterministic', () => {
  assert.equal(BASIC_VIOLIN_FINGERING_POLICY_ID, 'first-position-semitone-zone-v1')
  assert.deepEqual(
    Array.from({ length: 8 }, (_, offset) => basicViolinFingerForSemitoneOffset(offset)),
    [0, 1, 1, 2, 2, 3, 3, 4],
  )
  assert.equal(basicViolinFingerForSemitoneOffset(-1), null)
  assert.equal(basicViolinFingerForSemitoneOffset(8), null)
  assert.equal(basicViolinFingerForSemitoneOffset('2'), null)
})

test('Package 5B unique open-string note receives generated finger 0 without teacher-approval claim', () => {
  const result = resolveBasicViolinFirstPositionFingering(
    makeCanonicalNote({ step: 'G', octave: 3 }),
  )

  assert.equal(result.state, BASIC_VIOLIN_FINGERING_STATE.GENERATED_BASIC)
  assert.equal(result.requiresTeacherReview, false)
  assert.equal(result.teacherApproved, false)
  assert.equal(result.fingeringCandidates.length, 1)
  assert.equal(result.fingeringCandidates[0].stringNumber, 4)
  assert.equal(result.fingeringCandidates[0].fingerNumber, 0)
  assert.equal(result.fingeringCandidates[0].teacherApproved, false)
})

test('Package 5B stopped first-position semitone zones map mechanically to fingers 1 through 4', () => {
  const fixtures = [
    { step: 'F', alter: 0, octave: 5, offset: 1, finger: 1 },
    { step: 'F', alter: 1, octave: 5, offset: 2, finger: 1 },
    { step: 'G', alter: 0, octave: 5, offset: 3, finger: 2 },
    { step: 'G', alter: 1, octave: 5, offset: 4, finger: 2 },
    { step: 'A', alter: 0, octave: 5, offset: 5, finger: 3 },
    { step: 'A', alter: 1, octave: 5, offset: 6, finger: 3 },
    { step: 'B', alter: 0, octave: 5, offset: 7, finger: 4 },
  ]

  for (const fixture of fixtures) {
    const result = resolveBasicViolinFirstPositionFingering(
      makeCanonicalNote(fixture),
    )

    assert.equal(result.state, BASIC_VIOLIN_FINGERING_STATE.GENERATED_BASIC)
    assert.equal(result.fingeringCandidates.length, 1)
    assert.equal(result.fingeringCandidates[0].stringNumber, 1)
    assert.equal(result.fingeringCandidates[0].semitoneOffset, fixture.offset)
    assert.equal(result.fingeringCandidates[0].fingerNumber, fixture.finger)
  }
})

test('Package 5B D4 crossing remains ambiguous: open D versus fourth finger on G', () => {
  const result = resolveBasicViolinFirstPositionFingering(
    makeCanonicalNote({ step: 'D', alter: 0, octave: 4 }),
  )

  assert.equal(result.state, BASIC_VIOLIN_FINGERING_STATE.AMBIGUOUS)
  assert.equal(result.reason, 'multiple-first-position-string-candidates')
  assert.equal(result.requiresTeacherReview, true)
  assert.equal(result.teacherApproved, false)
  assert.deepEqual(
    result.fingeringCandidates.map(({ stringNumber, semitoneOffset, fingerNumber }) => ({
      stringNumber,
      semitoneOffset,
      fingerNumber,
    })),
    [
      { stringNumber: 3, semitoneOffset: 0, fingerNumber: 0 },
      { stringNumber: 4, semitoneOffset: 7, fingerNumber: 4 },
    ],
  )
})

test('Package 5B A4 and E5 crossing choices remain ambiguous instead of selecting a preferred string', () => {
  for (const pitch of [
    { step: 'A', octave: 4 },
    { step: 'E', octave: 5 },
  ]) {
    const result = resolveBasicViolinFirstPositionFingering(makeCanonicalNote(pitch))

    assert.equal(result.state, BASIC_VIOLIN_FINGERING_STATE.AMBIGUOUS)
    assert.equal(result.requiresTeacherReview, true)
    assert.equal(result.fingeringCandidates.length, 2)
    assert.equal(result.fingeringCandidates.some(({ fingerNumber }) => fingerNumber === 0), true)
    assert.equal(result.fingeringCandidates.some(({ fingerNumber }) => fingerNumber === 4), true)
    assert.equal('selectedCandidate' in result, false)
  }
})

test('Package 5B rests remain rests with no generated fingering', () => {
  const result = resolveBasicViolinFirstPositionFingering(
    makeCanonicalNote({ isRest: true, step: null, alter: null, octave: null }),
  )

  assert.equal(result.state, BASIC_VIOLIN_FINGERING_STATE.REST)
  assert.deepEqual(result.fingeringCandidates, [])
  assert.equal(result.teacherApproved, false)
})

test('Package 5B out-of-range and invalid inputs fail closed without fallback fingering', () => {
  const outOfRange = resolveBasicViolinFirstPositionFingering(
    makeCanonicalNote({ step: 'C', octave: 6 }),
  )
  const invalid = resolveBasicViolinFirstPositionFingering({ step: 'G', octave: 3 })

  assert.equal(outOfRange.state, BASIC_VIOLIN_FINGERING_STATE.OUT_OF_RANGE)
  assert.deepEqual(outOfRange.fingeringCandidates, [])
  assert.equal(invalid.state, BASIC_VIOLIN_FINGERING_STATE.INVALID)
  assert.deepEqual(invalid.fingeringCandidates, [])
})

test('Package 5B source guitar position fields are never promoted to violin fingering truth', () => {
  const result = resolveBasicViolinFirstPositionFingering(
    makeCanonicalNote({
      step: 'F',
      octave: 5,
      stringLetter: 'e',
      stringNumber: 1,
      fret: 17,
    }),
  )

  assert.equal(result.state, BASIC_VIOLIN_FINGERING_STATE.GENERATED_BASIC)
  assert.equal(result.fingeringCandidates[0].stringName, 'E')
  assert.equal(result.fingeringCandidates[0].semitoneOffset, 1)
  assert.equal(result.fingeringCandidates[0].fingerNumber, 1)
  assert.equal(result.fingeringCandidates[0].provenance, 'generated-basic-first-position-fingering')
})

test('Package 5B is deterministic, immutable, and never mutates canonical input', () => {
  const note = makeCanonicalNote({ step: 'G', alter: 1, octave: 5 })
  const before = structuredClone(note)

  const first = resolveBasicViolinFirstPositionFingering(note)
  const second = resolveBasicViolinFirstPositionFingering(note)

  assert.deepEqual(first, second)
  assert.deepEqual(note, before)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.fingeringCandidates), true)
  assert.equal(first.fingeringCandidates.every(Object.isFrozen), true)
})

test('Package 5B remains pure and does not activate production violin, OMR, parser, or quality-gate wiring', async () => {
  const source = await readFile(
    new URL('../violinFingeringPolicy.js', import.meta.url),
    'utf8',
  )

  assert.doesNotMatch(
    source,
    /AudiverisProvider|omrWorker|omrProvider|gatewayProvider|omrService/,
  )
  assert.doesNotMatch(source, /canonicalConsumerBindings|qualityGateIntegration|musicXmlParser/)
  assert.doesNotMatch(source, /CANONICAL_CONSUMER_TYPE/)
})
