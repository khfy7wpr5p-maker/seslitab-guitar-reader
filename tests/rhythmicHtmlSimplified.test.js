import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { generateTurkishRhythmicHtml, formatNoteAsText } from '../rhythmicTextGenerator.js'
import { createNote } from '../noteTheory.js'

function makeNote({ duration = 'quarter', dotCount = 0, isRest = false, stringLetter = 'e', fret = 0, noteName = 'Mi', beats, tieStart = false, tieStop = false }) {
  return createNote({
    duration,
    dotCount,
    isRest,
    stringLetter,
    fret,
    noteName,
    beats,
    tieStart,
    tieStop,
  })
}

describe('Rhythmic HTML: note-value and beat descriptions absent', () => {
  test('quarter note: no duration or beat text', () => {
    const note = makeNote({ duration: 'quarter', fret: 0, noteName: 'Mi' })
    const html = generateTurkishRhythmicHtml([note])
    assert.doesNotMatch(html, /dörtlük nota/)
    assert.doesNotMatch(html, /bir vuruş/)
    assert.match(html, /Mi notası/)
  })

  test('eighth note: no "sekizlik nota" or "yarım vuruş"', () => {
    const note = makeNote({ duration: 'eighth', fret: 0, noteName: 'Mi' })
    const html = generateTurkishRhythmicHtml([note])
    assert.doesNotMatch(html, /sekizlik nota/)
    assert.doesNotMatch(html, /yarım vuruş/)
    assert.match(html, /Mi notası/)
  })

  test('half note: no "ikilik nota" or "iki vuruş"', () => {
    const note = makeNote({ duration: 'half', fret: 0, noteName: 'Mi' })
    const html = generateTurkishRhythmicHtml([note])
    assert.doesNotMatch(html, /ikilik nota/)
    assert.doesNotMatch(html, /iki vuruş/)
    assert.match(html, /Mi notası/)
  })

  test('dotted half note: no "noktalı ikilik nota" or "üç vuruş"', () => {
    const note = makeNote({ duration: 'dotted-half', dotCount: 1, fret: 0, noteName: 'Mi', beats: 3 })
    const html = generateTurkishRhythmicHtml([note])
    assert.doesNotMatch(html, /noktalı ikilik nota/)
    assert.doesNotMatch(html, /üç vuruş/)
    assert.match(html, /Mi notası/)
  })

  test('whole note: no "birlik nota" or "dört vuruş"', () => {
    const note = makeNote({ duration: 'whole', fret: 0, noteName: 'Mi' })
    const html = generateTurkishRhythmicHtml([note])
    assert.doesNotMatch(html, /birlik nota/)
    assert.doesNotMatch(html, /dört vuruş/)
    assert.match(html, /Mi notası/)
  })

  test('sixteenth note: no "on altılık nota"', () => {
    const note = makeNote({ duration: 'sixteenth', fret: 0, noteName: 'Mi' })
    const html = generateTurkishRhythmicHtml([note])
    assert.doesNotMatch(html, /on altılık nota/)
    assert.doesNotMatch(html, /onaltılık nota/)
    assert.match(html, /Mi notası/)
  })

  test('dotted quarter note: no "noktalı dörtlük nota" or "bir buçuk vuruş"', () => {
    const note = makeNote({ duration: 'dotted-quarter', dotCount: 1, fret: 0, noteName: 'Mi', beats: 1.5 })
    const html = generateTurkishRhythmicHtml([note])
    assert.doesNotMatch(html, /noktalı dörtlük nota/)
    assert.doesNotMatch(html, /bir buçuk vuruş/)
    assert.match(html, /Mi notası/)
  })

  test('tie start: no "uzatma bağı" text in HTML', () => {
    const note = makeNote({ duration: 'half', fret: 0, noteName: 'Mi', tieStart: true })
    const html = generateTurkishRhythmicHtml([note])
    assert.doesNotMatch(html, /uzatma bağı/)
    assert.match(html, /Mi notası/)
  })

  test('rest: shows "sus" only, no duration text', () => {
    const note = makeNote({ duration: 'quarter', isRest: true, fret: 0, noteName: 'Mi' })
    const html = generateTurkishRhythmicHtml([note])
    assert.match(html, /sus/)
    assert.doesNotMatch(html, /dörtlük/)
    assert.doesNotMatch(html, /bir vuruş/)
  })
})

describe('Rhythmic HTML: guitar position and note name preserved', () => {
  test('open string: "Birinci tel açık tel, Mi notası"', () => {
    const note = makeNote({ duration: 'eighth', stringLetter: 'e', fret: 0, noteName: 'Mi' })
    const html = generateTurkishRhythmicHtml([note])
    assert.match(html, /birinci tel açık tel/)
    assert.match(html, /Mi notası/)
  })

  test('fretted: "Dördüncü tel ikinci perde, Mi notası"', () => {
    const note = makeNote({ duration: 'quarter', stringLetter: 'D', fret: 2, noteName: 'Mi' })
    const html = generateTurkishRhythmicHtml([note])
    assert.match(html, /dördüncü tel ikinci perde/)
    assert.match(html, /Mi notası/)
  })
})

describe('Rhythmic HTML: internal rhythm data unchanged', () => {
  test('note.beats is not modified by HTML generation', () => {
    const note = makeNote({ duration: 'dotted-half', dotCount: 1, fret: 0, noteName: 'Mi', beats: 3 })
    const before = note.beats
    generateTurkishRhythmicHtml([note])
    assert.equal(note.beats, before)
    assert.equal(note.beats, 3)
  })

  test('note.duration is not modified by HTML generation', () => {
    const note = makeNote({ duration: 'dotted-quarter', dotCount: 1, fret: 0, noteName: 'Mi', beats: 1.5 })
    const before = note.duration
    generateTurkishRhythmicHtml([note])
    assert.equal(note.duration, before)
  })

  test('note.dotCount is not modified by HTML generation', () => {
    const note = makeNote({ duration: 'dotted-half', dotCount: 1, fret: 0, noteName: 'Mi', beats: 3 })
    generateTurkishRhythmicHtml([note])
    assert.equal(note.dotCount, 1)
  })

  test('note.tieStart is not modified by HTML generation', () => {
    const note = makeNote({ duration: 'half', fret: 0, noteName: 'Mi', tieStart: true })
    generateTurkishRhythmicHtml([note])
    assert.equal(note.tieStart, true)
  })
})

describe('Plain text output unchanged (formatNoteAsText still has duration/beats)', () => {
  test('formatNoteAsText still includes duration and beat text', () => {
    const note = makeNote({ duration: 'dotted-half', dotCount: 1, fret: 0, noteName: 'Mi', beats: 3 })
    const text = formatNoteAsText(note)
    assert.match(text, /noktalı ikilik nota/)
    assert.match(text, /üç vuruş/)
  })
})
