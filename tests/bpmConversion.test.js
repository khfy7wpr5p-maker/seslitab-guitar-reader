import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { millisecondsPerBeat, bpmToSpeed } from '../src/services/voiceService.js'
import { createNote, resolveBeats, buildTieChains, tieChainBeats } from '../noteTheory.js'

describe('BPM to milliseconds per beat: standard formula 60000 / BPM', () => {
  test('60 BPM produces 1000 ms per beat', () => {
    assert.equal(millisecondsPerBeat(60), 1000)
  })

  test('120 BPM produces 500 ms per beat', () => {
    assert.equal(millisecondsPerBeat(120), 500)
  })

  test('180 BPM produces approximately 333.33 ms per beat', () => {
    assert.ok(Math.abs(millisecondsPerBeat(180) - 333.333333) < 0.01)
  })
})

describe('BPM to speed multiplier: higher BPM = faster playback', () => {
  test('180 BPM plays faster than 120 BPM', () => {
    assert.ok(bpmToSpeed(180) > bpmToSpeed(120))
  })

  test('120 BPM plays faster than 60 BPM', () => {
    assert.ok(bpmToSpeed(120) > bpmToSpeed(60))
  })

  test('120 BPM produces speed multiplier of 1.0', () => {
    assert.equal(bpmToSpeed(120), 1)
  })

  test('60 BPM produces speed multiplier of 0.5', () => {
    assert.equal(bpmToSpeed(60), 0.5)
  })

  test('180 BPM produces speed multiplier of 1.5', () => {
    assert.equal(bpmToSpeed(180), 1.5)
  })
})

describe('BPM validation: invalid values handled safely', () => {
  test('0 BPM falls back to 120 BPM baseline (500 ms)', () => {
    assert.equal(millisecondsPerBeat(0), 500)
    assert.equal(bpmToSpeed(0), 1)
  })

  test('negative BPM falls back to 120 BPM baseline', () => {
    assert.equal(millisecondsPerBeat(-60), 500)
    assert.equal(bpmToSpeed(-60), 1)
  })

  test('NaN falls back to 120 BPM baseline', () => {
    assert.equal(millisecondsPerBeat(NaN), 500)
    assert.equal(bpmToSpeed(NaN), 1)
  })

  test('undefined falls back to 120 BPM baseline', () => {
    assert.equal(millisecondsPerBeat(undefined), 500)
    assert.equal(bpmToSpeed(undefined), 1)
  })

  test('empty string falls back to 120 BPM baseline', () => {
    assert.equal(millisecondsPerBeat(Number('')), 500)
    assert.equal(bpmToSpeed(Number('')), 1)
  })
})

describe('Existing note-duration ratios remain unchanged', () => {
  test('quarter note still 1 beat', () => {
    const note = createNote({ duration: 'quarter', stringLetter: 'e', fret: 0, noteName: 'Mi' })
    note.durationValue = 4
    note.divisions = 4
    assert.equal(resolveBeats(note), 1)
  })

  test('eighth note still 0.5 beats', () => {
    const note = createNote({ duration: 'eighth', stringLetter: 'e', fret: 0, noteName: 'Mi' })
    note.durationValue = 2
    note.divisions = 4
    assert.equal(resolveBeats(note), 0.5)
  })

  test('half note still 2 beats', () => {
    const note = createNote({ duration: 'half', stringLetter: 'e', fret: 0, noteName: 'Mi' })
    note.durationValue = 8
    note.divisions = 4
    assert.equal(resolveBeats(note), 2)
  })

  test('whole note still 4 beats', () => {
    const note = createNote({ duration: 'whole', stringLetter: 'e', fret: 0, noteName: 'Mi' })
    note.durationValue = 16
    note.divisions = 4
    assert.equal(resolveBeats(note), 4)
  })

  test('dotted-quarter still 1.5 beats', () => {
    const note = createNote({ duration: 'dotted-quarter', dotCount: 1, stringLetter: 'e', fret: 0, noteName: 'Mi' })
    note.durationValue = 6
    note.divisions = 4
    assert.equal(resolveBeats(note), 1.5)
  })

  test('dotted-half still 3 beats', () => {
    const note = createNote({ duration: 'dotted-half', dotCount: 1, stringLetter: 'e', fret: 0, noteName: 'Mi' })
    note.durationValue = 12
    note.divisions = 4
    assert.equal(resolveBeats(note), 3)
  })
})

describe('Tied and dotted notes still use existing beat values', () => {
  test('tie chain 2 + 3 beats = 5 beats total', () => {
    const n1 = createNote({ duration: 'half', beats: 2, step: 'E', octave: 4, stringLetter: 'e', fret: 0, noteName: 'Mi', tieStart: true })
    const n2 = createNote({ duration: 'dotted-half', beats: 3, dotCount: 1, step: 'E', octave: 4, stringLetter: 'e', fret: 0, noteName: 'Mi', tieStop: true })
    const { chains } = buildTieChains([n1, n2])
    assert.equal(tieChainBeats(chains[0]), 5)
  })

  test('dotted-half note beats unaffected by BPM conversion', () => {
    const note = createNote({ duration: 'dotted-half', dotCount: 1, beats: 3, stringLetter: 'e', fret: 0, noteName: 'Mi' })
    assert.equal(resolveBeats(note), 3)
  })
})
