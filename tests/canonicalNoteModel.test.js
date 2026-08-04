import {
  describe,
  test,
} from 'node:test'

import assert from 'node:assert/strict'

import {
  CANONICAL_NOTE_FIELDS,
  CANONICAL_NOTE_SCHEMA_VERSION,
  resolveCanonicalPitch,
  resolveCanonicalTime,
} from '../noteTheory.js'

describe('canonical note contract', () => {
  test('schema is versioned and immutable', () => {
    assert.equal(
      CANONICAL_NOTE_SCHEMA_VERSION,
      1,
    )

    assert.equal(
      Object.isFrozen(CANONICAL_NOTE_FIELDS),
      true,
    )

    assert.equal(
      new Set(CANONICAL_NOTE_FIELDS).size,
      CANONICAL_NOTE_FIELDS.length,
    )

    for (const field of [
      'measureKey',
      'startBeat',
      'durationValue',
      'divisions',
      'midi',
      'frequency',
      'voice',
      'staff',
      'tieContinue',
      'tuplet',
      'beam',
      'confidenceReason',
      'sourceVerificationState',
      '_raw',
    ]) {
      assert.equal(
        CANONICAL_NOTE_FIELDS.includes(field),
        true,
      )
    }
  })

  test('time resolver is exported', () => {
    assert.equal(
      typeof resolveCanonicalTime,
      'function',
    )
  })
})

describe('resolveCanonicalPitch', () => {
  test('resolves MIDI 69 as La4 and 440 Hz', () => {
    const result = resolveCanonicalPitch({
      midi: 69,
    })

    assert.equal(result.valid, true)
    assert.equal(result.source, 'midi')
    assert.equal(result.midi, 69)
    assert.equal(result.noteName, 'La')
    assert.equal(result.octave, 4)
    assert.equal(result.frequency, 440)
  })

  test('resolves written C sharp 4', () => {
    const result = resolveCanonicalPitch({
      step: 'C',
      alter: 1,
      octave: 4,
    })

    assert.equal(result.valid, true)
    assert.equal(result.source, 'written')
    assert.equal(result.midi, 61)
    assert.equal(result.noteName, 'Do#')
    assert.equal(result.octave, 4)
  })

  test('resolves the first open guitar string', () => {
    const result = resolveCanonicalPitch({
      stringLetter: 'e',
      fret: 0,
    })

    assert.equal(result.valid, true)
    assert.equal(result.source, 'guitar')
    assert.equal(result.midi, 64)
    assert.equal(result.noteName, 'Mi')
    assert.equal(result.stringNumber, 1)
    assert.equal(result.fret, 0)
  })

  test('accepts matching representations', () => {
    const result = resolveCanonicalPitch({
      midi: 64,
      step: 'E',
      alter: 0,
      octave: 4,
      stringNumber: 1,
      fret: 0,
    })

    assert.equal(result.valid, true)
    assert.equal(
      result.source,
      'midi+written+guitar',
    )
    assert.equal(result.midi, 64)
  })

  test('rejects conflicting representations', () => {
    const result = resolveCanonicalPitch({
      midi: 69,
      step: 'C',
      alter: 0,
      octave: 4,
    })

    assert.equal(result.valid, false)
    assert.equal(result.reason, 'pitch-conflict')
  })

  test('rejects conflicting guitar strings', () => {
    const result = resolveCanonicalPitch({
      stringLetter: 'e',
      stringNumber: 2,
      fret: 0,
    })

    assert.equal(result.valid, false)
    assert.equal(
      result.reason,
      'string-identity-conflict',
    )
  })

  test('accepts rounded frequency within tolerance', () => {
    const result = resolveCanonicalPitch({
      midi: 64,
      frequency: 329.63,
    })

    assert.equal(result.valid, true)
  })

  test('rejects frequency conflict', () => {
    const result = resolveCanonicalPitch({
      midi: 69,
      frequency: 220,
    })

    assert.equal(result.valid, false)
    assert.equal(
      result.reason,
      'frequency-conflict',
    )
  })

  test('represents a rest without invented pitch', () => {
    const result = resolveCanonicalPitch({
      isRest: true,
    })

    assert.equal(result.valid, true)
    assert.equal(result.source, 'rest')
    assert.equal(result.midi, null)
    assert.equal(result.frequency, null)
    assert.equal(result.noteName, '')
  })

  test('rejects malformed pitch data', () => {
    const cases = [
      [{ midi: '69x' }, 'invalid-midi'],
      [{ step: 'H', octave: 4 }, 'invalid-step'],
      [{ stringNumber: 'x' }, 'invalid-string-number'],
      [{ isRest: true, midi: 60 }, 'rest-has-pitch'],
      [{}, 'missing-pitch'],
    ]

    for (const [input, reason] of cases) {
      const result = resolveCanonicalPitch(input)

      assert.equal(result.valid, false)
      assert.equal(result.reason, reason)
    }
  })

  test('preserves written octave across an enharmonic boundary', () => {
    const result = resolveCanonicalPitch({
      step: 'B',
      alter: 1,
      octave: 4,
    })

    assert.equal(result.valid, true)
    assert.equal(result.midi, 72)
    assert.equal(result.noteName, 'Do')
    assert.equal(result.step, 'B')
    assert.equal(result.alter, 1)
    assert.equal(result.octave, 4)
  })

  test('rejects implicit guitar octave transposition', () => {
    const result = resolveCanonicalPitch({
      midi: 64,
      step: 'E',
      alter: 0,
      octave: 4,
      stringLetter: 'D',
      fret: 2,
    })

    assert.equal(result.valid, false)
    assert.equal(result.reason, 'pitch-conflict')
  })

  test('does not mutate its input', () => {
    const input = {
      midi: 69,
      frequency: 440,
      metadata: {
        source: 'test',
      },
    }

    const before = structuredClone(input)

    resolveCanonicalPitch(input)

    assert.deepEqual(input, before)
  })
})

// =============================================================================
// BEGIN PACKAGE 2A-1A CANONICAL TIME TESTS
// =============================================================================

describe('resolveCanonicalTime', () => {
  test('resolves explicit beats and onset', () => {
    const result = resolveCanonicalTime({
      duration: 'quarter',
      beats: 1,
      startBeat: 2,
    })

    assert.equal(result.valid, true)
    assert.equal(
      result.source,
      'beats+duration-type',
    )
    assert.equal(result.beats, 1)
    assert.equal(result.startBeat, 2)
    assert.equal(result.endBeat, 3)
  })

  test('resolves MusicXML duration and divisions', () => {
    const result = resolveCanonicalTime({
      durationValue: 12,
      divisions: 4,
      startBeat: 1,
    })

    assert.equal(result.valid, true)
    assert.equal(
      result.source,
      'duration-divisions',
    )
    assert.equal(result.beats, 3)
    assert.equal(result.startBeat, 1)
    assert.equal(result.endBeat, 4)
  })

  test('resolves dotted quarter duration', () => {
    const result = resolveCanonicalTime({
      duration: 'quarter',
      dotCount: 1,
    })

    assert.equal(result.valid, true)
    assert.equal(
      result.source,
      'duration-type',
    )
    assert.equal(result.beats, 1.5)
    assert.equal(result.dotCount, 1)
  })

  test('normalizes a dotted duration identifier to one dot', () => {
    const result = resolveCanonicalTime({
      duration: 'dotted-quarter',
    })

    assert.equal(result.valid, true)
    assert.equal(result.duration, 'dotted-quarter')
    assert.equal(result.beats, 1.5)
    assert.equal(result.dotCount, 1)
  })

  test('does not apply dotted duration twice', () => {
    const result = resolveCanonicalTime({
      duration: 'dotted-quarter',
      dotCount: 1,
    })

    assert.equal(result.valid, true)
    assert.equal(result.beats, 1.5)
  })

  test('resolves a rest without changing duration', () => {
    const result = resolveCanonicalTime({
      isRest: true,
      duration: 'half',
      startBeat: 1,
    })

    assert.equal(result.valid, true)
    assert.equal(result.isRest, true)
    assert.equal(result.beats, 2)
    assert.equal(result.startBeat, 1)
    assert.equal(result.endBeat, 3)
  })

  test('keeps grace note performed duration at zero', () => {
    const result = resolveCanonicalTime({
      isGrace: true,
      duration: 'eighth',
      startBeat: 1.25,
    })

    assert.equal(result.valid, true)
    assert.equal(result.source, 'grace')
    assert.equal(result.beats, 0)
    assert.equal(result.startBeat, 1.25)
    assert.equal(result.endBeat, 1.25)
  })

  test('rejects positive beats on a grace note', () => {
    const result = resolveCanonicalTime({
      isGrace: true,
      duration: 'eighth',
      beats: 0.5,
    })

    assert.equal(result.valid, false)
    assert.equal(
      result.reason,
      'grace-note-has-beats',
    )
  })

  test('rejects positive raw duration on a grace note', () => {
    const result = resolveCanonicalTime({
      isGrace: true,
      durationValue: 2,
      divisions: 4,
    })

    assert.equal(result.valid, false)
    assert.equal(
      result.reason,
      'grace-note-has-duration',
    )
  })

  test('rejects conflicting duration representations', () => {
    const result = resolveCanonicalTime({
      duration: 'half',
      beats: 1,
      durationValue: 8,
      divisions: 4,
    })

    assert.equal(result.valid, false)
    assert.equal(
      result.reason,
      'duration-conflict',
    )
  })

  test('rejects incomplete MusicXML duration metadata', () => {
    const durationOnly = resolveCanonicalTime({
      durationValue: 4,
    })

    const divisionsOnly = resolveCanonicalTime({
      divisions: 4,
    })

    assert.equal(durationOnly.valid, false)
    assert.equal(
      durationOnly.reason,
      'duration-metadata-incomplete',
    )

    assert.equal(divisionsOnly.valid, false)
    assert.equal(
      divisionsOnly.reason,
      'duration-metadata-incomplete',
    )
  })

  test('rejects invalid time metadata', () => {
    const cases = [
      [
        {
          duration: 'quarter',
          startBeat: -1,
        },
        'invalid-start-beat',
      ],
      [
        {
          duration: 'unknown',
        },
        'unknown-duration',
      ],
      [
        {
          durationValue: 4,
          divisions: 0,
        },
        'invalid-divisions',
      ],
      [
        {
          beats: 0,
        },
        'invalid-beats',
      ],
      [
        {},
        'missing-duration',
      ],
    ]

    for (const [input, reason] of cases) {
      const result = resolveCanonicalTime(input)

      assert.equal(result.valid, false)
      assert.equal(result.reason, reason)
    }
  })

  test('does not mutate its input', () => {
    const input = {
      duration: 'quarter',
      dotCount: 1,
      startBeat: 2,
      metadata: {
        source: 'test',
      },
    }

    const before = structuredClone(input)

    resolveCanonicalTime(input)

    assert.deepEqual(input, before)
  })
})

// END PACKAGE 2A-1A CANONICAL TIME TESTS
