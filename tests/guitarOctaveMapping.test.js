import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createNote, resolveBeats, buildTieChains, tieChainBeats, noteFrequency, midiToFrequency } from '../noteTheory.js'
import { formatNoteAsHtmlText } from '../rhythmicTextGenerator.js'

// Minimal DOMParser shim for Node.js (same approach as frontendGateway.test.js)
class MiniElement {
  constructor(tag, attrs, parent) {
    this.tag = tag
    this.attrs = attrs || {}
    this.children = []
    this.parent = parent
    this._text = ''
  }
  getAttribute(name) { return this.attrs[name] || null }
  get textContent() {
    if (this.children.length === 0) return this._text
    return this.children.map((c) => c.textContent).join('')
  }
  querySelector(sel) { return this._findAll(sel)[0] || null }
  querySelectorAll(sel) { return this._findAll(sel) }
  _findAll(sel, acc = []) {
    for (const c of this.children) {
      if (c.tag === sel) acc.push(c)
      c._findAll(sel, acc)
    }
    return acc
  }
}
class MiniDocument extends MiniElement {
  constructor() { super('#document', {}, null) }
}
class MiniDOMParser {
  parseFromString(xml) {
    const doc = new MiniDocument()
    const stack = [doc]
    const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g
    let m
    while ((m = tagRe.exec(xml)) !== null) {
      if (m[4] !== undefined && m[4].trim()) {
        stack[stack.length - 1]._text += m[4]
        continue
      }
      const isClose = m[0][1] === '/'
      const tag = m[1]
      const attrStr = m[2] || ''
      const selfClose = m[3] === '/'
      if (isClose) { stack.pop(); continue }
      const attrs = {}
      const attrRe = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g
      let am
      while ((am = attrRe.exec(attrStr)) !== null) attrs[am[1]] = am[2]
      const el = new MiniElement(tag, attrs, stack[stack.length - 1])
      stack[stack.length - 1].children.push(el)
      if (!selfClose) stack.push(el)
    }
    return doc
  }
}
globalThis.DOMParser = MiniDOMParser

// pitchToGuitarPosition is not exported, so we test it indirectly
// through the parser's public parseMusicXml function.
import { parseMusicXml } from '../musicXmlParser.js'

function makeNoteXml(step, octave, durationType = 'quarter', alter = 0) {
  const alterXml = alter !== 0 ? `<alter>${alter}</alter>` : ''
  const durationByType = {
    whole: 16,
    half: 8,
    quarter: 4,
    eighth: 2,
    '16th': 1,
  }
  const durationValue = durationByType[durationType] ?? 4
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.0">
  <part-list>
    <score-part id="P1">
      <part-name>Guitar</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
      </attributes>
      <note>
        <pitch>
          <step>${step}</step>
          ${alterXml}
          <octave>${octave}</octave>
        </pitch>
        <duration>${durationValue}</duration>
        <type>${durationType}</type>
      </note>
    </measure>
  </part>
</score-partwise>`
}

function makeCSharpXml(attributes = '') {
  return `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions>${attributes}</attributes><note><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><type>quarter</type></note></measure></part></score-partwise>`
}

test('SES-220 parser ignores clef octave context for physical pitch', () => {
  const xml = makeCSharpXml('<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>')
  const result = parseMusicXml(xml)

  assert.equal(result.error, undefined)
  assert.equal(result.notes[0].midi, 61)
  assert.equal(result.notes[0].soundingPitchMidi, undefined)
  assert.equal(result.notes[0].sourceTranspositionSemitones, undefined)
  assert.equal(result.notes[0].string, 'B')
  assert.equal(result.notes[0].fret, 2)
})

test('SES-220 parser applies explicit MusicXML transpose exactly once', () => {
  const xml = makeCSharpXml('<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>')
  const result = parseMusicXml(xml)

  assert.equal(result.error, undefined)
  assert.equal(result.notes[0].midi, 61)
  assert.equal(result.notes[0].soundingPitchMidi, 49)
  assert.equal(result.notes[0].sourceTranspositionSemitones, -12)
  assert.equal(result.notes[0].string, 'A')
  assert.equal(result.notes[0].fret, 4)
})

describe('Source-derived guitar pitch mapping without transpose', () => {
  test('written E4 maps to first string open', () => {
    const xml = makeNoteXml('E', 4)
    const result = parseMusicXml(xml)
    assert.equal(result.error, undefined)
    assert.equal(result.notes.length, 1)
    const note = result.notes[0]
    assert.equal(note.string, 'e')
    assert.equal(note.fret, 0)
    assert.equal(note.soundingPitchMidi, undefined)
    assert.equal(note.sourceTranspositionSemitones, undefined)
  })

  test('formatNoteAsHtmlText shows "dördüncü tel ikinci perde, Mi notası"', () => {
    const xml = makeNoteXml('E', 4)
    const result = parseMusicXml(xml)
    const note = result.notes[0]
    const noteObj = createNote({
      stringLetter: note.string,
      fret: note.fret,
      noteName: note.noteName,
      midi: note.midi,
      frequency: note.frequency,
      duration: note.duration,
      beats: note.beats,
    })
    const text = formatNoteAsHtmlText(noteObj)
    assert.equal(text, 'birinci tel açık tel, Mi notası')
  })
})

describe('Higher written pitch is not silently lowered', () => {
  test('E5 maps to first string fret 12', () => {
    const xml = makeNoteXml('E', 5)
    const result = parseMusicXml(xml)
    assert.equal(result.error, undefined)
    assert.equal(result.notes.length, 1)
    const note = result.notes[0]
    assert.equal(note.string, 'e', 'E5 should map to e string (1st string)')
    assert.equal(note.fret, 12)
  })

  test('formatNoteAsHtmlText shows "birinci tel açık tel, Mi notası"', () => {
    const xml = makeNoteXml('E', 5)
    const result = parseMusicXml(xml)
    const note = result.notes[0]
    const noteObj = createNote({
      stringLetter: note.string,
      fret: note.fret,
      noteName: note.noteName,
      midi: note.midi,
      frequency: note.frequency,
      duration: note.duration,
      beats: note.beats,
    })
    const text = formatNoteAsHtmlText(noteObj)
    assert.equal(text, 'birinci tel on ikinci perde, Mi notası')
  })
})

describe('Original MIDI pitch remains unchanged after octave mapping', () => {
  test('E4 written pitch keeps MIDI 64 (not lowered to 52)', () => {
    const xml = makeNoteXml('E', 4)
    const result = parseMusicXml(xml)
    const note = result.notes[0]
    assert.equal(note.midi, 64, 'playback MIDI must remain at written pitch E4=64')
  })

  test('E5 written pitch keeps MIDI 76 (not lowered to 64)', () => {
    const xml = makeNoteXml('E', 5)
    const result = parseMusicXml(xml)
    const note = result.notes[0]
    assert.equal(note.midi, 76, 'playback MIDI must remain at written pitch E5=76')
  })
})

describe('Playback frequency remains unchanged after octave mapping', () => {
  test('E4 frequency matches written pitch, not lowered octave', () => {
    const xml = makeNoteXml('E', 4)
    const result = parseMusicXml(xml)
    const note = result.notes[0]
    const expectedFreq = midiToFrequency(64)
    assert.ok(Math.abs(note.frequency - expectedFreq) < 0.01,
      `frequency ${note.frequency} should match E4 (${expectedFreq}), not E3`)
  })

  test('E5 frequency matches written pitch, not lowered octave', () => {
    const xml = makeNoteXml('E', 5)
    const result = parseMusicXml(xml)
    const note = result.notes[0]
    const expectedFreq = midiToFrequency(76)
    assert.ok(Math.abs(note.frequency - expectedFreq) < 0.01,
      `frequency ${note.frequency} should match E5 (${expectedFreq}), not E4`)
  })
})

describe('Duration, beat, tie, and dotted-note behavior unchanged', () => {
  test('quarter note still resolves to 1 beat', () => {
    const xml = makeNoteXml('E', 4, 'quarter')
    const result = parseMusicXml(xml)
    const note = result.notes[0]
    const noteObj = createNote({
      stringLetter: note.string, fret: note.fret, noteName: note.noteName,
      midi: note.midi, frequency: note.frequency,
      duration: note.duration, beats: note.beats,
    })
    assert.equal(resolveBeats(noteObj), 1)
  })

  test('half note still resolves to 2 beats', () => {
    const xml = makeNoteXml('E', 4, 'half')
    const result = parseMusicXml(xml)
    const note = result.notes[0]
    const noteObj = createNote({
      stringLetter: note.string, fret: note.fret, noteName: note.noteName,
      midi: note.midi, frequency: note.frequency,
      duration: note.duration, beats: note.beats,
    })
    assert.equal(resolveBeats(noteObj), 2)
  })

  test('tie chain beats still sum correctly', () => {
    const n1 = createNote({ duration: 'half', beats: 2, step: 'E', octave: 4, stringLetter: 'D', fret: 2, tieStart: true })
    const n2 = createNote({ duration: 'dotted-half', beats: 3, dotCount: 1, step: 'E', octave: 4, stringLetter: 'D', fret: 2, tieStop: true })
    const { chains } = buildTieChains([n1, n2])
    assert.equal(tieChainBeats(chains[0]), 5)
  })

  test('dotted-half note still resolves to 3 beats', () => {
    const note = createNote({ duration: 'dotted-half', dotCount: 1, beats: 3, stringLetter: 'D', fret: 2 })
    assert.equal(resolveBeats(note), 3)
  })
})

describe('Rhythmic HTML still uses simplified visible format', () => {
  test('formatNoteAsHtmlText outputs only string/fret and note name', () => {
    const xml = makeNoteXml('E', 4)
    const result = parseMusicXml(xml)
    const note = result.notes[0]
    const noteObj = createNote({
      stringLetter: note.string, fret: note.fret, noteName: note.noteName,
      midi: note.midi, frequency: note.frequency,
      duration: note.duration, beats: note.beats,
    })
    const text = formatNoteAsHtmlText(noteObj)
    assert.equal(text, 'birinci tel açık tel, Mi notası')
    assert.doesNotMatch(text, /vuruş/, 'simplified format should not contain beat text')
    assert.doesNotMatch(text, /nota,/, 'simplified format should not contain duration label')
  })
})

describe('Turkish TTS spoken text uses simplified output', () => {
  test('generateTurkishRhythmicSpokenText reads the simplified format', async () => {
    const { generateTurkishRhythmicSpokenText } = await import('../rhythmicTextGenerator.js')
    const xml = makeNoteXml('E', 4)
    const result = parseMusicXml(xml)
    const notes = result.notes.map((n) => createNote({
      stringLetter: n.string, fret: n.fret, noteName: n.noteName,
      midi: n.midi, frequency: n.frequency,
      duration: n.duration, beats: n.beats, measureNumber: n.measure,
    }))
    const spoken = generateTurkishRhythmicSpokenText(notes)
    assert.equal(spoken, 'birinci tel açık tel, Mi notası.')
  })
})
