import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { formatNoteAsText, beatsToTurkishText } from '../rhythmicTextGenerator.js'
import { createNote, DURATION_TYPES } from '../noteTheory.js'

// Helper: create a note-like object with explicit beats and durationValue/divisions
function makeNote({ duration, beats, durationValue, divisions, isRest = false, dotCount = 0 }) {
  const note = createNote({
    duration,
    beats,
    dotCount,
    isRest,
    stringLetter: 'G',
    fret: 2,
    noteName: 'La',
  })
  if (durationValue !== undefined) note.durationValue = durationValue
  if (divisions !== undefined) note.divisions = divisions
  if (beats !== undefined) note.beats = beats
  return note
}

describe('beatsToTurkishText', () => {
  test('0.25 → çeyrek vuruş', () => {
    assert.equal(beatsToTurkishText(0.25), 'çeyrek vuruş')
  })
  test('0.5 → yarım vuruş', () => {
    assert.equal(beatsToTurkishText(0.5), 'yarım vuruş')
  })
  test('1 → bir vuruş', () => {
    assert.equal(beatsToTurkishText(1), 'bir vuruş')
  })
  test('1.5 → bir buçuk vuruş', () => {
    assert.equal(beatsToTurkishText(1.5), 'bir buçuk vuruş')
  })
  test('2 → iki vuruş', () => {
    assert.equal(beatsToTurkishText(2), 'iki vuruş')
  })
  test('3 → üç vuruş', () => {
    assert.equal(beatsToTurkishText(3), 'üç vuruş')
  })
  test('4 → dört vuruş', () => {
    assert.equal(beatsToTurkishText(4), 'dört vuruş')
  })
  test('other valid value preserves numeric duration', () => {
    assert.equal(beatsToTurkishText(2.5), '2.5 vuruş')
  })
})

describe('note beat-duration from duration/divisions', () => {
  test('eighth note: duration=1, divisions=2 → 0.5 beats, yarım vuruş', () => {
    const note = makeNote({ duration: 'eighth', durationValue: 1, divisions: 2 })
    const text = formatNoteAsText(note)
    assert.equal(note.beats, 0.5)
    assert.match(text, /yarım vuruş/)
  })

  test('quarter note: duration=2, divisions=2 → 1 beat, bir vuruş', () => {
    const note = makeNote({ duration: 'quarter', durationValue: 2, divisions: 2 })
    const text = formatNoteAsText(note)
    assert.equal(note.beats, 1)
    assert.match(text, /bir vuruş/)
  })

  test('dotted quarter note: duration=3, divisions=2 → 1.5 beats, bir buçuk vuruş', () => {
    const note = makeNote({ duration: 'dotted-quarter', beats: 1.5, durationValue: 3, divisions: 2, dotCount: 1 })
    const text = formatNoteAsText(note)
    assert.equal(note.beats, 1.5)
    assert.match(text, /bir buçuk vuruş/)
    assert.match(text, /noktalı dörtlük nota/)
  })

  test('half note: duration=4, divisions=2 → 2 beats, iki vuruş', () => {
    const note = makeNote({ duration: 'half', durationValue: 4, divisions: 2 })
    const text = formatNoteAsText(note)
    assert.equal(note.beats, 2)
    assert.match(text, /iki vuruş/)
  })

  test('dotted half note: duration=6, divisions=2 → 3 beats, üç vuruş', () => {
    const note = makeNote({ duration: 'dotted-half', beats: 3, durationValue: 6, divisions: 2, dotCount: 1 })
    const text = formatNoteAsText(note)
    assert.equal(note.beats, 3)
    assert.match(text, /üç vuruş/)
    assert.match(text, /noktalı ikilik nota/)
  })

  test('sixteenth note: duration=1, divisions=4 → 0.25 beats, çeyrek vuruş', () => {
    const note = makeNote({ duration: 'sixteenth', durationValue: 1, divisions: 4 })
    const text = formatNoteAsText(note)
    assert.equal(note.beats, 0.25)
    assert.match(text, /çeyrek vuruş/)
  })
})

describe('rest beat-duration from duration/divisions', () => {
  test('eighth rest: duration=1, divisions=2 → 0.5 beats, yarım vuruş', () => {
    const note = makeNote({ duration: 'eighth', durationValue: 1, divisions: 2, isRest: true })
    const text = formatNoteAsText(note)
    assert.equal(note.beats, 0.5)
    assert.match(text, /yarım vuruş/)
  })

  test('quarter rest: duration=2, divisions=2 → 1 beat, bir vuruş', () => {
    const note = makeNote({ duration: 'quarter', durationValue: 2, divisions: 2, isRest: true })
    const text = formatNoteAsText(note)
    assert.equal(note.beats, 1)
    assert.match(text, /bir vuruş/)
  })

  test('dotted quarter rest: duration=3, divisions=2 → 1.5 beats, bir buçuk vuruş', () => {
    const note = makeNote({ duration: 'dotted-quarter', beats: 1.5, durationValue: 3, divisions: 2, isRest: true, dotCount: 1 })
    const text = formatNoteAsText(note)
    assert.equal(note.beats, 1.5)
    assert.match(text, /bir buçuk vuruş/)
  })

  test('half rest: duration=4, divisions=2 → 2 beats, iki vuruş', () => {
    const note = makeNote({ duration: 'half', durationValue: 4, divisions: 2, isRest: true })
    const text = formatNoteAsText(note)
    assert.equal(note.beats, 2)
    assert.match(text, /iki vuruş/)
  })

  test('dotted half rest: duration=6, divisions=2 → 3 beats, üç vuruş', () => {
    const note = makeNote({ duration: 'dotted-half', beats: 3, durationValue: 6, divisions: 2, isRest: true, dotCount: 1 })
    const text = formatNoteAsText(note)
    assert.equal(note.beats, 3)
    assert.match(text, /üç vuruş/)
  })

  test('sixteenth rest: duration=1, divisions=4 → 0.25 beats, çeyrek vuruş', () => {
    const note = makeNote({ duration: 'sixteenth', durationValue: 1, divisions: 4, isRest: true })
    const text = formatNoteAsText(note)
    assert.equal(note.beats, 0.25)
    assert.match(text, /çeyrek vuruş/)
  })
})

describe('regression: eighth → dotted quarter → quarter sequence', () => {
  test('produces correct Turkish rhythmic text without modifying playback', () => {
    const eighth = makeNote({ duration: 'eighth', durationValue: 1, divisions: 2 })
    const dottedQuarter = makeNote({ duration: 'dotted-quarter', beats: 1.5, durationValue: 3, divisions: 2, dotCount: 1 })
    const quarter = makeNote({ duration: 'quarter', durationValue: 2, divisions: 2 })

    const texts = [eighth, dottedQuarter, quarter].map(formatNoteAsText)

    assert.equal(eighth.beats, 0.5)
    assert.equal(dottedQuarter.beats, 1.5)
    assert.equal(quarter.beats, 1)

    assert.match(texts[0], /yarım vuruş/)
    assert.match(texts[1], /bir buçuk vuruş/)
    assert.match(texts[2], /bir vuruş/)

    assert.match(texts[0], /sekizlik nota/)
    assert.match(texts[1], /noktalı dörtlük nota/)
    assert.match(texts[2], /dörtlük nota/)
  })
})

describe('no silent fallback to 1 beat', () => {
  test('dotted quarter with explicit beats=1.5 does not become 1', () => {
    const note = makeNote({ duration: 'dotted-quarter', beats: 1.5, dotCount: 1 })
    const text = formatNoteAsText(note)
    assert.equal(note.beats, 1.5)
    assert.match(text, /bir buçuk vuruş/)
    assert.doesNotMatch(text, /\bbir vuruş\b/)
  })
})
