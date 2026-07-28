// Focused tests for OMR Quality Validator — Phase 1: Measure Duration Validation.
// Run with: node --test tests/omrQualityValidator.test.js

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createNote } from '../noteTheory.js'
import { validateOmrMeasureDurations, QUALITY_THRESHOLDS } from '../src/services/omrQualityValidator.js'

// ── Helpers ──────────────────────────────────────────────────

function makeScoreNote(opts = {}) {
  const {
    measure = 1,
    beats = 1,
    duration = 'quarter',
    durationValue = null,
    divisions = null,
    isRest = false,
    dotCount = 0,
    voice = 1,
    staff = 1,
    step = 'A',
    alter = 0,
    octave = 4,
    tieStart = false,
    tieStop = false,
    tieContinue = false,
    stringLetter = 'G',
    fret = 2,
    noteName = 'La',
  } = opts

  const note = createNote({
    measure,
    duration,
    beats,
    dotCount,
    isRest,
    voice,
    staff,
    step,
    alter,
    octave,
    tieStart,
    tieStop,
    tieContinue,
    stringLetter,
    fret,
    noteName,
  })
  if (durationValue !== null) note.durationValue = durationValue
  if (divisions !== null) note.divisions = divisions
  return note
}

function makeScore(notes, extra = {}) {
  return { notes, ...extra }
}

// ── Tests ─────────────────────────────────────────────────────

describe('1. Valid 4/4 measure', () => {
  test('four quarter notes → valid', () => {
    const notes = [
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    assert.equal(report.measures[0].status, 'valid')
    assert.equal(report.measures[0].severity, 'none')
    assert.equal(report.measures[0].expectedBeats, 4)
    assert.equal(report.measures[0].actualBeats, 4)
  })
})

describe('2. Valid 3/4 measure', () => {
  test('three quarter notes → valid', () => {
    const notes = [
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 3, beatType: 4 }] }
    )
    assert.equal(report.measures[0].status, 'valid')
    assert.equal(report.measures[0].expectedBeats, 3)
    assert.equal(report.measures[0].actualBeats, 3)
  })
})

describe('3. Underfilled measure', () => {
  test('two quarter notes in 4/4 → underfilled', () => {
    const notes = [
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    assert.equal(report.measures[0].status, 'underfilled')
    assert.equal(report.measures[0].severity, 'error')
    assert.equal(report.measures[0].actualBeats, 2)
    assert.equal(report.measures[0].expectedBeats, 4)
    assert.ok(report.measures[0].difference < 0)
  })
})

describe('4. Overfilled measure', () => {
  test('five quarter notes in 4/4 → overfilled', () => {
    const notes = Array.from({ length: 5 }, () =>
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 })
    )
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    assert.equal(report.measures[0].status, 'overfilled')
    assert.equal(report.measures[0].severity, 'error')
    assert.equal(report.measures[0].actualBeats, 5)
    assert.ok(report.measures[0].difference > 0)
  })
})

describe('5. Empty measure', () => {
  test('no notes → empty', () => {
    const notes = [
      makeScoreNote({ measure: 2, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    const empty = report.measures.find((m) => m.measureNumber === 1)
    assert.ok(empty, 'measure 1 should exist')
    assert.equal(empty.status, 'empty')
    assert.equal(empty.severity, 'error')
    assert.equal(empty.actualBeats, 0)
  })
})

describe('6. Time-signature change', () => {
  test('measure 1 in 4/4, measure 2 in 3/4', () => {
    const notes = [
      ...Array.from({ length: 4 }, () => makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 })),
      ...Array.from({ length: 3 }, () => makeScoreNote({ measure: 2, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 })),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      {
        timeSignatures: [
          { measureNumber: 1, beats: 4, beatType: 4 },
          { measureNumber: 2, beats: 3, beatType: 4 },
        ],
      }
    )
    assert.equal(report.measures[0].status, 'valid')
    assert.equal(report.measures[0].expectedBeats, 4)
    assert.equal(report.measures[1].status, 'valid')
    assert.equal(report.measures[1].expectedBeats, 3)
  })
})

describe('7. Carried-forward time signature', () => {
  test('measure 2 has no explicit time signature — inherits 4/4', () => {
    const notes = [
      ...Array.from({ length: 4 }, () => makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 })),
      ...Array.from({ length: 4 }, () => makeScoreNote({ measure: 2, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 })),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    assert.equal(report.measures[0].status, 'valid')
    assert.equal(report.measures[1].status, 'valid')
    assert.equal(report.measures[1].expectedBeats, 4)
  })
})

describe('8. Chord notes not counted sequentially', () => {
  test('three chord notes + one quarter → 1 beat, not 4', () => {
    const notes = [
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
    ]
    // Indices 1, 2 are chord notes (same onset as index 0)
    const chordNoteFlags = [false, true, true, false]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      {
        timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }],
        chordNoteFlags,
      }
    )
    assert.equal(report.measures[0].actualBeats, 2)
    assert.equal(report.measures[0].status, 'underfilled')
  })

  test('without chord flags, overfilled measure notes chord limitation', () => {
    // 5 notes that would be 5 beats if sequential, but if 2 are chord notes
    // the real duration is 3. Without chord flags, the validator sees 5
    // and reports overfilled — with the chord-detection limitation noted.
    const notes = Array.from({ length: 5 }, () =>
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 })
    )
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    assert.equal(report.measures[0].actualBeats, 5)
    assert.equal(report.measures[0].status, 'overfilled')
    assert.ok(
      report.measures[0].reasons.some((r) => r.includes('Chord detection not available')),
      'should note chord detection limitation for overfilled measure'
    )
  })
})

describe('9. Multiple voices do not inflate duration', () => {
  test('voice 1 has 4 beats, voice 2 has 4 beats → actual is 4, not 8', () => {
    const notes = [
      ...Array.from({ length: 4 }, (_, i) =>
        makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4, voice: 1, step: 'A', octave: 4 })
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4, voice: 2, step: 'C', octave: 5 })
      ),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    assert.equal(report.measures[0].actualBeats, 4)
    assert.equal(report.measures[0].status, 'valid')
  })
})

describe('10. Dotted notes use canonical duration engine', () => {
  test('dotted half + quarter = 4 beats in 4/4', () => {
    const notes = [
      makeScoreNote({ measure: 1, beats: 3, duration: 'dotted-half', durationValue: 12, divisions: 4, dotCount: 1 }),
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    assert.equal(report.measures[0].actualBeats, 4)
    assert.equal(report.measures[0].status, 'valid')
  })

  test('dotted quarter + eighth + eighth + eighth = 3 beats in 3/4', () => {
    const notes = [
      makeScoreNote({ measure: 1, beats: 1.5, duration: 'dotted-quarter', durationValue: 6, divisions: 4, dotCount: 1 }),
      makeScoreNote({ measure: 1, beats: 0.5, duration: 'eighth', durationValue: 2, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 0.5, duration: 'eighth', durationValue: 2, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 0.5, duration: 'eighth', durationValue: 2, divisions: 4 }),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 3, beatType: 4 }] }
    )
    assert.equal(report.measures[0].actualBeats, 3)
    assert.equal(report.measures[0].status, 'valid')
  })
})

describe('11. Ties not double-counted', () => {
  test('tie start (2 beats) + tie stop (3 beats) in same measure = 5, not 2+3=5 separately', () => {
    // The canonical resolver (resolveBeats) returns per-note beats.
    // The validator sums per-note beats per voice. A tie start note
    // has its full beats, and a tie stop note also has its full beats.
    // When both are in the same measure and same voice, the total
    // is the sum — which is correct for measure-fill purposes.
    // The tie chain logic (buildTieChains) is used for attack counting,
    // not for measure duration. The validator does not use tie chains
    // because it measures total filled time, not sounding events.
    const notes = [
      makeScoreNote({ measure: 1, beats: 2, duration: 'half', durationValue: 8, divisions: 4, step: 'E', octave: 4, tieStart: true }),
      makeScoreNote({ measure: 1, beats: 2, duration: 'half', durationValue: 8, divisions: 4, step: 'E', octave: 4, tieStop: true }),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    // Both notes are in the same measure, same voice → total = 4 beats
    assert.equal(report.measures[0].actualBeats, 4)
    assert.equal(report.measures[0].status, 'valid')
  })

  test('tie across measures does not inflate either measure', () => {
    // Measure 1: half note with tie start (2 beats) + quarter (1 beat) + quarter (1 beat) = 4
    // Measure 2: half note with tie stop (2 beats) + half note (2 beats) = 4
    const notes = [
      makeScoreNote({ measure: 1, beats: 2, duration: 'half', durationValue: 8, divisions: 4, step: 'E', octave: 4, tieStart: true }),
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 2, beats: 2, duration: 'half', durationValue: 8, divisions: 4, step: 'E', octave: 4, tieStop: true }),
      makeScoreNote({ measure: 2, beats: 2, duration: 'half', durationValue: 8, divisions: 4 }),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    const m1 = report.measures.find((m) => m.measureNumber === 1)
    const m2 = report.measures.find((m) => m.measureNumber === 2)
    assert.equal(m1.actualBeats, 4)
    assert.equal(m1.status, 'valid')
    assert.equal(m2.actualBeats, 4)
    assert.equal(m2.status, 'valid')
  })
})

describe('12. Floating-point tolerance', () => {
  test('0.001 difference does not produce error', () => {
    // Simulate a tiny floating-point imprecision: 4 beats vs 4.001
    const notes = [
      makeScoreNote({ measure: 1, beats: 1.00025, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 1.00025, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 1.00025, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 1.00025, duration: 'quarter', durationValue: 4, divisions: 4 }),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    assert.equal(report.measures[0].status, 'valid')
    assert.ok(Math.abs(report.measures[0].difference) <= QUALITY_THRESHOLDS.tolerance)
  })
})

describe('13. Pickup/implicit measure', () => {
  test('underfilled pickup measure is not marked as error', () => {
    const notes = [
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      {
        timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }],
        measureMetadata: [{ number: 1, pickup: true }],
      }
    )
    assert.equal(report.measures[0].status, 'underfilled')
    assert.equal(report.measures[0].severity, 'none')
    assert.ok(report.measures[0].reasons.some((r) => r.includes('implicit/pickup')))
  })

  test('implicit measure is not marked as error', () => {
    const notes = [
      makeScoreNote({ measure: 3, beats: 2, duration: 'half', durationValue: 8, divisions: 4 }),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      {
        timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }],
        measureMetadata: [{ number: 3, implicit: true }],
      }
    )
    const m3 = report.measures.find((m) => m.measureNumber === 3)
    assert.equal(m3.status, 'underfilled')
    assert.equal(m3.severity, 'none')
  })

  test('without metadata, underfilled measure is still flagged (limitation noted)', () => {
    const notes = [
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    assert.equal(report.measures[0].status, 'underfilled')
    assert.equal(report.measures[0].severity, 'error')
  })
})

describe('14. Missing time-signature returns unknown', () => {
  test('no time signatures → unknown status', () => {
    const notes = [
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
    ]
    const report = validateOmrMeasureDurations(makeScore(notes))
    assert.equal(report.measures[0].status, 'unknown')
    assert.equal(report.measures[0].severity, 'none')
    assert.equal(report.measures[0].expectedBeats, null)
    assert.ok(report.measures[0].reasons.some((r) => r.includes('Time signature')))
  })
})

describe('15. Aggregate qualityStatus', () => {
  test('all valid → good', () => {
    const notes = Array.from({ length: 4 }, () =>
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 })
    )
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    assert.equal(report.qualityStatus, 'good')
    assert.equal(report.errorMeasures, 0)
    assert.equal(report.warningMeasures, 0)
  })

  test('one warning, no errors → review_required', () => {
    // 3.5 beats in 4/4 → difference 0.5, below error threshold of 1.0
    const notes = [
      makeScoreNote({ measure: 1, beats: 1.5, duration: 'dotted-quarter', durationValue: 6, divisions: 4, dotCount: 1 }),
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
      makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
    ]
    const report = validateOmrMeasureDurations(
      makeScore(notes),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    assert.equal(report.measures[0].actualBeats, 3.5)
    assert.equal(report.measures[0].severity, 'warning')
    assert.equal(report.qualityStatus, 'review_required')
  })

  test('error ratio >= 20% → unreliable', () => {
    // 2 measures: 1 valid, 1 empty (error) → 50% error ratio
    const notes = [
      ...Array.from({ length: 4 }, () => makeScoreNote({ measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 })),
      makeScoreNote({ measure: 2, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
    ]
    // Measure 2 has notes, but measure 3 is empty → need 3 measures
    const notesWithEmpty = [
      ...notes,
      ...Array.from({ length: 4 }, () => makeScoreNote({ measure: 3, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 })),
      makeScoreNote({ measure: 4, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4 }),
    ]
    // measure 4 has only 1 note → underfilled error
    const report = validateOmrMeasureDurations(
      makeScore(notesWithEmpty),
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    // measures 1 and 3 are valid, measure 2 is underfilled (error), measure 4 is underfilled (error)
    // 2 errors out of 4 = 50% → unreliable
    assert.equal(report.errorMeasures, 2)
    assert.equal(report.totalMeasures, 4)
    assert.equal(report.qualityStatus, 'unreliable')
  })
})
