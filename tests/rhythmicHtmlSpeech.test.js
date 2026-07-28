import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { generateTurkishRhythmicSpokenText, generateTurkishRhythmicHtml } from '../rhythmicTextGenerator.js'
import { formatNoteAsText } from '../rhythmicTextGenerator.js'
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

describe('Rhythmic HTML speech: contains guitar string, fret, and note name', () => {
  test('open string spoken text', () => {
    const note = makeNote({ duration: 'eighth', stringLetter: 'e', fret: 0, noteName: 'Mi' })
    const spoken = generateTurkishRhythmicSpokenText([note])
    assert.match(spoken, /birinci tel açık tel/)
    assert.match(spoken, /Mi notası/)
  })

  test('fretted note spoken text', () => {
    const note = makeNote({ duration: 'quarter', stringLetter: 'D', fret: 2, noteName: 'Mi' })
    const spoken = generateTurkishRhythmicSpokenText([note])
    assert.match(spoken, /dördüncü tel ikinci perde/)
    assert.match(spoken, /Mi notası/)
  })
})

describe('Rhythmic HTML speech: no note-duration labels', () => {
  const durationLabels = [
    'birlik nota',
    'ikilik nota',
    'noktalı ikilik nota',
    'dörtlük nota',
    'noktalı dörtlük nota',
    'sekizlik nota',
    'on altılık nota',
    'onaltılık nota',
  ]

  for (const label of durationLabels) {
    test(`spoken text does not contain "${label}"`, () => {
      const note = makeNote({ duration: 'dotted-half', dotCount: 1, fret: 0, noteName: 'Mi', beats: 3 })
      const spoken = generateTurkishRhythmicSpokenText([note])
      assert.doesNotMatch(spoken, new RegExp(label))
    })
  }
})

describe('Rhythmic HTML speech: no beat-duration labels', () => {
  const beatLabels = [
    'yarım vuruş',
    'bir vuruş',
    'iki vuruş',
    'üç vuruş',
    'dört vuruş',
    'bir buçuk vuruş',
    'çeyrek vuruş',
  ]

  for (const label of beatLabels) {
    test(`spoken text does not contain "${label}"`, () => {
      const note = makeNote({ duration: 'dotted-half', dotCount: 1, fret: 0, noteName: 'Mi', beats: 3 })
      const spoken = generateTurkishRhythmicSpokenText([note])
      assert.doesNotMatch(spoken, new RegExp(label))
    })
  }
})

describe('Rhythmic HTML speech: matches visible HTML text (plain text, no tags)', () => {
  test('spoken text has no HTML tags', () => {
    const notes = [
      makeNote({ duration: 'eighth', stringLetter: 'e', fret: 0, noteName: 'Mi' }),
      makeNote({ duration: 'quarter', stringLetter: 'D', fret: 2, noteName: 'Mi' }),
    ]
    const spoken = generateTurkishRhythmicSpokenText(notes)
    assert.doesNotMatch(spoken, /<[^>]+>/)
  })

  test('spoken text matches simplified content of HTML output', () => {
    const notes = [
      makeNote({ duration: 'eighth', stringLetter: 'e', fret: 0, noteName: 'Mi' }),
    ]
    const spoken = generateTurkishRhythmicSpokenText(notes)
    const html = generateTurkishRhythmicHtml(notes)
    assert.ok(html.includes(spoken.replace(/\.$/, '')), 'HTML output should contain the spoken text content')
  })
})

describe('Rhythmic HTML speech: detailed plain-text output unchanged', () => {
  test('formatNoteAsText still includes duration and beat text', () => {
    const note = makeNote({ duration: 'dotted-half', dotCount: 1, fret: 0, noteName: 'Mi', beats: 3 })
    const text = formatNoteAsText(note)
    assert.match(text, /noktalı ikilik nota/)
    assert.match(text, /üç vuruş/)
  })
})

describe('Rhythmic HTML speech: internal duration and beat data unchanged', () => {
  test('note.beats not modified by spoken text generation', () => {
    const note = makeNote({ duration: 'dotted-half', dotCount: 1, fret: 0, noteName: 'Mi', beats: 3 })
    generateTurkishRhythmicSpokenText([note])
    assert.equal(note.beats, 3)
  })

  test('note.duration not modified by spoken text generation', () => {
    const note = makeNote({ duration: 'dotted-quarter', dotCount: 1, fret: 0, noteName: 'Mi', beats: 1.5 })
    generateTurkishRhythmicSpokenText([note])
    assert.equal(note.duration, 'dotted-quarter')
  })

  test('note.dotCount not modified by spoken text generation', () => {
    const note = makeNote({ duration: 'dotted-half', dotCount: 1, fret: 0, noteName: 'Mi', beats: 3 })
    generateTurkishRhythmicSpokenText([note])
    assert.equal(note.dotCount, 1)
  })
})
