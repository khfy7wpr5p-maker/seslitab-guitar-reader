import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

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
  querySelector(selector) { return this._findAll(selector)[0] || null }
  querySelectorAll(selector) { return this._findAll(selector) }
  _findAll(selector, found = []) {
    for (const child of this.children) {
      if (child.tag === selector) found.push(child)
      child._findAll(selector, found)
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

      const closing = match[0][1] === '/'
      if (closing) {
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
import {
  extractMusicXmlStructuralEvidence,
} from '../src/services/musicXmlStructuralEvidence.js'
import {
  attachStructuralEvidence,
  validateMusicXmlStructuralRhythm,
} from '../src/services/musicXmlStructuralValidation.js'
import {
  STRUCTURAL_FINDING_CODE,
} from '../src/services/structuralRhythmValidator.js'

function noteXml({
  step = 'C',
  octave = 4,
  duration = 4,
  voice = 1,
  staff = 1,
  type = 'quarter',
  timeModification = '',
  beam = '',
} = {}) {
  return `
      <note>
        <pitch><step>${step}</step><octave>${octave}</octave></pitch>
        <duration>${duration}</duration>
        <voice>${voice}</voice>
        <type>${type}</type>
        ${timeModification}
        ${beam}
        <staff>${staff}</staff>
      </note>`
}

function scoreXml(measures) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
${measures.join('\n')}
  </part>
</score-partwise>`
}

function measureXml({ number = 1, divisions = '4', beats = 4, beatType = 4, notes = [] } = {}) {
  return `    <measure number="${number}">
      <attributes>
        <divisions>${divisions}</divisions>
        <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>
      </attributes>
${notes.join('\n')}
    </measure>`
}

const triplet = `
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          <normal-type>eighth</normal-type>
        </time-modification>`

describe('Package 2B MusicXML structural evidence', () => {
  test('extractor preserves tuplet, beam and divisions declaration evidence', () => {
    const xml = scoreXml([measureXml({
      divisions: '6',
      beats: 1,
      beatType: 4,
      notes: [noteXml({
        duration: 2,
        type: 'eighth',
        timeModification: triplet,
        beam: '<beam number="1">begin</beam>',
      })],
    })])

    const evidence = extractMusicXmlStructuralEvidence(xml)

    assert.equal(evidence.ok, true)
    assert.deepEqual(evidence.divisionsDeclarations[0], {
      partId: 'P1',
      partIndex: 0,
      measureIndex: 0,
      measureNumber: 1,
      measureKey: 'P1:0',
      present: true,
      raw: '6',
      value: 6,
      valid: true,
    })
    assert.deepEqual(evidence.noteEvidence[0].tuplet, {
      actualNotes: 3,
      normalNotes: 2,
      normalType: 'eighth',
      normalDotCount: 0,
    })
    assert.deepEqual(evidence.noteEvidence[0].beam, [
      { number: 1, value: 'begin' },
    ])
  })

  test('valid triplet beam group validates from real MusicXML without false errors', () => {
    const xml = scoreXml([measureXml({
      divisions: '6',
      beats: 1,
      beatType: 4,
      notes: [
        noteXml({ step: 'C', duration: 2, type: 'eighth', timeModification: triplet, beam: '<beam number="1">begin</beam>' }),
        noteXml({ step: 'D', duration: 2, type: 'eighth', timeModification: triplet, beam: '<beam number="1">continue</beam>' }),
        noteXml({ step: 'E', duration: 2, type: 'eighth', timeModification: triplet, beam: '<beam number="1">end</beam>' }),
      ],
    })])

    const result = validateMusicXmlStructuralRhythm(xml)

    assert.equal(result.ok, true)
    assert.equal(result.measureReport.measures[0].actualBeats, 1)
    assert.equal(result.measureReport.measures[0].status, 'valid')
    assert.equal(result.findings.some((finding) => finding.code === STRUCTURAL_FINDING_CODE.INVALID_TUPLET_RATIO), false)
    assert.equal(result.findings.some((finding) => finding.code === STRUCTURAL_FINDING_CODE.BEAM_WITHOUT_BEGIN), false)
    assert.equal(result.findings.some((finding) => finding.code === STRUCTURAL_FINDING_CODE.UNCLOSED_BEAM_GROUP), false)
  })

  test('invalid time-modification ratio is located from MusicXML', () => {
    const invalidTuplet = `
        <time-modification>
          <actual-notes>0</actual-notes>
          <normal-notes>2</normal-notes>
        </time-modification>`
    const xml = scoreXml([measureXml({
      beats: 1,
      notes: [noteXml({ duration: 4, timeModification: invalidTuplet })],
    })])

    const result = validateMusicXmlStructuralRhythm(xml)
    const finding = result.findings.find((item) => item.code === STRUCTURAL_FINDING_CODE.INVALID_TUPLET_RATIO)

    assert.equal(result.ok, true)
    assert.ok(finding)
    assert.equal(finding.partId, 'P1')
    assert.equal(finding.measureKey, 'P1:0')
    assert.deepEqual(finding.actual, { actualNotes: 0, normalNotes: 2 })
  })

  test('orphan beam continuation is exposed as suspected OMR error', () => {
    const xml = scoreXml([measureXml({
      beats: 1,
      notes: [noteXml({ beam: '<beam number="1">continue</beam>' })],
    })])

    const result = validateMusicXmlStructuralRhythm(xml)
    const finding = result.findings.find((item) => item.code === STRUCTURAL_FINDING_CODE.BEAM_WITHOUT_BEGIN)

    assert.equal(result.ok, true)
    assert.ok(finding)
    assert.equal(finding.measureKey, 'P1:0')
    assert.equal(finding.actual, 'continue')
  })

  test('explicit invalid divisions cannot hide behind previously inherited divisions', () => {
    const first = measureXml({
      number: 1,
      divisions: '4',
      notes: Array.from({ length: 4 }, (_, index) => noteXml({ step: ['C', 'D', 'E', 'F'][index] })),
    })
    const second = measureXml({
      number: 2,
      divisions: '0',
      notes: Array.from({ length: 4 }, (_, index) => noteXml({ step: ['G', 'A', 'B', 'C'][index] })),
    })
    const xml = scoreXml([first, second])

    const productionParse = parseMusicXmlWithStructure(xml)
    assert.equal(productionParse.divisionsByMeasure[1].divisions, 4)

    const result = validateMusicXmlStructuralRhythm(xml)
    const finding = result.findings.find((item) =>
      item.code === STRUCTURAL_FINDING_CODE.INVALID_DIVISIONS && item.measureKey === 'P1:1'
    )

    assert.equal(result.ok, true)
    assert.ok(finding)
    assert.equal(finding.classification, 'structural_error')
    assert.equal(finding.actual, null)
    assert.equal(result.evidence.divisionsDeclarations[1].raw, '0')
    assert.equal(result.evidence.divisionsDeclarations[1].valid, false)
  })

  test('validation-only evidence attachment never mutates production parser output', () => {
    const xml = scoreXml([measureXml({
      divisions: '6',
      beats: 1,
      notes: [noteXml({ duration: 6, timeModification: triplet, beam: '<beam number="1">forward hook</beam>' })],
    })])
    const structured = parseMusicXmlWithStructure(xml)
    const before = structuredClone(structured)
    const evidence = extractMusicXmlStructuralEvidence(xml)

    const validationClone = attachStructuralEvidence(structured, evidence)

    assert.deepEqual(structured, before)
    assert.notEqual(validationClone, structured)
    assert.deepEqual(validationClone.notes[0].tuplet, {
      actualNotes: 3,
      normalNotes: 2,
      normalType: 'eighth',
      normalDotCount: 0,
    })
    assert.equal(structured.notes[0].tuplet, undefined)
  })

  test('note-count mismatch fails closed instead of guessing an association', () => {
    const xml = scoreXml([measureXml({ notes: [noteXml()] })])
    const structured = parseMusicXmlWithStructure(xml)
    const evidence = extractMusicXmlStructuralEvidence(xml)
    const mismatched = {
      ...evidence,
      noteEvidence: [],
    }

    assert.throws(
      () => attachStructuralEvidence(structured, mismatched),
      /structural-evidence-note-count-mismatch/,
    )
  })

  test('unsafe or malformed MusicXML fails closed', () => {
    const unsafe = '<!DOCTYPE score-partwise [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><score-partwise>&xxe;</score-partwise>'
    const result = validateMusicXmlStructuralRhythm(unsafe)

    assert.equal(result.ok, false)
    assert.deepEqual(result.findings, [])
    assert.equal(typeof result.error, 'string')
    assert.ok(result.error.length > 0)
  })
})
