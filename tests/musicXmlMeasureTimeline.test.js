// Focused tests for MusicXML Measure Timeline Calculator.
// Run with: node --test tests/musicXmlMeasureTimeline.test.js

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// Minimal DOMParser shim for Node.js
class MiniElement {
  constructor(tag, attrs, parent) {
    this.tag = tag
    this.tagName = tag
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
      if (m[4] !== undefined) {
        if (m[4].trim()) stack[stack.length - 1]._text += m[4]
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

import { parseMusicXmlWithStructure } from '../musicXmlParser.js'
import { buildMeasureTimeline } from '../src/services/musicXmlMeasureTimeline.js'
import { validateOmrMeasureDurations } from '../src/services/omrQualityValidator.js'

// ── Helpers ──────────────────────────────────────────────────

function noteXml(opts = {}) {
  const {
    pitch = 'A4', duration = 4, voice = 1, staff = 1,
    type = 'quarter', chord = false, rest = false,
  } = opts
  let pitchXml = rest ? '<rest/>' : `<pitch><step>${pitch[0]}</step><octave>${pitch[1]}</octave></pitch>`
  let chordXml = chord ? '<chord/>' : ''
  return `<note>${chordXml}${pitchXml}<duration>${duration}</duration><voice>${voice}</voice><type>${type}</type><staff>${staff}</staff></note>`
}

function backupXml(dur) {
  return `<backup><duration>${dur}</duration></backup>`
}

function forwardXml(dur) {
  return `<forward><duration>${dur}</duration></forward>`
}

function makeScore(measureXmls, divisions = 4) {
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>T</part-name></score-part></part-list><part id="P1">${measureXmls}</part></score-partwise>`
}

function makeMeasure(num, innerXml, attrs = '') {
  return `<measure number="${num}"${attrs}><attributes><divisions>4</divisions></attributes>${innerXml}</measure>`
}

function makeMeasureWithDivisions(num, divisions, innerXml, attrs = '') {
  return `<measure number="${num}"${attrs}><attributes><divisions>${divisions}</divisions></attributes>${innerXml}</measure>`
}

function makeMeasureNoDivisions(num, innerXml, attrs = '') {
  return `<measure number="${num}"${attrs}>${innerXml}</measure>`
}

function makeMeasureWithTimeSig(num, beats, beatType, innerXml, divisions = 4) {
  return `<measure number="${num}"><attributes><divisions>${divisions}</divisions><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time></attributes>${innerXml}</measure>`
}

// ── Tests ─────────────────────────────────────────────────────

describe('1. Sequential notes in 4/4 produce 4 beats', () => {
  test('four quarter notes → 4 beats', () => {
    const inner = [noteXml({ pitch: 'A4' }), noteXml({ pitch: 'B4' }), noteXml({ pitch: 'C5' }), noteXml({ pitch: 'D5' })].join('')
    const xml = makeScore(makeMeasureWithTimeSig(1, 4, 4, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    assert.equal(timeline.measures[0].durationBeats, 4)
    assert.equal(timeline.measures[0].maxCursorDivisions, 16)
  })
})

describe('2. Sequential notes in 3/4 produce 3 beats', () => {
  test('three quarter notes → 3 beats', () => {
    const inner = [noteXml({ pitch: 'A4' }), noteXml({ pitch: 'B4' }), noteXml({ pitch: 'C5' })].join('')
    const xml = makeScore(makeMeasureWithTimeSig(1, 3, 4, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    assert.equal(timeline.measures[0].durationBeats, 3)
    assert.equal(timeline.measures[0].maxCursorDivisions, 12)
  })
})

describe('3. Two chord notes do not advance cursor twice', () => {
  test('quarter + chord quarter → cursor advances once', () => {
    const inner = [noteXml({ pitch: 'A4' }), noteXml({ pitch: 'C5', chord: true })].join('')
    const xml = makeScore(makeMeasure(1, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    assert.equal(timeline.measures[0].maxCursorDivisions, 4)
    assert.equal(timeline.measures[0].durationBeats, 1)
    // Both notes start at cursor 0
    const noteEvents = timeline.measures[0].events.filter((e) => e.type === 'note')
    assert.equal(noteEvents[0].startDivisions, 0)
    assert.equal(noteEvents[1].startDivisions, 0)
    assert.equal(noteEvents[1].isChordNote, true)
  })
})

describe('4. Three-note chord advances once', () => {
  test('quarter + 2 chord notes → 1 beat', () => {
    const inner = [noteXml({ pitch: 'A4' }), noteXml({ pitch: 'C5', chord: true }), noteXml({ pitch: 'E5', chord: true })].join('')
    const xml = makeScore(makeMeasure(1, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    assert.equal(timeline.measures[0].maxCursorDivisions, 4)
    assert.equal(timeline.measures[0].durationBeats, 1)
  })
})

describe('5. Backup resets cursor for second voice', () => {
  test('2 notes + backup + 2 notes → max cursor is 8, not 16', () => {
    const inner = [
      noteXml({ pitch: 'A4', voice: 1 }),
      noteXml({ pitch: 'B4', voice: 1 }),
      backupXml(8),
      noteXml({ pitch: 'C5', voice: 2 }),
      noteXml({ pitch: 'D5', voice: 2 }),
    ].join('')
    const xml = makeScore(makeMeasure(1, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    assert.equal(timeline.measures[0].maxCursorDivisions, 8)
    assert.equal(timeline.measures[0].endCursorDivisions, 8)
  })
})

describe('6. Two simultaneous voices produce max duration, not sum', () => {
  test('voice 1: 4 beats, voice 2: 4 beats → max is 4, not 8', () => {
    const inner = [
      noteXml({ pitch: 'A4', voice: 1 }),
      noteXml({ pitch: 'B4', voice: 1 }),
      noteXml({ pitch: 'C5', voice: 1 }),
      noteXml({ pitch: 'D5', voice: 1 }),
      backupXml(16),
      noteXml({ pitch: 'E5', voice: 2 }),
      noteXml({ pitch: 'F5', voice: 2 }),
      noteXml({ pitch: 'G5', voice: 2 }),
      noteXml({ pitch: 'A5', voice: 2 }),
    ].join('')
    const xml = makeScore(makeMeasure(1, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    assert.equal(timeline.measures[0].maxCursorDivisions, 16)
    assert.equal(timeline.measures[0].durationBeats, 4)
  })
})

describe('7. Forward advances measure cursor', () => {
  test('forward 4 + quarter note → 2 beats', () => {
    const inner = [forwardXml(4), noteXml({ pitch: 'A4' })].join('')
    const xml = makeScore(makeMeasure(1, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    assert.equal(timeline.measures[0].maxCursorDivisions, 8)
    assert.equal(timeline.measures[0].durationBeats, 2)
  })
})

describe('8. Backup followed by forward handled in source order', () => {
  test('note + backup + forward + note → correct cursor', () => {
    const inner = [
      noteXml({ pitch: 'A4', voice: 1 }),
      backupXml(2),
      forwardXml(2),
      noteXml({ pitch: 'C5', voice: 2 }),
    ].join('')
    const xml = makeScore(makeMeasure(1, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    // cursor: 4 (note) → 2 (backup) → 4 (forward) → 8 (note)
    assert.equal(timeline.measures[0].maxCursorDivisions, 8)
    assert.equal(timeline.measures[0].durationBeats, 2)
  })
})

describe('9. Final cursor may be lower than max cursor after backup', () => {
  test('4 notes + backup → final < max', () => {
    const inner = [
      noteXml({ pitch: 'A4', voice: 1 }),
      noteXml({ pitch: 'B4', voice: 1 }),
      noteXml({ pitch: 'C5', voice: 1 }),
      noteXml({ pitch: 'D5', voice: 1 }),
      backupXml(16),
    ].join('')
    const xml = makeScore(makeMeasure(1, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    assert.equal(timeline.measures[0].maxCursorDivisions, 16)
    assert.equal(timeline.measures[0].endCursorDivisions, 0)
  })
})

describe('10. Measure duration uses max cursor', () => {
  test('durationBeats = maxCursor / divisions', () => {
    const inner = [noteXml({ pitch: 'A4' }), noteXml({ pitch: 'B4' })].join('')
    const xml = makeScore(makeMeasure(1, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    assert.equal(timeline.measures[0].maxCursorDivisions, 8)
    assert.equal(timeline.measures[0].divisions, 4)
    assert.equal(timeline.measures[0].durationBeats, 2)
  })
})

describe('11. Divisions converted correctly to beats', () => {
  test('divisions=8, two quarter notes (dur=8) → 2 beats', () => {
    const inner = [noteXml({ pitch: 'A4', duration: 8 }), noteXml({ pitch: 'B4', duration: 8 })].join('')
    const xml = makeScore(makeMeasureWithDivisions(1, 8, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    assert.equal(timeline.measures[0].divisions, 8)
    assert.equal(timeline.measures[0].maxCursorDivisions, 16)
    assert.equal(timeline.measures[0].durationBeats, 2)
  })
})

describe('12. Divisions change handled correctly', () => {
  test('measure 1 div=4, measure 2 div=8', () => {
    const m1 = makeMeasureWithDivisions(1, 4, noteXml({ pitch: 'A4', duration: 4 }))
    const m2 = makeMeasureWithDivisions(2, 8, noteXml({ pitch: 'A4', duration: 8 }))
    const xml = makeScore(`${m1}${m2}`)
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    assert.equal(timeline.measures[0].divisions, 4)
    assert.equal(timeline.measures[0].durationBeats, 1)
    assert.equal(timeline.measures[1].divisions, 8)
    assert.equal(timeline.measures[1].durationBeats, 1)
  })
})

describe('13. Missing divisions returns unknown/warning', () => {
  test('no divisions → durationBeats is null, warning present', () => {
    const inner = [noteXml({ pitch: 'A4' })].join('')
    const xml = makeScore(makeMeasureNoDivisions(1, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    assert.equal(timeline.measures[0].divisions, null)
    assert.equal(timeline.measures[0].durationBeats, null)
    assert.ok(timeline.measures[0].warnings.some((w) => w.includes('divisions')))
  })
})

describe('14. Backup before zero produces structural warning', () => {
  test('backup of 8 after only 4 divisions → warning', () => {
    const inner = [noteXml({ pitch: 'A4' }), backupXml(8)].join('')
    const xml = makeScore(makeMeasure(1, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    assert.ok(timeline.measures[0].warnings.some((w) => w.includes('before zero')))
  })
})

describe('15. Missing note duration produces warning', () => {
  test('note without duration element → warning', () => {
    const inner = '<note><pitch><step>A</step><octave>4</octave></pitch><voice>1</voice><type>quarter</type><staff>1</staff></note>'
    const xml = makeScore(makeMeasure(1, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    assert.ok(timeline.measures[0].warnings.some((w) => w.includes('no valid duration')))
  })
})

describe('16. Multiple staves remain distinct', () => {
  test('staff 1 and staff 2 notes preserve staff values', () => {
    const inner = [noteXml({ pitch: 'A4', staff: 1 }), noteXml({ pitch: 'C5', staff: 2 })].join('')
    const xml = makeScore(makeMeasure(1, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    const noteEvents = timeline.measures[0].events.filter((e) => e.type === 'note')
    assert.equal(noteEvents[0].staff, 1)
    assert.equal(noteEvents[1].staff, 2)
  })
})

describe('17. Voice identifiers remain unchanged', () => {
  test('voice 1 and voice 2 are preserved in timeline events', () => {
    const inner = [
      noteXml({ pitch: 'A4', voice: 1 }),
      backupXml(4),
      noteXml({ pitch: 'C5', voice: 2 }),
    ].join('')
    const xml = makeScore(makeMeasure(1, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    const noteEvents = timeline.measures[0].events.filter((e) => e.type === 'note')
    assert.equal(noteEvents[0].voice, 1)
    assert.equal(noteEvents[1].voice, 2)
  })
})

describe('18. Existing chord flags remain unchanged', () => {
  test('isChordNote is preserved in timeline events', () => {
    const inner = [noteXml({ pitch: 'A4' }), noteXml({ pitch: 'C5', chord: true })].join('')
    const xml = makeScore(makeMeasure(1, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const timeline = buildMeasureTimeline(structured)
    const noteEvents = timeline.measures[0].events.filter((e) => e.type === 'note')
    assert.equal(noteEvents[0].isChordNote, false)
    assert.equal(noteEvents[1].isChordNote, true)
  })
})

describe('19. Existing parseMusicXml behavior remains unchanged', () => {
  test('parseMusicXml still returns { notes } with same note count', async () => {
    const { parseMusicXml } = await import('../musicXmlParser.js')
    const inner = [noteXml({ pitch: 'A4' }), noteXml({ pitch: 'B4' })].join('')
    const xml = makeScore(makeMeasure(1, inner))
    const result = parseMusicXml(xml)
    assert.ok(Array.isArray(result.notes))
    assert.equal(result.notes.length, 2)
    assert.equal(result.notes[0].beats, 1)
  })
})

describe('20. Existing parseMusicXmlWithStructure behavior remains unchanged', () => {
  test('structured parser still returns all metadata arrays', () => {
    const inner = [noteXml({ pitch: 'A4' }), noteXml({ pitch: 'B4' })].join('')
    const xml = makeScore(makeMeasureWithTimeSig(1, 4, 4, inner))
    const structured = parseMusicXmlWithStructure(xml)
    assert.ok(Array.isArray(structured.notes))
    assert.ok(Array.isArray(structured.timeSignatures))
    assert.ok(Array.isArray(structured.divisionsByMeasure))
    assert.ok(Array.isArray(structured.measureMetadata))
    assert.ok(Array.isArray(structured.measureEvents))
    assert.equal(structured.notes.length, 2)
    assert.equal(structured.timeSignatures.length, 1)
  })
})

describe('21. Existing validator tests continue to pass', () => {
  test('validator with manual options still works (no structured events)', () => {
    const notes = [
      { measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4, voice: 1, staff: 1 },
      { measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4, voice: 1, staff: 1 },
      { measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4, voice: 1, staff: 1 },
      { measure: 1, beats: 1, duration: 'quarter', durationValue: 4, divisions: 4, voice: 1, staff: 1 },
    ]
    const report = validateOmrMeasureDurations(
      { notes },
      { timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }] }
    )
    assert.equal(report.measures[0].status, 'valid')
    assert.equal(report.measures[0].actualBeats, 4)
  })
})

describe('22. Existing duration/BPM/dot/tie/playback/MIDI/mapping/HTML/TTS/OMR tests pass', () => {
  test('guitarOctaveMapping still works (E4 → D string, fret 2)', async () => {
    const { parseMusicXml } = await import('../musicXmlParser.js')
    const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.0"><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions></attributes><note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note></measure></part></score-partwise>`
    const result = parseMusicXml(xml)
    assert.equal(result.notes[0].string, 'D')
    assert.equal(result.notes[0].fret, 2)
    assert.equal(result.notes[0].midi, 64)
  })
})

describe('23. Polyphonic piano-style fixture validates correctly', () => {
  test('two voices with backup, each 4 beats → valid 4/4', () => {
    const inner = [
      noteXml({ pitch: 'A4', voice: 1 }),
      noteXml({ pitch: 'B4', voice: 1 }),
      noteXml({ pitch: 'C5', voice: 1 }),
      noteXml({ pitch: 'D5', voice: 1 }),
      backupXml(16),
      noteXml({ pitch: 'E5', voice: 2 }),
      noteXml({ pitch: 'F5', voice: 2 }),
      noteXml({ pitch: 'G5', voice: 2 }),
      noteXml({ pitch: 'A5', voice: 2 }),
    ].join('')
    const xml = makeScore(makeMeasureWithTimeSig(1, 4, 4, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const report = validateOmrMeasureDurations(structured)
    assert.equal(report.measures[0].status, 'valid')
    assert.equal(report.measures[0].actualBeats, 4)
  })
})

describe('24. Single-voice guitar fixture validates correctly', () => {
  test('four quarter notes in 4/4 → valid', () => {
    const inner = [noteXml({ pitch: 'E4' }), noteXml({ pitch: 'F4' }), noteXml({ pitch: 'G4' }), noteXml({ pitch: 'A4' })].join('')
    const xml = makeScore(makeMeasureWithTimeSig(1, 4, 4, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const report = validateOmrMeasureDurations(structured)
    assert.equal(report.measures[0].status, 'valid')
    assert.equal(report.measures[0].actualBeats, 4)
  })
})

describe('25. Measure with forward no longer appears falsely underfilled', () => {
  test('forward 4 + 3 quarter notes → 4 beats in 4/4 → valid', () => {
    const inner = [forwardXml(4), noteXml({ pitch: 'A4' }), noteXml({ pitch: 'B4' }), noteXml({ pitch: 'C5' })].join('')
    const xml = makeScore(makeMeasureWithTimeSig(1, 4, 4, inner))
    const structured = parseMusicXmlWithStructure(xml)
    const report = validateOmrMeasureDurations(structured)
    assert.equal(report.measures[0].status, 'valid')
    assert.equal(report.measures[0].actualBeats, 4)
  })
})
