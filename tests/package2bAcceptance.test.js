import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

// Node-only DOM shim with the selectors used by the production MusicXML parser.
class MiniElement {
  constructor(tag, attrs = {}, parent = null) {
    this.tag = tag
    this.tagName = tag
    this.attrs = attrs
    this.parent = parent
    this.children = []
    this._text = ''
  }
  getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null }
  get textContent() {
    if (this.children.length === 0) return this._text
    return this.children.map((child) => child.textContent).join('')
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null }
  querySelectorAll(selector) {
    if (selector === ':scope > tie') {
      return this.children.filter((child) => child.tag === 'tie')
    }
    if (selector === 'notations tied') {
      return this._findAll('notations').flatMap((notations) => notations._findAll('tied'))
    }
    return this._findAll(selector)
  }
  _findAll(tag, found = []) {
    for (const child of this.children) {
      if (child.tag === tag) found.push(child)
      child._findAll(tag, found)
    }
    return found
  }
}

class MiniDocument extends MiniElement {
  constructor() { super('#document') }
}

class MiniDOMParser {
  parseFromString(xml) {
    const doc = new MiniDocument()
    const stack = [doc]
    const token = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[a-zA-Z0-9-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g
    let match

    while ((match = token.exec(xml)) !== null) {
      if (match[4] !== undefined) {
        if (match[4].trim()) stack.at(-1)._text += match[4]
        continue
      }
      if (match[0][1] === '/') {
        stack.pop()
        continue
      }

      const attrs = {}
      const attrPattern = /([a-zA-Z0-9-]+)\s*=\s*"([^"]*)"/g
      let attribute
      while ((attribute = attrPattern.exec(match[2] || '')) !== null) {
        attrs[attribute[1]] = attribute[2]
      }

      const element = new MiniElement(match[1], attrs, stack.at(-1))
      stack.at(-1).children.push(element)
      if (match[3] !== '/') stack.push(element)
    }
    return doc
  }
}

globalThis.DOMParser = MiniDOMParser

import { parseMusicXmlWithStructure } from '../musicXmlParser.js'
import { validateMusicXmlStructuralRhythm } from '../src/services/musicXmlStructuralValidation.js'
import {
  STRUCTURAL_FINDING_CLASS,
  STRUCTURAL_FINDING_CODE,
} from '../src/services/structuralRhythmValidator.js'

function noteXml({
  step = 'C',
  octave = 4,
  duration = 4,
  type = 'quarter',
  voice = 1,
  staff = 1,
  chord = false,
  rest = false,
  grace = false,
  dot = false,
  tieStart = false,
  tieStop = false,
  timeModification = '',
  beam = '',
} = {}) {
  const pitch = rest ? '<rest/>' : `<pitch><step>${step}</step><octave>${octave}</octave></pitch>`
  const durationXml = grace ? '' : `<duration>${duration}</duration>`
  return `      <note>
        ${chord ? '<chord/>' : ''}
        ${grace ? '<grace/>' : ''}
        ${pitch}
        ${durationXml}
        ${tieStart ? '<tie type="start"/>' : ''}
        ${tieStop ? '<tie type="stop"/>' : ''}
        <voice>${voice}</voice>
        <type>${type}</type>
        ${dot ? '<dot/>' : ''}
        ${timeModification}
        ${beam}
        <staff>${staff}</staff>
      </note>`
}

function attributesXml({ divisions = 4, beats = 4, beatType = 4 } = {}) {
  return `      <attributes>
        <divisions>${divisions}</divisions>
        <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>
      </attributes>`
}

function measureXml({ number = 1, divisions = 4, beats = 4, beatType = 4, notes = [], events = [], attributes = true } = {}) {
  return `    <measure number="${number}">
${attributes ? attributesXml({ divisions, beats, beatType }) : ''}
${notes.join('\n')}
${events.join('\n')}
    </measure>`
}

function partXml(id, measures) {
  return `  <part id="${id}">\n${measures.join('\n')}\n  </part>`
}

function scoreXml(parts) {
  const partList = parts.map(({ id }) => `<score-part id="${id}"><part-name>${id}</part-name></score-part>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>${partList}</part-list>
${parts.map(({ id, measures }) => partXml(id, measures)).join('\n')}
</score-partwise>`
}

function quarterNotes(count, options = {}) {
  const steps = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
  return Array.from({ length: count }, (_, index) => noteXml({ ...options, step: steps[index % steps.length] }))
}

function validateOne(measures) {
  return validateMusicXmlStructuralRhythm(scoreXml([{ id: 'P1', measures }]))
}

function assertFindingContract(finding, { code, classification, partId, measureKey, expected, actual, voice } = {}) {
  assert.ok(finding, `expected finding ${code}`)
  assert.equal(finding.code, code)
  if (classification) assert.equal(finding.classification, classification)
  if (partId) assert.equal(finding.partId, partId)
  if (measureKey) assert.equal(finding.measureKey, measureKey)
  if (arguments.length) {
    assert.ok(Object.hasOwn(finding, 'voice'))
    assert.ok(Object.hasOwn(finding, 'expected'))
    assert.ok(Object.hasOwn(finding, 'actual'))
  }
  if (voice !== undefined) assert.equal(finding.voice, voice)
  if (expected !== undefined) assert.deepEqual(finding.expected, expected)
  if (actual !== undefined) assert.deepEqual(finding.actual, actual)
}

const triplet = `<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes><normal-type>eighth</normal-type></time-modification>`

describe('Package 2B acceptance matrix — valid structures', () => {
  test('A. valid single voice measure', () => {
    const result = validateOne([measureXml({ notes: quarterNotes(4) })])
    assert.equal(result.ok, true)
    assert.equal(result.measureReport.measures[0].status, 'valid')
    assert.equal(result.findings.length, 0)
  })

  test('B. valid multiple voices keep independent timelines', () => {
    const firstVoice = [
      noteXml({ step: 'C', duration: 8, type: 'half', voice: 1 }),
      noteXml({ step: 'D', duration: 8, type: 'half', voice: 1 }),
    ]
    const secondVoice = [
      noteXml({ step: 'E', duration: 8, type: 'half', voice: 2 }),
      noteXml({ step: 'F', duration: 8, type: 'half', voice: 2 }),
    ]
    const result = validateOne([measureXml({
      notes: firstVoice,
      events: ['      <backup><duration>16</duration></backup>', ...secondVoice],
    })])

    assert.equal(result.measureReport.measures[0].actualBeats, 4)
    assert.equal(result.measureReport.measures[0].status, 'valid')
    assert.equal(result.findings.some((item) => item.code === STRUCTURAL_FINDING_CODE.VOICE_OVERLAP), false)
  })

  test('C. chord continuation shares onset and does not inflate measure duration', () => {
    const result = validateOne([measureXml({ notes: [
      noteXml({ step: 'C' }),
      noteXml({ step: 'E', chord: true }),
      noteXml({ step: 'D' }),
      noteXml({ step: 'E' }),
      noteXml({ step: 'F' }),
    ] })])

    assert.equal(result.measureReport.measures[0].actualBeats, 4)
    assert.equal(result.findings.some((item) => item.code === STRUCTURAL_FINDING_CODE.CHORD_WITHOUT_BASE_NOTE), false)
    const chordEvents = result.timeline.measures[0].events.filter((event) => event.type === 'note').slice(0, 2)
    assert.equal(chordEvents[0].startDivisions, chordEvents[1].startDivisions)
  })

  test('D. tie chain across measures is structurally matched', () => {
    const result = validateOne([
      measureXml({ number: 1, notes: [
        noteXml({ step: 'C', duration: 16, type: 'whole', tieStart: true }),
      ] }),
      measureXml({ number: 2, notes: [
        noteXml({ step: 'C', duration: 16, type: 'whole', tieStop: true }),
      ] }),
    ])

    assert.equal(result.ok, true)
    assert.equal(result.findings.some((item) => item.code === STRUCTURAL_FINDING_CODE.TIE_START_WITHOUT_STOP), false)
    assert.equal(result.findings.some((item) => item.code === STRUCTURAL_FINDING_CODE.TIE_STOP_WITHOUT_START), false)
  })

  test('E. grace note consumes zero measure time', () => {
    const result = validateOne([measureXml({ notes: [
      noteXml({ step: 'B', grace: true, type: 'eighth' }),
      ...quarterNotes(4),
    ] })])

    assert.equal(result.measureReport.measures[0].actualBeats, 4)
    assert.equal(result.measureReport.measures[0].status, 'valid')
    assert.equal(result.timeline.measures[0].events.find((event) => event.isGrace).durationDivisions, 0)
  })

  test('F. valid triplet/time-modification and beam group', () => {
    const notes = [
      noteXml({ step: 'C', duration: 2, type: 'eighth', timeModification: triplet, beam: '<beam number="1">begin</beam>' }),
      noteXml({ step: 'D', duration: 2, type: 'eighth', timeModification: triplet, beam: '<beam number="1">continue</beam>' }),
      noteXml({ step: 'E', duration: 2, type: 'eighth', timeModification: triplet, beam: '<beam number="1">end</beam>' }),
    ]
    const result = validateOne([measureXml({ divisions: 6, beats: 1, beatType: 4, notes })])

    assert.equal(result.measureReport.measures[0].actualBeats, 1)
    assert.equal(result.findings.some((item) => item.code === STRUCTURAL_FINDING_CODE.INVALID_TUPLET_RATIO), false)
    assert.equal(result.findings.some((item) => item.code === STRUCTURAL_FINDING_CODE.BEAM_WITHOUT_BEGIN), false)
  })

  test('G. rests and dotted rhythms preserve canonical measure totals', () => {
    const restResult = validateOne([measureXml({ notes: [
      noteXml({ rest: true }),
      ...quarterNotes(3),
    ] })])
    const dottedResult = validateOne([measureXml({ notes: [
      noteXml({ step: 'C', duration: 12, type: 'half', dot: true }),
      noteXml({ step: 'D', duration: 4, type: 'quarter' }),
    ] })])

    assert.equal(restResult.measureReport.measures[0].actualBeats, 4)
    assert.equal(restResult.measureReport.measures[0].status, 'valid')
    assert.equal(dottedResult.measureReport.measures[0].actualBeats, 4)
    assert.equal(dottedResult.measureReport.measures[0].status, 'valid')
  })

  test('H. same voice on separate staves does not create a false overlap', () => {
    const result = validateOne([measureXml({ beats: 2, notes: [
      noteXml({ step: 'C', duration: 8, type: 'half', voice: 1, staff: 1 }),
    ], events: [
      '      <backup><duration>8</duration></backup>',
      noteXml({ step: 'E', duration: 8, type: 'half', voice: 1, staff: 2 }),
    ] })])

    assert.equal(result.measureReport.measures[0].actualBeats, 2)
    assert.equal(result.findings.some((item) => item.code === STRUCTURAL_FINDING_CODE.VOICE_OVERLAP), false)
  })
})

describe('Package 2B acceptance matrix — exact findings', () => {
  test('I. underfilled measure has exact class, location and expected/actual', () => {
    const result = validateOne([measureXml({ notes: quarterNotes(2) })])
    const finding = result.findings.find((item) => item.code === STRUCTURAL_FINDING_CODE.MEASURE_UNDERFILLED)
    assertFindingContract(finding, {
      code: STRUCTURAL_FINDING_CODE.MEASURE_UNDERFILLED,
      classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
      partId: 'P1', measureKey: 'P1:0', voice: null, expected: 4, actual: 2,
    })
  })

  test('J. overfilled measure and boundary overrun are separately located', () => {
    const result = validateOne([measureXml({ notes: quarterNotes(5) })])
    const overfill = result.findings.find((item) => item.code === STRUCTURAL_FINDING_CODE.MEASURE_OVERFILLED)
    const boundary = result.findings.find((item) => item.code === STRUCTURAL_FINDING_CODE.EVENT_EXCEEDS_MEASURE_BOUNDARY)

    assertFindingContract(overfill, {
      code: STRUCTURAL_FINDING_CODE.MEASURE_OVERFILLED,
      classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
      partId: 'P1', measureKey: 'P1:0', voice: null, expected: 4, actual: 5,
    })
    assertFindingContract(boundary, {
      code: STRUCTURAL_FINDING_CODE.EVENT_EXCEEDS_MEASURE_BOUNDARY,
      classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
      partId: 'P1', measureKey: 'P1:0', voice: 1, expected: 4, actual: 5,
    })
  })

  test('K. duplicate visible measure numbers retain distinct measureKey identity', () => {
    const result = validateOne([
      measureXml({ number: 7, notes: quarterNotes(4) }),
      measureXml({ number: 7, attributes: false, notes: quarterNotes(1) }),
    ])
    const finding = result.findings.find((item) => item.code === STRUCTURAL_FINDING_CODE.MEASURE_UNDERFILLED)

    assertFindingContract(finding, {
      code: STRUCTURAL_FINDING_CODE.MEASURE_UNDERFILLED,
      partId: 'P1', measureKey: 'P1:1', voice: null, expected: 4, actual: 1,
    })
    assert.equal(finding.measureNumber, 7)
  })

  test('L. invalid explicit divisions is a definite structural error and cannot inherit silently', () => {
    const result = validateOne([
      measureXml({ number: 1, divisions: 4, notes: quarterNotes(4) }),
      measureXml({ number: 2, divisions: 0, notes: quarterNotes(4) }),
    ])
    const finding = result.findings.find((item) =>
      item.code === STRUCTURAL_FINDING_CODE.INVALID_DIVISIONS && item.measureKey === 'P1:1'
    )

    assertFindingContract(finding, {
      code: STRUCTURAL_FINDING_CODE.INVALID_DIVISIONS,
      classification: STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR,
      partId: 'P1', measureKey: 'P1:1', voice: null,
      expected: 'positive finite divisions', actual: null,
    })
  })

  test('M. same-voice same-staff overlap is detected without confusing independent voices', () => {
    const result = validateOne([measureXml({ beats: 2, notes: [
      noteXml({ step: 'C', duration: 8, type: 'half', voice: 1, staff: 1 }),
    ], events: [
      '      <backup><duration>4</duration></backup>',
      noteXml({ step: 'D', duration: 4, type: 'quarter', voice: 1, staff: 1 }),
    ] })])
    const finding = result.findings.find((item) => item.code === STRUCTURAL_FINDING_CODE.VOICE_OVERLAP)

    assertFindingContract(finding, {
      code: STRUCTURAL_FINDING_CODE.VOICE_OVERLAP,
      classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
      partId: 'P1', measureKey: 'P1:0', voice: 1, expected: 2, actual: 1,
    })
    assert.equal(finding.staff, 1)
  })

  test('N. multi-part validation retains the exact part identity', () => {
    const xml = scoreXml([
      { id: 'P1', measures: [measureXml({ number: 1, notes: quarterNotes(4) })] },
      { id: 'P2', measures: [measureXml({ number: 1, notes: quarterNotes(1) })] },
    ])
    const result = validateMusicXmlStructuralRhythm(xml)
    const finding = result.findings.find((item) =>
      item.code === STRUCTURAL_FINDING_CODE.MEASURE_UNDERFILLED && item.partId === 'P2'
    )

    assertFindingContract(finding, {
      code: STRUCTURAL_FINDING_CODE.MEASURE_UNDERFILLED,
      partId: 'P2', measureKey: 'P2:0', voice: null, expected: 4, actual: 1,
    })
  })

  test('O. malformed tuplet and orphan beam remain distinct finding types', () => {
    const badTuplet = '<time-modification><actual-notes>0</actual-notes><normal-notes>2</normal-notes></time-modification>'
    const result = validateOne([measureXml({ beats: 2, notes: [
      noteXml({ step: 'C', duration: 4, timeModification: badTuplet }),
      noteXml({ step: 'D', duration: 4, beam: '<beam number="1">continue</beam>' }),
    ] })])
    const tuplet = result.findings.find((item) => item.code === STRUCTURAL_FINDING_CODE.INVALID_TUPLET_RATIO)
    const beam = result.findings.find((item) => item.code === STRUCTURAL_FINDING_CODE.BEAM_WITHOUT_BEGIN)

    assertFindingContract(tuplet, {
      code: STRUCTURAL_FINDING_CODE.INVALID_TUPLET_RATIO,
      classification: STRUCTURAL_FINDING_CLASS.STRUCTURAL_ERROR,
      partId: 'P1', measureKey: 'P1:0', voice: 1,
      expected: 'positive integer actualNotes/normalNotes',
      actual: { actualNotes: 0, normalNotes: 2 },
    })
    assertFindingContract(beam, {
      code: STRUCTURAL_FINDING_CODE.BEAM_WITHOUT_BEGIN,
      classification: STRUCTURAL_FINDING_CLASS.SUSPECTED_OMR_ERROR,
      partId: 'P1', measureKey: 'P1:0', voice: 1,
      expected: 'earlier beam begin', actual: 'continue',
    })
  })
})

describe('Package 2B acceptance matrix — immutability and boundaries', () => {
  test('P. validation never mutates production parsed musical data', () => {
    const xml = scoreXml([{ id: 'P1', measures: [measureXml({ notes: quarterNotes(4) })] }])
    const parsed = parseMusicXmlWithStructure(xml)
    const before = structuredClone(parsed)

    validateMusicXmlStructuralRhythm(xml)

    assert.deepEqual(parsed, before)
  })

  test('Q. structural validity is not promoted to musical correctness or runtime-gate state', () => {
    const result = validateOne([measureXml({ notes: quarterNotes(4) })])

    assert.equal(result.ok, true)
    assert.equal(Object.hasOwn(result, 'musicallyCorrect'), false)
    assert.equal(Object.hasOwn(result, 'consumerDecision'), false)
    assert.equal(Object.hasOwn(result, 'gateDecision'), false)
  })
})
