import {
  describe,
  test,
} from 'node:test'

import assert from 'node:assert/strict'

import {
  CANONICAL_CONSUMPTION_DECISION,
  CANONICAL_NOTE_FIELDS,
  CANONICAL_NOTE_SCHEMA_VERSION,
  CANONICAL_VERIFICATION_STATUS,
  canConsumeCanonicalNote,
  isCanonicalNoteDefinitive,
  resolveCanonicalConsumptionPolicy,
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

// =============================================================================
// BEGIN PACKAGE 2A-1B2 CANONICAL CONSUMPTION POLICY TESTS
// =============================================================================

function createCanonicalVerificationState({
  status =
    CANONICAL_VERIFICATION_STATUS.VERIFIED,
  pitchStatus = status,
  timeStatus = status,
  pitchValid =
    pitchStatus !==
    CANONICAL_VERIFICATION_STATUS.INVALID,
  timeValid =
    timeStatus !==
    CANONICAL_VERIFICATION_STATUS.INVALID,
  schemaVersion =
    CANONICAL_NOTE_SCHEMA_VERSION,
} = {}) {
  return {
    schemaVersion,
    status,
    pitch: {
      valid: pitchValid,
      status: pitchStatus,
      authority: 'test',
      source: 'test',
      reason: null,
    },
    time: {
      valid: timeValid,
      status: timeStatus,
      authority: 'test',
      source: 'test',
      reason: null,
    },
  }
}

describe(
  'resolveCanonicalConsumptionPolicy',
  () => {
    test(
      'exports immutable policy vocabulary',
      () => {
        assert.equal(
          Object.isFrozen(
            CANONICAL_VERIFICATION_STATUS,
          ),
          true,
        )

        assert.equal(
          Object.isFrozen(
            CANONICAL_CONSUMPTION_DECISION,
          ),
          true,
        )

        assert.deepEqual(
          CANONICAL_VERIFICATION_STATUS,
          {
            VERIFIED: 'verified',
            PARTIAL: 'partial',
            INVALID: 'invalid',
            UNVERIFIED: 'unverified',
          },
        )

        assert.deepEqual(
          CANONICAL_CONSUMPTION_DECISION,
          {
            ACCEPT: 'accept',
            REVIEW: 'review',
            BLOCK: 'block',
            LEGACY: 'legacy',
          },
        )
      },
    )

    test(
      'accepts a fully verified canonical note',
      () => {
        const result =
          resolveCanonicalConsumptionPolicy({
            sourceVerificationState:
              createCanonicalVerificationState({
                status:
                  CANONICAL_VERIFICATION_STATUS
                    .VERIFIED,
              }),
          })

        assert.equal(result.applicable, true)
        assert.equal(result.status, 'verified')
        assert.equal(result.decision, 'accept')
        assert.equal(result.allowed, true)
        assert.equal(result.definitive, true)
        assert.equal(
          result.requiresReview,
          false,
        )
        assert.equal(result.reason, null)
        assert.equal(result.pitchValid, true)
        assert.equal(result.timeValid, true)
        assert.equal(
          Object.isFrozen(result),
          true,
        )
      },
    )

    test(
      'allows a partial note but requires review',
      () => {
        const result =
          resolveCanonicalConsumptionPolicy({
            sourceVerificationState:
              createCanonicalVerificationState({
                status:
                  CANONICAL_VERIFICATION_STATUS
                    .PARTIAL,
                pitchStatus:
                  CANONICAL_VERIFICATION_STATUS
                    .PARTIAL,
                timeStatus:
                  CANONICAL_VERIFICATION_STATUS
                    .VERIFIED,
              }),
          })

        assert.equal(result.status, 'partial')
        assert.equal(result.decision, 'review')
        assert.equal(result.allowed, true)
        assert.equal(result.definitive, false)
        assert.equal(
          result.requiresReview,
          true,
        )
        assert.equal(
          result.reason,
          'canonical-verification-partial',
        )
      },
    )

    test(
      'blocks an invalid canonical note',
      () => {
        const result =
          resolveCanonicalConsumptionPolicy({
            sourceVerificationState:
              createCanonicalVerificationState({
                status:
                  CANONICAL_VERIFICATION_STATUS
                    .INVALID,
                pitchStatus:
                  CANONICAL_VERIFICATION_STATUS
                    .INVALID,
                timeStatus:
                  CANONICAL_VERIFICATION_STATUS
                    .VERIFIED,
                pitchValid: false,
                timeValid: true,
              }),
          })

        assert.equal(result.status, 'invalid')
        assert.equal(result.decision, 'block')
        assert.equal(result.allowed, false)
        assert.equal(result.definitive, false)
        assert.equal(
          result.requiresReview,
          true,
        )
        assert.equal(
          result.reason,
          'canonical-verification-invalid',
        )
        assert.equal(result.pitchValid, false)
        assert.equal(result.timeValid, true)
      },
    )

    test(
      'keeps a metadata-free legacy note usable but non-definitive',
      () => {
        const result =
          resolveCanonicalConsumptionPolicy({
            midi: 64,
            beats: 1,
          })

        assert.equal(result.applicable, false)
        assert.equal(
          result.status,
          'unverified',
        )
        assert.equal(result.decision, 'legacy')
        assert.equal(result.allowed, true)
        assert.equal(result.definitive, false)
        assert.equal(
          result.requiresReview,
          true,
        )
        assert.equal(
          result.reason,
          'verification-metadata-absent',
        )
        assert.equal(result.pitchValid, null)
        assert.equal(result.timeValid, null)
      },
    )

    test(
      'blocks malformed note inputs',
      () => {
        for (const input of [
          null,
          [],
          'note',
          64,
        ]) {
          const result =
            resolveCanonicalConsumptionPolicy(
              input,
            )

          assert.equal(
            result.decision,
            'block',
          )

          assert.equal(
            result.reason,
            'invalid-note',
          )
        }
      },
    )

    test(
      'blocks malformed verification metadata',
      () => {
        const result =
          resolveCanonicalConsumptionPolicy({
            sourceVerificationState:
              'invalid-metadata',
          })

        assert.equal(result.allowed, false)
        assert.equal(result.decision, 'block')
        assert.equal(
          result.reason,
          'verification-metadata-invalid',
        )
      },
    )

    test(
      'blocks an unsupported schema version',
      () => {
        const result =
          resolveCanonicalConsumptionPolicy({
            sourceVerificationState:
              createCanonicalVerificationState({
                schemaVersion: 999,
              }),
          })

        assert.equal(result.allowed, false)
        assert.equal(result.decision, 'block')
        assert.equal(
          result.reason,
          'verification-schema-unsupported',
        )
        assert.equal(
          result.schemaVersion,
          999,
        )
      },
    )

    test(
      'blocks missing component verification',
      () => {
        const state =
          createCanonicalVerificationState()

        delete state.pitch

        const result =
          resolveCanonicalConsumptionPolicy({
            sourceVerificationState: state,
          })

        assert.equal(result.allowed, false)
        assert.equal(result.decision, 'block')
        assert.equal(
          result.reason,
          'pitch-verification-missing',
        )
      },
    )

    test(
      'blocks component status and validity conflicts',
      () => {
        const state =
          createCanonicalVerificationState({
            status:
              CANONICAL_VERIFICATION_STATUS
                .INVALID,
            pitchStatus:
              CANONICAL_VERIFICATION_STATUS
                .INVALID,
            timeStatus:
              CANONICAL_VERIFICATION_STATUS
                .VERIFIED,
            pitchValid: true,
            timeValid: true,
          })

        const result =
          resolveCanonicalConsumptionPolicy({
            sourceVerificationState: state,
          })

        assert.equal(result.allowed, false)
        assert.equal(result.decision, 'block')
        assert.equal(
          result.reason,
          'pitch-status-conflict',
        )
      },
    )

    test(
      'blocks a top-level status that conflicts with component status',
      () => {
        const result =
          resolveCanonicalConsumptionPolicy({
            sourceVerificationState:
              createCanonicalVerificationState({
                status:
                  CANONICAL_VERIFICATION_STATUS
                    .VERIFIED,
                pitchStatus:
                  CANONICAL_VERIFICATION_STATUS
                    .PARTIAL,
                timeStatus:
                  CANONICAL_VERIFICATION_STATUS
                    .VERIFIED,
              }),
          })

        assert.equal(result.allowed, false)
        assert.equal(result.decision, 'block')
        assert.equal(
          result.reason,
          'verification-status-conflict',
        )
      },
    )

    test(
      'keeps helpers aligned and never mutates the note',
      () => {
        const note = {
          midi: 64,
          sourceVerificationState:
            createCanonicalVerificationState({
              status:
                CANONICAL_VERIFICATION_STATUS
                  .PARTIAL,
              pitchStatus:
                CANONICAL_VERIFICATION_STATUS
                  .VERIFIED,
              timeStatus:
                CANONICAL_VERIFICATION_STATUS
                  .PARTIAL,
            }),
        }

        const before =
          structuredClone(note)

        const result =
          resolveCanonicalConsumptionPolicy(
            note,
          )

        assert.deepEqual(note, before)

        assert.equal(
          canConsumeCanonicalNote(note),
          result.allowed,
        )

        assert.equal(
          isCanonicalNoteDefinitive(note),
          result.definitive,
        )

        assert.equal(
          canConsumeCanonicalNote({
            sourceVerificationState:
              createCanonicalVerificationState({
                status:
                  CANONICAL_VERIFICATION_STATUS
                    .INVALID,
                pitchStatus:
                  CANONICAL_VERIFICATION_STATUS
                    .INVALID,
                timeStatus:
                  CANONICAL_VERIFICATION_STATUS
                    .VERIFIED,
                pitchValid: false,
                timeValid: true,
              }),
          }),
          false,
        )

        assert.equal(
          isCanonicalNoteDefinitive({
            sourceVerificationState:
              createCanonicalVerificationState(),
          }),
          true,
        )

        assert.equal(
          isCanonicalNoteDefinitive({
            midi: 64,
          }),
          false,
        )
      },
    )
  },
)

// END PACKAGE 2A-1B2 CANONICAL CONSUMPTION POLICY TESTS
