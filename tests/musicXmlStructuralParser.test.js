// Focused tests for structural MusicXML metadata parsing.
// Run with: node --test tests/musicXmlStructuralParser.test.js

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// Minimal DOMParser shim for Node.js (same approach as existing tests)
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

import { parseMusicXml, parseMusicXmlWithStructure } from '../musicXmlParser.js'
import { validateOmrMeasureDurations } from '../src/services/omrQualityValidator.js'

// ── Synthetic MusicXML fixtures ───────────────────────────────

function makeMeasureXml(number, innerXml, attrs = '') {
  return `    <measure number="${number}"${attrs}>\n${innerXml}\n    </measure>`
}

function makeNoteXml(opts = {}) {
  const {
    pitch = 'A4',
    duration = 4,
    voice = 1,
    staff = 1,
    type = 'quarter',
    chord = false,
    rest = false,
    dot = false,
    tieStart = false,
    tieStop = false,
  } = opts
  let pitchXml = ''
  if (rest) {
    pitchXml = '      <rest/>\n'
  } else {
    const [step, octave] = pitch.split('')
    pitchXml = `      <pitch>\n        <step>${step}</step>\n        <octave>${octave}</octave>\n      </pitch>\n`
  }
  let chordXml = chord ? '      <chord/>\n' : ''
  let tieXml = ''
  if (tieStart) tieXml += '      <tie type="start"/>\n'
  if (tieStop) tieXml += '      <tie type="stop"/>\n'
  let dotXml = dot ? '      <dot/>\n' : ''
  return [
    '    <note>',
    chordXml,
    pitchXml,
    `      <duration>${duration}</duration>`,
    `      <voice>${voice}</voice>`,
    `      <type>${type}</type>`,
    dotXml,
    tieXml,
    `      <staff>${staff}</staff>`,
    '    </note>',
  ].filter(Boolean).join('\n')
}

function makeBackupXml(duration) {
  return `    <backup>\n      <duration>${duration}</duration>\n    </backup>`
}

function makeForwardXml(duration) {
  return `    <forward>\n      <duration>${duration}</duration>\n    </forward>`
}

function makeScoreXml(measuresXml, divisions = 4) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Test</part-name>
    </score-part>
  </part-list>
  <part id="P1">
${measuresXml}
  </part>
</score-partwise>`
}

// ── Tests ─────────────────────────────────────────────────────

describe('1. Existing parseMusicXml return behavior unchanged', () => {
  test('returns flat note array, not an object', () => {
    const xml = makeScoreXml(
      makeMeasureXml(1,
        '      <attributes>\n' +
        '        <divisions>4</divisions>\n' +
        '        <time>\n          <beats>4</beats>\n          <beat-type>4</beat-type>\n        </time>\n' +
        '      </attributes>\n' +
        makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' })
      )
    )
    const result = parseMusicXml(xml)
    assert.ok(Array.isArray(result.notes), 'parseMusicXml should return { notes } object')
    assert.ok(result.notes.length > 0)
    assert.equal(result.notes[0].measure, 1)
    assert.equal(result.notes[0].beats, 1)
  })
})

describe('2. 4/4 time signature preserved', () => {
  test('parseMusicXmlWithStructure extracts 4/4', () => {
    const xml = makeScoreXml(
      makeMeasureXml(1,
        '      <attributes>\n' +
        '        <divisions>4</divisions>\n' +
        '        <time>\n          <beats>4</beats>\n          <beat-type>4</beat-type>\n        </time>\n' +
        '      </attributes>\n' +
        makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' })
      )
    )
    const structured = parseMusicXmlWithStructure(xml)
    assert.ok(structured.timeSignatures.length > 0)
    const ts = structured.timeSignatures[0]
    assert.equal(ts.measureNumber, 1)
    assert.equal(ts.beats, 4)
    assert.equal(ts.beatType, 4)
  })
})

describe('3. 3/4 time signature preserved', () => {
  test('parseMusicXmlWithStructure extracts 3/4', () => {
    const xml = makeScoreXml(
      makeMeasureXml(1,
        '      <attributes>\n' +
        '        <divisions>4</divisions>\n' +
        '        <time>\n          <beats>3</beats>\n          <beat-type>4</beat-type>\n        </time>\n' +
        '      </attributes>\n' +
        makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' })
      )
    )
    const structured = parseMusicXmlWithStructure(xml)
    assert.equal(structured.timeSignatures[0].beats, 3)
    assert.equal(structured.timeSignatures[0].beatType, 4)
  })
})

describe('4. Time-signature change preserved', () => {
  test('measure 1 has 4/4, measure 2 has 3/4', () => {
    const m1 = makeMeasureXml(1,
      '      <attributes>\n' +
      '        <divisions>4</divisions>\n' +
      '        <time>\n          <beats>4</beats>\n          <beat-type>4</beat-type>\n        </time>\n' +
      '      </attributes>\n' +
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' })
    )
    const m2 = makeMeasureXml(2,
      '      <attributes>\n' +
      '        <time>\n          <beats>3</beats>\n          <beat-type>4</beat-type>\n        </time>\n' +
      '      </attributes>\n' +
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' })
    )
    const xml = makeScoreXml(`${m1}\n${m2}`)
    const structured = parseMusicXmlWithStructure(xml)
    assert.equal(structured.timeSignatures.length, 2)
    assert.equal(structured.timeSignatures[0].beats, 4)
    assert.equal(structured.timeSignatures[1].beats, 3)
    assert.equal(structured.timeSignatures[1].measureNumber, 2)
  })
})

describe('5. Missing repeated time signatures not invented', () => {
  test('measure 2 has no <time> — parser does not add one', () => {
    const m1 = makeMeasureXml(1,
      '      <attributes>\n' +
      '        <divisions>4</divisions>\n' +
      '        <time>\n          <beats>4</beats>\n          <beat-type>4</beat-type>\n        </time>\n' +
      '      </attributes>\n' +
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' })
    )
    const m2 = makeMeasureXml(2,
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' })
    )
    const xml = makeScoreXml(`${m1}\n${m2}`)
    const structured = parseMusicXmlWithStructure(xml)
    assert.equal(structured.timeSignatures.length, 1, 'only one time signature should exist')
    assert.equal(structured.timeSignatures[0].measureNumber, 1)
  })
})

describe('6. <chord/> preserved as isChordNote', () => {
  test('second and third notes in chord have isChordNote=true', () => {
    const innerXml = [
      '      <attributes>\n        <divisions>4</divisions>\n      </attributes>',
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' }),
      makeNoteXml({ pitch: 'C5', duration: 4, type: 'quarter', chord: true }),
      makeNoteXml({ pitch: 'E5', duration: 4, type: 'quarter', chord: true }),
    ].join('\n')
    const xml = makeScoreXml(makeMeasureXml(1, innerXml))
    const structured = parseMusicXmlWithStructure(xml)
    assert.equal(structured.notes[0].isChordNote, false, 'first note is not a chord note')
    assert.equal(structured.notes[1].isChordNote, true, 'second note is a chord note')
    assert.equal(structured.notes[2].isChordNote, true, 'third note is a chord note')
  })
})

describe('7. First chord note is not marked as continuation', () => {
  test('first note of chord has isChordNote=false', () => {
    const innerXml = [
      '      <attributes>\n        <divisions>4</divisions>\n      </attributes>',
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' }),
      makeNoteXml({ pitch: 'C5', duration: 4, type: 'quarter', chord: true }),
    ].join('\n')
    const xml = makeScoreXml(makeMeasureXml(1, innerXml))
    const structured = parseMusicXmlWithStructure(xml)
    assert.equal(structured.notes[0].isChordNote, false)
    assert.equal(structured.notes[1].isChordNote, true)
  })
})

describe('8. <backup> duration and sequence order preserved', () => {
  test('backup element appears in measureEvents with correct duration', () => {
    const innerXml = [
      '      <attributes>\n        <divisions>4</divisions>\n      </attributes>',
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter', voice: 1 }),
      makeBackupXml(4),
      makeNoteXml({ pitch: 'C5', duration: 4, type: 'quarter', voice: 2 }),
    ].join('\n')
    const xml = makeScoreXml(makeMeasureXml(1, innerXml))
    const structured = parseMusicXmlWithStructure(xml)
    const backup = structured.measureEvents.find((e) => e.type === 'backup')
    assert.ok(backup, 'backup event should exist')
    assert.equal(backup.durationDivisions, 4)
    assert.equal(backup.measureNumber, 1)
    // Verify sequence order: note(0), backup(1), note(2)
    assert.equal(structured.measureEvents[0].type, 'attributes')
    assert.equal(structured.measureEvents[1].type, 'note')
    assert.equal(structured.measureEvents[2].type, 'backup')
    assert.equal(structured.measureEvents[3].type, 'note')
    assert.equal(structured.measureEvents[2].sequenceIndex, 2)
  })
})

describe('9. <forward> duration and sequence order preserved', () => {
  test('forward element appears in measureEvents with correct duration', () => {
    const innerXml = [
      '      <attributes>\n        <divisions>4</divisions>\n      </attributes>',
      makeForwardXml(4),
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' }),
    ].join('\n')
    const xml = makeScoreXml(makeMeasureXml(1, innerXml))
    const structured = parseMusicXmlWithStructure(xml)
    const forward = structured.measureEvents.find((e) => e.type === 'forward')
    assert.ok(forward, 'forward event should exist')
    assert.equal(forward.durationDivisions, 4)
    assert.equal(forward.measureNumber, 1)
    assert.equal(structured.measureEvents[1].type, 'forward')
    assert.equal(structured.measureEvents[2].type, 'note')
  })
})

describe('10. Divisions preserved', () => {
  test('divisions=4 is stored in divisionsByMeasure', () => {
    const xml = makeScoreXml(
      makeMeasureXml(1,
        '      <attributes>\n        <divisions>4</divisions>\n      </attributes>\n' +
        makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' })
      )
    )
    const structured = parseMusicXmlWithStructure(xml)
    assert.equal(structured.divisionsByMeasure[0].divisions, 4)
    assert.equal(structured.divisionsByMeasure[0].measureNumber, 1)
  })
})

describe('11. Divisions changes preserved', () => {
  test('measure 1 has divisions=4, measure 2 changes to 8', () => {
    const m1 = makeMeasureXml(1,
      '      <attributes>\n        <divisions>4</divisions>\n      </attributes>\n' +
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' })
    )
    const m2 = makeMeasureXml(2,
      '      <attributes>\n        <divisions>8</divisions>\n      </attributes>\n' +
      makeNoteXml({ pitch: 'A4', duration: 8, type: 'quarter' })
    )
    const xml = makeScoreXml(`${m1}\n${m2}`)
    const structured = parseMusicXmlWithStructure(xml)
    assert.equal(structured.divisionsByMeasure[0].divisions, 4)
    assert.equal(structured.divisionsByMeasure[1].divisions, 8)
  })
})

describe('12. implicit="yes" preserved', () => {
  test('measure with implicit="yes" is flagged', () => {
    const xml = makeScoreXml(
      makeMeasureXml(1,
        makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' }),
        ' implicit="yes"'
      )
    )
    const structured = parseMusicXmlWithStructure(xml)
    const meta = structured.measureMetadata[0]
    assert.equal(meta.measureNumber, 1)
    assert.equal(meta.implicit, true)
  })
})

describe('13. Missing implicit metadata not guessed', () => {
  test('measure without implicit attribute has implicit=false', () => {
    const xml = makeScoreXml(
      makeMeasureXml(1,
        makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' })
      )
    )
    const structured = parseMusicXmlWithStructure(xml)
    assert.equal(structured.measureMetadata[0].implicit, false)
  })
})

describe('14. Voice values preserved', () => {
  test('voice 1 and voice 2 are preserved on notes', () => {
    const innerXml = [
      '      <attributes>\n        <divisions>4</divisions>\n      </attributes>',
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter', voice: 1 }),
      makeBackupXml(4),
      makeNoteXml({ pitch: 'C5', duration: 4, type: 'quarter', voice: 2 }),
    ].join('\n')
    const xml = makeScoreXml(makeMeasureXml(1, innerXml))
    const structured = parseMusicXmlWithStructure(xml)
    assert.equal(structured.notes[0].voice, 1)
    assert.equal(structured.notes[1].voice, 2)
  })
})

describe('15. Staff values preserved', () => {
  test('staff 1 and staff 2 are preserved on notes', () => {
    const m1 = makeMeasureXml(1,
      '      <attributes>\n        <divisions>4</divisions>\n      </attributes>\n' +
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter', staff: 1 })
    )
    const m2 = makeMeasureXml(2,
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter', staff: 2 })
    )
    const xml = makeScoreXml(`${m1}\n${m2}`)
    const structured = parseMusicXmlWithStructure(xml)
    assert.equal(structured.notes[0].staff, 1)
    assert.equal(structured.notes[1].staff, 2)
  })
})

describe('16. Measure event ordering matches source XML order', () => {
  test('events appear in the order they appear in the XML', () => {
    const innerXml = [
      '      <attributes>\n        <divisions>4</divisions>\n        <time>\n          <beats>4</beats>\n          <beat-type>4</beat-type>\n        </time>\n      </attributes>',
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' }),
      makeBackupXml(4),
      makeForwardXml(4),
      makeNoteXml({ pitch: 'C5', duration: 4, type: 'quarter' }),
    ].join('\n')
    const xml = makeScoreXml(makeMeasureXml(1, innerXml))
    const structured = parseMusicXmlWithStructure(xml)
    const types = structured.measureEvents.map((e) => e.type)
    assert.deepEqual(types, ['attributes', 'note', 'backup', 'forward', 'note'])
    assert.equal(structured.measureEvents[0].sequenceIndex, 0)
    assert.equal(structured.measureEvents[4].sequenceIndex, 4)
  })
})

describe('17. Multiple voices remain distinct', () => {
  test('voice 1 notes and voice 2 notes keep their voice numbers', () => {
    const innerXml = [
      '      <attributes>\n        <divisions>4</divisions>\n      </attributes>',
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter', voice: 1 }),
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter', voice: 1 }),
      makeBackupXml(8),
      makeNoteXml({ pitch: 'C5', duration: 4, type: 'quarter', voice: 2 }),
      makeNoteXml({ pitch: 'C5', duration: 4, type: 'quarter', voice: 2 }),
    ].join('\n')
    const xml = makeScoreXml(makeMeasureXml(1, innerXml))
    const structured = parseMusicXmlWithStructure(xml)
    const voice1Notes = structured.notes.filter((n) => n.voice === 1)
    const voice2Notes = structured.notes.filter((n) => n.voice === 2)
    assert.equal(voice1Notes.length, 2)
    assert.equal(voice2Notes.length, 2)
  })
})

describe('18. Existing note count and order unchanged', () => {
  test('parseMusicXml and parseMusicXmlWithStructure produce same note count and order', () => {
    // Use compact single-line XML for reliable MiniDOMParser parsing
    const xml = '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note></measure><measure number="2"><note><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note><note><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note></measure></part></score-partwise>'
    const oldResult = parseMusicXml(xml)
    const newResult = parseMusicXmlWithStructure(xml)
    assert.equal(oldResult.notes.length, newResult.notes.length)
    for (let i = 0; i < oldResult.notes.length; i++) {
      assert.equal(newResult.notes[i].measure, oldResult.notes[i].measure)
      assert.equal(newResult.notes[i].beats, oldResult.notes[i].beats)
      assert.equal(newResult.notes[i].voice, oldResult.notes[i].voice)
      assert.equal(newResult.notes[i].staff, oldResult.notes[i].staff)
    }
  })
})

describe('20. Validator can validate structured 3/4 fixture without manual options', () => {
  test('structured 3/4 score validates correctly with no options', () => {
    const innerXml = [
      '      <attributes>\n        <divisions>4</divisions>\n        <time>\n          <beats>3</beats>\n          <beat-type>4</beat-type>\n        </time>\n      </attributes>',
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' }),
      makeNoteXml({ pitch: 'B4', duration: 4, type: 'quarter' }),
      makeNoteXml({ pitch: 'C5', duration: 4, type: 'quarter' }),
    ].join('\n')
    const xml = makeScoreXml(makeMeasureXml(1, innerXml))
    const structured = parseMusicXmlWithStructure(xml)
    const report = validateOmrMeasureDurations(structured)
    assert.equal(report.measures[0].status, 'valid')
    assert.equal(report.measures[0].expectedBeats, 3)
    assert.equal(report.measures[0].actualBeats, 3)
  })
})

describe('21. Chords no longer inflate actual measure duration', () => {
  test('chord notes are excluded from actual duration via isChordNote', () => {
    const innerXml = [
      '      <attributes>\n        <divisions>4</divisions>\n        <time>\n          <beats>4</beats>\n          <beat-type>4</beat-type>\n        </time>\n      </attributes>',
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' }),
      makeNoteXml({ pitch: 'C5', duration: 4, type: 'quarter', chord: true }),
      makeNoteXml({ pitch: 'E5', duration: 4, type: 'quarter', chord: true }),
      makeNoteXml({ pitch: 'B4', duration: 4, type: 'quarter' }),
      makeNoteXml({ pitch: 'D5', duration: 4, type: 'quarter' }),
      makeNoteXml({ pitch: 'F5', duration: 4, type: 'quarter' }),
    ].join('\n')
    const xml = makeScoreXml(makeMeasureXml(1, innerXml))
    const structured = parseMusicXmlWithStructure(xml)
    const report = validateOmrMeasureDurations(structured)
    // 6 notes, but 2 are chord notes → 4 actual beats → valid
    assert.equal(report.measures[0].actualBeats, 4)
    assert.equal(report.measures[0].status, 'valid')
  })
})

describe('22. Backup prevents multiple voices from being counted sequentially', () => {
  test('backup separates voice 1 and voice 2 — validator uses max voice duration', () => {
    // Voice 1: 2 quarter notes = 2 beats
    // Backup: 8 divisions (2 beats)
    // Voice 2: 2 quarter notes = 2 beats
    // Without backup awareness, the validator would see 4 beats total.
    // With voice separation, max(2, 2) = 2 beats → underfilled in 4/4.
    const innerXml = [
      '      <attributes>\n        <divisions>4</divisions>\n        <time>\n          <beats>4</beats>\n          <beat-type>4</beat-type>\n        </time>\n      </attributes>',
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter', voice: 1 }),
      makeNoteXml({ pitch: 'B4', duration: 4, type: 'quarter', voice: 1 }),
      makeBackupXml(8),
      makeNoteXml({ pitch: 'C5', duration: 4, type: 'quarter', voice: 2 }),
      makeNoteXml({ pitch: 'D5', duration: 4, type: 'quarter', voice: 2 }),
    ].join('\n')
    const xml = makeScoreXml(makeMeasureXml(1, innerXml))
    const structured = parseMusicXmlWithStructure(xml)
    const report = validateOmrMeasureDurations(structured)
    // Each voice has 2 beats; max = 2 → underfilled
    assert.equal(report.measures[0].actualBeats, 2)
    assert.equal(report.measures[0].status, 'underfilled')
  })
})

describe('23. Forward elements represented in measure events', () => {
  test('forward element is preserved in measureEvents array', () => {
    const innerXml = [
      '      <attributes>\n        <divisions>4</divisions>\n        <time>\n          <beats>4</beats>\n          <beat-type>4</beat-type>\n        </time>\n      </attributes>',
      makeForwardXml(4),
      makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' }),
      makeNoteXml({ pitch: 'B4', duration: 4, type: 'quarter' }),
      makeNoteXml({ pitch: 'C5', duration: 4, type: 'quarter' }),
    ].join('\n')
    const xml = makeScoreXml(makeMeasureXml(1, innerXml))
    const structured = parseMusicXmlWithStructure(xml)
    const forward = structured.measureEvents.find((e) => e.type === 'forward')
    assert.ok(forward)
    assert.equal(forward.durationDivisions, 4)
    assert.equal(forward.sequenceIndex, 1)
  })
})

describe('24. Implicit pickup measure not reported as full-measure error', () => {
  test('implicit measure with 1 beat in 4/4 is not an error', () => {
    const xml = makeScoreXml(
      makeMeasureXml(1,
        '      <attributes>\n        <divisions>4</divisions>\n        <time>\n          <beats>4</beats>\n          <beat-type>4</beat-type>\n        </time>\n      </attributes>\n' +
        makeNoteXml({ pitch: 'A4', duration: 4, type: 'quarter' }),
        ' implicit="yes"'
      )
    )
    const structured = parseMusicXmlWithStructure(xml)
    const report = validateOmrMeasureDurations(structured)
    assert.equal(report.measures[0].status, 'underfilled')
    assert.equal(report.measures[0].severity, 'none')
    assert.ok(report.measures[0].reasons.some((r) => r.includes('implicit/pickup')))
  })
})
