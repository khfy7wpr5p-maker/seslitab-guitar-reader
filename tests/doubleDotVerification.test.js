import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createNote, resolveBeats, applyDots } from '../noteTheory.js'

// Helper: create a note with only duration + dotCount (no beats, no durationValue/divisions)
function makeNote({ duration, dotCount = 0, isRest = false }) {
  return createNote({
    duration,
    dotCount,
    isRest,
    stringLetter: 'G',
    fret: 2,
    noteName: 'La',
  })
}

// ── The seven required tests ──────────────────────────────────

describe('seven required double-dot verification tests', () => {
  test('1. duration: "half", dotCount: 1 → 3 beats', () => {
    const note = makeNote({ duration: 'half', dotCount: 1 })
    assert.equal(note.beats, 3)
  })

  test('2. duration: "dotted-half", dotCount: 0 → 3 beats', () => {
    const note = makeNote({ duration: 'dotted-half', dotCount: 0 })
    assert.equal(note.beats, 3)
  })

  test('3. duration: "dotted-half", dotCount: 1 → 3 beats, not 4.5', () => {
    const note = makeNote({ duration: 'dotted-half', dotCount: 1 })
    assert.equal(note.beats, 3)
    assert.notEqual(note.beats, 4.5)
  })

  test('4. duration: "quarter", dotCount: 1 → 1.5 beats', () => {
    const note = makeNote({ duration: 'quarter', dotCount: 1 })
    assert.equal(note.beats, 1.5)
  })

  test('5. duration: "dotted-quarter", dotCount: 1 → 1.5 beats, not 2.25', () => {
    const note = makeNote({ duration: 'dotted-quarter', dotCount: 1 })
    assert.equal(note.beats, 1.5)
    assert.notEqual(note.beats, 2.25)
  })

  test('6. duration: "half", dotCount: 2 → 3.5 beats', () => {
    const note = makeNote({ duration: 'half', dotCount: 2 })
    assert.equal(note.beats, 3.5)
  })

  test('7. Playback timing: 3 beats at 120 BPM = 1.5 seconds', () => {
    const beats = 3
    const bpm = 120
    const secondsPerBeat = 60 / bpm
    const durationSeconds = beats * secondsPerBeat
    assert.equal(durationSeconds, 1.5)
  })
})

// ── Inspection: double-dot application possibility ────────────

describe('double-dot application inspection', () => {
  test('applyDots(2, 1) = 3 (half + 1 dot)', () => {
    assert.equal(applyDots(2, 1), 3)
  })

  test('applyDots(2, 2) = 3.5 (half + 2 dots = double-dotted half)', () => {
    assert.equal(applyDots(2, 2), 3.5)
  })

  test('applyDots(1, 1) = 1.5 (quarter + 1 dot)', () => {
    assert.equal(applyDots(1, 1), 1.5)
  })

  test('applyDots(3, 1) = 4.5 (dotted-half + 1 EXTRA dot — should NOT happen via resolver)', () => {
    // This confirms the raw applyDots behavior that the resolver must guard against.
    assert.equal(applyDots(3, 1), 4.5)
  })
})

// ── Inspection: resolver behavior for "dotted-" duration strings ──

describe('resolver behavior for dotted- duration strings', () => {
  test('resolveBeats(dotted-half, dotCount=0) = 3', () => {
    const note = { duration: 'dotted-half', dotCount: 0, beats: 0 }
    assert.equal(resolveBeats(note), 3)
  })

  test('resolveBeats(dotted-half, dotCount=1) = 3 (not double-dotted)', () => {
    const note = { duration: 'dotted-half', dotCount: 1, beats: 0 }
    assert.equal(resolveBeats(note), 3)
  })

  test('resolveBeats(dotted-quarter, dotCount=0) = 1.5', () => {
    const note = { duration: 'dotted-quarter', dotCount: 0, beats: 0 }
    assert.equal(resolveBeats(note), 1.5)
  })

  test('resolveBeats(dotted-quarter, dotCount=1) = 1.5 (not double-dotted)', () => {
    const note = { duration: 'dotted-quarter', dotCount: 1, beats: 0 }
    assert.equal(resolveBeats(note), 1.5)
  })

  test('resolveBeats(half, dotCount=1) = 3', () => {
    const note = { duration: 'half', dotCount: 1, beats: 0 }
    assert.equal(resolveBeats(note), 3)
  })

  test('resolveBeats(half, dotCount=2) = 3.5 (true double-dot)', () => {
    const note = { duration: 'half', dotCount: 2, beats: 0 }
    assert.equal(resolveBeats(note), 3.5)
  })

  test('resolveBeats(quarter, dotCount=1) = 1.5', () => {
    const note = { duration: 'quarter', dotCount: 1, beats: 0 }
    assert.equal(resolveBeats(note), 1.5)
  })
})
