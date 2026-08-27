import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  STRUCTURAL_FINDING_CLASS,
  STRUCTURAL_FINDING_CODE,
  STRUCTURAL_FINDING_SEVERITY,
  validateStructuralRhythm,
} from '../src/services/structuralRhythmValidator.js'

function context({ partId = 'P1', partIndex = 0, measureIndex = 0, measureNumber = 1 } = {}) {
  return {
    partId,
    partIndex,
    measureIndex,
    measureNumber,
    measureKey: `${partId}:${measureIndex}`,
  }
}

function noteEvent({
  sequenceIndex,
  durationValue = 4,
  voice = 1,
  staff = 1,
  isChordNote = false,
  isGrace = false,
  ...measureContext
}) {
  return {
    ...measureContext,
    sequenceIndex,
    type: 'note',
    durationValue,
    voice,
    staff,
    isChordNote,
    isGrace,
  }
}

function scoreNote({
  durationValue = 4,
  divisions = 4,
  beats = durationValue / divisions,
  voice = 1,
  staff = 1,
  step = 'C',
  alter = 0,
  octave = 4,
  isChordNote = false,
  isGrace = false,
  tieStart = false,
  tieStop = false,
  tuplet = null,
  beam = null,
  ...measureContext
}) {
  return {
    ...measureContext,
    durationValue,
    divisions,
    beats: isGrace ? 0 : beats,
    duration: 'quarter',
    voice,
    staff,
    step,
    alter,
    octave,
    isChordNote,
    isGrace,
    isRest: false,
    tieStart,
    tieStop,
    tuplet,
    beam,
  }
}

function makeStructuredScore({
  measureContexts = [context()],
  notes = [],
  measureEvents = [],
  timeSignatures = null,
  divisions = 4,
  parts = null,
} = {}) {
  const signatures = timeSignatures ?? measureContexts.map((ctx, index) => ({
    ...ctx,
    beats: 4,
    beatType: 4,
    ...(index === 0 ? {} : { inheritedForTest: true }),
  }))

  return {
    notes,
    parts: parts ?? [...new Map(measureContexts.map((ctx) => [ctx.partId, {
      partId: ctx.partId,
      partIndex: ctx.partIndex,
      measureCount: measureContexts.filter((item) => item.partId === ctx.partId).length,
      pitchedNoteCount: notes.filter((note) => note.partId === ctx.partId && !note.isRest).length,
      restCount: notes.filter((note) => note.partId === ctx.partId && note.isRest).length,
    }])).values()],
    primaryPartId: measureContexts[0]?.partId ?? null,
    timeSignatures: signatures,
    divisionsByMeasure: measureContexts.map((ctx) => ({ ...ctx, divisions })),
    measureMetadata: measureContexts.map((ctx) => ({ ...ctx, implicit: false, nonControlling: false })),
    measureEvents,
  }
}

function quarterMeasure(ctx, { voice = 1, staff = 1, firstSequence = 1 } = {}) {
  return {
    notes: Array.from({ length: 4 }, () => scoreNote({ ...ctx, voice, staff })),
    events: Array.from({ length: 4 }, (_, index) => noteEvent({
      ...ctx,
      sequenceIndex: firstSequence + index,
      voice,
      staff,
    })),
  }
}

describe('Package 2B structural finding contract', () => {
  test('finding vocabularies are immutable and use distinct structural/OMR classes', () => {
    assert.ok(Object.isFrozen(STRUCTURAL_FINDING_CLASS))
    assert.ok(Object.isFrozen(STRUCTURAL_FINDING_CODE))
    assert.ok(Object.isFrozen(STRUCTURAL_FINDING_SEVERITY))
    assert.notEqual(
      STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR,
      STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
    )
  })

  test('underfilled measure produces location-rich suspected OMR finding', () => {
    const ctx = context()
    const score = makeStructuredScore({
      notes: [scoreNote({ ...ctx })],
      measureEvents: [
        { ...ctx, sequenceIndex: 0, type: 'attributes' },
        noteEvent({ ...ctx, sequenceIndex: 1 }),
      ],
      timeSignatures: [{ ...ctx, beats: 4, beatType: 4 }],
    })

    const result = validateStructuralRhythm(score)
    const finding = result.findings.find((item) => item.code === STRUCTURAL_FINDING_CODE.MEASURE_UNDERFILLED)

    assert.ok(finding)
    assert.equal(finding.classification, STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR)
    assert.equal(finding.partId, 'P1')
    assert.equal(finding.measureKey, 'P1:0')
    assert.equal(finding.measureNumber, 1)
    assert.equal(finding.voice, null)
    assert.equal(finding.expected, 4)
    assert.equal(finding.actual, 1)
  })

  test('valid independent voices are not added together and do not overlap each other', () => {
    const ctx = context()
    const voice1 = quarterMeasure(ctx, { voice: 1, firstSequence: 1 })
    const voice2 = quarterMeasure(ctx, { voice: 2, firstSequence: 6 })
    const score = makeStructuredScore({
      notes: [...voice1.notes, ...voice2.notes],
      measureEvents: [
        { ...ctx, sequenceIndex: 0, type: 'attributes' },
        ...voice1.events,
        { ...ctx, sequenceIndex: 5, type: 'backup', durationDivisions: 16 },
        ...voice2.events,
      ],
      timeSignatures: [{ ...ctx, beats: 4, beatType: 4 }],
    })

    const result = validateStructuralRhythm(score)

    assert.equal(result.measureReport.measures[0].actualBeats, 4)
    assert.equal(result.measureReport.measures[0].status, 'valid')
    assert.equal(result.findings.some((item) => item.code === STRUCTURAL_FINDING_CODE.VOICE_OVERLAP), false)
  })

  test('overlap inside the same voice and staff is located exactly', () => {
    const ctx = context()
    const score = makeStructuredScore({
      notes: [
        scoreNote({ ...ctx, durationValue: 8, beats: 2, voice: 1 }),
        scoreNote({ ...ctx, durationValue: 4, beats: 1, voice: 1 }),
      ],
      measureEvents: [
        { ...ctx, sequenceIndex: 0, type: 'attributes' },
        noteEvent({ ...ctx, sequenceIndex: 1, durationValue: 8, voice: 1 }),
        { ...ctx, sequenceIndex: 2, type: 'backup', durationDivisions: 4 },
        noteEvent({ ...ctx, sequenceIndex: 3, durationValue: 4, voice: 1 }),
      ],
      timeSignatures: [{ ...ctx, beats: 2, beatType: 4 }],
    })

    const result = validateStructuralRhythm(score)
    const overlap = result.findings.find((item) => item.code === STRUCTURAL_FINDING_CODE.VOICE_OVERLAP)

    assert.ok(overlap)
    assert.equal(overlap.partId, 'P1')
    assert.equal(overlap.measureKey, 'P1:0')
    assert.equal(overlap.voice, 1)
    assert.equal(overlap.staff, 1)
    assert.equal(overlap.expected, 2)
    assert.equal(overlap.actual, 1)
  })

  test('event extending beyond measure boundary is reported separately from overfill', () => {
    const ctx = context()
    const score = makeStructuredScore({
      notes: [scoreNote({ ...ctx, durationValue: 20, beats: 5 })],
      measureEvents: [
        { ...ctx, sequenceIndex: 0, type: 'attributes' },
        noteEvent({ ...ctx, sequenceIndex: 1, durationValue: 20 }),
      ],
      timeSignatures: [{ ...ctx, beats: 4, beatType: 4 }],
    })

    const result = validateStructuralRhythm(score)

    assert.ok(result.findings.some((item) => item.code === STRUCTURAL_FINDING_CODE.MEASURE_OVERFILLED))
    const boundary = result.findings.find((item) => item.code === STRUCTURAL_FINDING_CODE.EVENT_EXCEEDS_MEASURE_BOUNDARY)
    assert.ok(boundary)
    assert.equal(boundary.expected, 4)
    assert.equal(boundary.actual, 5)
  })

  test('a chord continuation without compatible base note is a definite structural error', () => {
    const ctx = context()
    const score = makeStructuredScore({
      notes: [scoreNote({ ...ctx, isChordNote: true, voice: 2 })],
      measureEvents: [
        { ...ctx, sequenceIndex: 0, type: 'attributes' },
        noteEvent({ ...ctx, sequenceIndex: 1, isChordNote: true, voice: 2 }),
      ],
      timeSignatures: [{ ...ctx, beats: 1, beatType: 4 }],
    })

    const result = validateStructuralRhythm(score)
    const chord = result.findings.find((item) => item.code === STRUCTURAL_FINDING_CODE.CHORD_WITHOUT_BASE_NOTE)

    assert.ok(chord)
    assert.equal(chord.classification, STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR)
    assert.equal(chord.voice, 2)
    assert.equal(chord.staff, 1)
  })

  test('matching tie chain is accepted while unmatched stop is review finding', () => {
    const m1 = context({ measureIndex: 0, measureNumber: 1 })
    const m2 = context({ measureIndex: 1, measureNumber: 2 })
    const score = makeStructuredScore({
      measureContexts: [m1, m2],
      notes: [
        scoreNote({ ...m1, durationValue: 16, beats: 4, step: 'E', tieStart: true }),
        scoreNote({ ...m2, durationValue: 8, beats: 2, step: 'E', tieStop: true }),
        scoreNote({ ...m2, durationValue: 8, beats: 2, step: 'F', tieStop: true }),
      ],
      measureEvents: [
        { ...m1, sequenceIndex: 0, type: 'attributes' },
        noteEvent({ ...m1, sequenceIndex: 1, durationValue: 16 }),
        noteEvent({ ...m2, sequenceIndex: 0, durationValue: 8 }),
        noteEvent({ ...m2, sequenceIndex: 1, durationValue: 8 }),
      ],
      timeSignatures: [{ ...m1, beats: 4, beatType: 4 }],
    })

    const result = validateStructuralRhythm(score)

    assert.equal(
      result.findings.some((item) => item.code === STRUCTURAL_FINDING_CODE.TIE_START_WITHOUT_STOP && item.measureKey === 'P1:0'),
      false,
    )
    const unmatched = result.findings.find((item) => item.code === STRUCTURAL_FINDING_CODE.TIE_STOP_WITHOUT_START)
    assert.ok(unmatched)
    assert.equal(unmatched.measureKey, 'P1:1')
    assert.equal(unmatched.actual, 'tie stop')
  })

  test('valid tuplet ratio is accepted and malformed ratio fails structurally', () => {
    const ctx = context()
    const score = makeStructuredScore({
      notes: [
        scoreNote({ ...ctx, tuplet: { actualNotes: 3, normalNotes: 2 } }),
        scoreNote({ ...ctx, tuplet: { actualNotes: 0, normalNotes: 2 }, step: 'D' }),
      ],
      measureEvents: [
        { ...ctx, sequenceIndex: 0, type: 'attributes' },
        noteEvent({ ...ctx, sequenceIndex: 1 }),
        noteEvent({ ...ctx, sequenceIndex: 2 }),
      ],
      timeSignatures: [{ ...ctx, beats: 2, beatType: 4 }],
    })

    const result = validateStructuralRhythm(score)
    const tuplets = result.findings.filter((item) => item.code === STRUCTURAL_FINDING_CODE.INVALID_TUPLET_RATIO)

    assert.equal(tuplets.length, 1)
    assert.equal(tuplets[0].classification, STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR)
    assert.deepEqual(tuplets[0].actual, { actualNotes: 0, normalNotes: 2 })
  })

  test('beam begin/end is valid while orphan beam continuation is review finding', () => {
    const ctx = context()
    const score = makeStructuredScore({
      notes: [
        scoreNote({ ...ctx, beam: [{ number: 1, value: 'begin' }] }),
        scoreNote({ ...ctx, beam: [{ number: 1, value: 'end' }], step: 'D' }),
        scoreNote({ ...ctx, beam: [{ number: 2, value: 'continue' }], step: 'E' }),
      ],
      measureEvents: [
        { ...ctx, sequenceIndex: 0, type: 'attributes' },
        noteEvent({ ...ctx, sequenceIndex: 1 }),
        noteEvent({ ...ctx, sequenceIndex: 2 }),
        noteEvent({ ...ctx, sequenceIndex: 3 }),
      ],
      timeSignatures: [{ ...ctx, beats: 3, beatType: 4 }],
    })

    const result = validateStructuralRhythm(score)
    const orphan = result.findings.filter((item) => item.code === STRUCTURAL_FINDING_CODE.BEAM_WITHOUT_BEGIN)

    assert.equal(orphan.length, 1)
    assert.equal(orphan[0].classification, STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR)
    assert.equal(orphan[0].actual, 'continue')
  })

  test('multi-part findings preserve part and measure identity', () => {
    const p1 = context({ partId: 'P1', partIndex: 0, measureIndex: 0, measureNumber: 7 })
    const p2 = context({ partId: 'P2', partIndex: 1, measureIndex: 0, measureNumber: 7 })
    const p1Measure = quarterMeasure(p1)
    const score = makeStructuredScore({
      measureContexts: [p1, p2],
      notes: [...p1Measure.notes, scoreNote({ ...p2 })],
      measureEvents: [
        { ...p1, sequenceIndex: 0, type: 'attributes' },
        ...p1Measure.events,
        { ...p2, sequenceIndex: 0, type: 'attributes' },
        noteEvent({ ...p2, sequenceIndex: 1 }),
      ],
      timeSignatures: [
        { ...p1, beats: 4, beatType: 4 },
        { ...p2, beats: 4, beatType: 4 },
      ],
      parts: [
        { partId: 'P1', partIndex: 0, measureCount: 1, pitchedNoteCount: 4, restCount: 0 },
        { partId: 'P2', partIndex: 1, measureCount: 1, pitchedNoteCount: 1, restCount: 0 },
      ],
    })

    const result = validateStructuralRhythm(score)
    const p2Finding = result.findings.find((item) =>
      item.code === STRUCTURAL_FINDING_CODE.MEASURE_UNDERFILLED && item.partId === 'P2'
    )

    assert.ok(p2Finding)
    assert.equal(p2Finding.measureKey, 'P2:0')
    assert.equal(p2Finding.measureNumber, 7)
  })

  test('validation is read-only and does not mutate structured musical data', () => {
    const ctx = context()
    const measure = quarterMeasure(ctx)
    const score = makeStructuredScore({
      notes: measure.notes,
      measureEvents: [
        { ...ctx, sequenceIndex: 0, type: 'attributes' },
        ...measure.events,
      ],
      timeSignatures: [{ ...ctx, beats: 4, beatType: 4 }],
    })
    const before = structuredClone(score)

    validateStructuralRhythm(score)

    assert.deepEqual(score, before)
  })

  test('malformed top-level input fails closed', () => {
    assert.throws(() => validateStructuralRhythm(null), TypeError)
    assert.throws(() => validateStructuralRhythm([]), TypeError)
  })
})
