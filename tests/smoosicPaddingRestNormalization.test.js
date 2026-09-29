import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SMOOSIC_PADDING_PROVENANCE_VERSION,
  normalizeSmoosicPaddingRests,
} from '../src/services/smoosicPaddingRestNormalization.js'

// The browser owns DOMParser/XMLSerializer in production. This small DOM supports
// the MusicXML subset in these fixtures while the shared XML security scanner
// checks the complete input before this parser is ever reached.
class Element {
  constructor(tagName, attributes = '') {
    this.tagName = tagName
    this.localName = tagName
    this.namespaceURI = null
    this.attributes = attributes
    this.childNodes = []
    this.parentNode = null
  }
  get children() { return this.childNodes.filter((child) => child instanceof Element) }
  get textContent() { return this.childNodes.map((child) => typeof child === 'string' ? child : child.textContent).join('') }
  appendChild(child) {
    if (child instanceof Element) child.parentNode = this
    this.childNodes.push(child)
    return child
  }
  replaceChild(replacement, child) {
    const index = this.childNodes.indexOf(child)
    if (index < 0) throw new Error('Missing child')
    replacement.parentNode = this
    child.parentNode = null
    this.childNodes[index] = replacement
  }
  cloneNode(deep) {
    const clone = new Element(this.tagName, this.attributes)
    if (deep) this.childNodes.forEach((child) => clone.appendChild(typeof child === 'string' ? child : child.cloneNode(true)))
    return clone
  }
  querySelectorAll(tag) {
    return this.children.flatMap((child) => [
      ...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag),
    ])
  }
  querySelector(tag) { return this.querySelectorAll(tag)[0] ?? null }
}

class TestDocument extends Element {
  constructor() { super('#document') }
  get documentElement() { return this.children[0] }
  createElementNS(_namespace, tag) { return new Element(tag) }
  cloneNode(deep) {
    const clone = new TestDocument()
    if (deep) this.childNodes.forEach((child) => clone.appendChild(typeof child === 'string' ? child : child.cloneNode(true)))
    return clone
  }
}

class TestDOMParser {
  parseFromString(xml) {
    const document = new TestDocument()
    const stack = [document]
    for (const token of xml.match(/<[^>]+>|[^<]+/g) ?? []) {
      if (token.startsWith('<?') || token.startsWith('<!--')) continue
      if (token.startsWith('</')) { stack.pop(); continue }
      if (token.startsWith('<')) {
        const match = token.match(/^<([\w:-]+)([^>]*?)(\/?)>$/)
        if (!match) throw new Error('Invalid XML token')
        const child = stack.at(-1).appendChild(new Element(match[1], match[2]))
        if (!match[3]) stack.push(child)
      } else {
        stack.at(-1).appendChild(token)
      }
    }
    return document
  }
}

class TestXMLSerializer {
  serializeToString(element) {
    if (element.tagName === '#document') return element.childNodes.map((child) => this.serializeToString(child)).join('')
    if (element.childNodes.length === 0) return `<${element.tagName}${element.attributes}/>`
    const contents = element.childNodes.map((child) => typeof child === 'string' ? child : this.serializeToString(child)).join('')
    return `<${element.tagName}${element.attributes}>${contents}</${element.tagName}>`
  }
}

globalThis.DOMParser = TestDOMParser
globalThis.XMLSerializer = TestXMLSerializer

const rest = (duration = '8', attrs = '', extras = '<voice>1</voice>') =>
  `<note${attrs}><rest/><duration>${duration}</duration>${extras}<type>quarter</type></note>`
const pitch = '<note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice></note>'
const xml = (...notes) => `<score-partwise><part id="P1"><measure number="1">${notes.join('')}</measure></part></score-partwise>`
const entry = (rawNoteOrdinal, durationTicks = 8) => ({
  staffIndex: 0, measureIndex: 0, voiceIndex: 0, noteIndex: rawNoteOrdinal,
  rawNoteOrdinal, noteIdentity: `pad-${rawNoteOrdinal}`, durationTicks,
})
const proof = (rawNoteCount, entries) => ({
  version: SMOOSIC_PADDING_PROVENANCE_VERSION, sourceRevision: 7, rawNoteCount, entries,
})
const normalize = (musicXml, provenance) => normalizeSmoosicPaddingRests({ musicXml, provenance, sourceRevision: 7 })

test('converts one certified rest and preserves its explicit duration, voice and staff', () => {
  const musicXml = xml(pitch, rest('16', '', '<voice>2</voice><staff>1</staff>'))
  const result = normalize(musicXml, proof(2, [{ ...entry(1, 16), voiceIndex: 1, noteIndex: 0 }]))
  assert.ok(Object.isFrozen(result))
  assert.equal(result.rawNoteCount, 2)
  assert.equal(result.normalizedNoteCount, 1)
  assert.equal(result.convertedCount, 1)
  assert.match(result.musicXml, /<forward><duration>16<\/duration><voice>2<\/voice><staff>1<\/staff><\/forward>/)
  assert.equal((result.musicXml.match(/<note\b/g) ?? []).length, 1)
  assert.equal(musicXml.includes('<forward>'), false)
})

test('converts multiple sorted certified ordinals without changing other notes', () => {
  const musicXml = xml(rest(), pitch, rest('16'), rest())
  const result = normalize(musicXml, proof(4, [entry(0), entry(2, 16)]))
  assert.equal(result.convertedCount, 2)
  assert.equal(result.normalizedNoteCount, 2)
  assert.equal((result.musicXml.match(/<forward>/g) ?? []).length, 2)
  assert.match(result.musicXml, /<note><rest\/><duration>8<\/duration><voice>1<\/voice><type>quarter<\/type><\/note>/)
})

test('matches certified locators across voice groups and measure boundaries', () => {
  const musicXml = '<score-partwise><part id="P1">'
    + `<measure number="1">${pitch}${rest('8', '', '<voice>2</voice>')}</measure>`
    + `<measure number="2">${rest()}</measure></part></score-partwise>`
  const entries = [
    { ...entry(1), voiceIndex: 1, noteIndex: 0 },
    { ...entry(2), measureIndex: 1, noteIndex: 0 },
  ]
  const result = normalize(musicXml, proof(3, entries))
  assert.equal(result.convertedCount, 2)
  assert.equal((result.musicXml.match(/<forward>/g) ?? []).length, 2)
})

test('counts MusicXML chord members as one Smoosic model note locator', () => {
  const chordRoot = '<note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice></note>'
  const chordMember = '<note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice></note>'
  const musicXml = xml(chordRoot, chordMember, rest())
  const certified = { ...entry(2), noteIndex: 1 }
  const result = normalize(musicXml, proof(3, [certified]))
  assert.equal(result.convertedCount, 1)
  assert.match(result.musicXml, /<note><chord\/><pitch>/)
  assert.match(result.musicXml, /<forward><duration>8<\/duration><voice>1<\/voice><\/forward>/)
})

test('preserves visible, hidden and teacher-authored source rests identical to certified padding', () => {
  const visible = rest('8', ' id="source-visible"')
  const hidden = rest('8', ' id="source-hidden" print-object="no"')
  const teacher = rest('8', ' id="teacher-added"')
  const padding = rest('8', ' id="padding"')
  const result = normalize(xml(visible, hidden, teacher, padding), proof(4, [entry(3)]))
  for (const sourceRest of [visible, hidden, teacher]) assert.ok(result.musicXml.includes(sourceRest), sourceRest)
  assert.equal((result.musicXml.match(/<rest\/>/g) ?? []).length, 3)
  assert.equal((result.musicXml.match(/<forward>/g) ?? []).length, 1)
})

test('accepts valid empty proof without converting any notes', () => {
  const result = normalize(xml(rest(), pitch), proof(2, []))
  assert.equal(result.convertedCount, 0)
  assert.equal(result.rawNoteCount, 2)
  assert.equal(result.normalizedNoteCount, 2)
  assert.equal((result.musicXml.match(/<forward>/g) ?? []).length, 0)
})

test('rejects missing, version-mismatched and stale proof or unsafe revision', () => {
  const musicXml = xml(rest())
  const valid = proof(1, [entry(0)])
  for (const invalid of [undefined, null, { ...valid, version: 2 }, { ...valid, sourceRevision: 8 }, { ...valid, sourceRevision: '7' }]) {
    assert.throws(() => normalize(musicXml, invalid), /provenance|version|revision/i)
  }
  for (const sourceRevision of ['7', -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => normalizeSmoosicPaddingRests({ musicXml, provenance: valid, sourceRevision }), /revision/i)
  }
})

test('rejects duplicate, unsorted and out-of-range raw note ordinals', () => {
  const musicXml = xml(rest(), rest())
  for (const entries of [[entry(0), entry(0)], [entry(1), entry(0)], [entry(2)], [entry(-1)], [entry(0.5)]]) {
    assert.throws(() => normalize(musicXml, proof(2, entries)), /ordinal|entry|range/i)
  }
})

test('rejects an ordinal redirected to an identical source rest at a different locator', () => {
  const musicXml = xml(rest('8', ' id="source"'), rest('8', ' id="padding"'))
  const certified = { ...entry(1), rawNoteOrdinal: 0 }
  assert.throws(() => normalize(musicXml, proof(2, [certified])), /locator|ordinal|mapping/i)
})

test('rejects changed locator fields and duplicate certified identities', () => {
  const musicXml = xml(rest(), rest())
  for (const changed of [
    { noteIndex: 1 }, { measureIndex: 1 }, { voiceIndex: 1 }, { staffIndex: 1 },
  ]) {
    assert.throws(() => normalize(musicXml, proof(2, [{ ...entry(0), ...changed }])), /locator|mapping/i)
  }
  assert.throws(() => normalize(musicXml, proof(2, [entry(0), { ...entry(1), noteIdentity: 'pad-0' }])), /identity|duplicate/i)
})

test('rejects ambiguous XML locator mapping rather than certifying an ordinal by shape', () => {
  const missingVoice = xml('<note><rest/><duration>8</duration></note>')
  assert.throws(() => normalize(missingVoice, proof(1, [entry(0)])), /voice|locator|mapping/i)
  const secondStaff = xml(rest('8', '', '<voice>1</voice><staff>2</staff>'))
  assert.throws(() => normalize(secondStaff, proof(1, [{ ...entry(0), staffIndex: 1 }])), /staff|locator|mapping/i)
  const multipleParts = '<score-partwise><part id="P1"><measure number="1"></measure></part><part id="P2"><measure number="1">'
    + rest() + '</measure></part></score-partwise>'
  assert.throws(() => normalize(multipleParts, proof(1, [entry(0)])), /part|locator|mapping/i)
})

test('rejects count disagreement and an oversized entry list', () => {
  const musicXml = xml(rest())
  assert.throws(() => normalize(musicXml, proof(2, [entry(0)])), /count/i)
  assert.throws(() => normalize(musicXml, proof(1, [entry(0), entry(0)])), /count|entry/i)
  assert.throws(() => normalize(musicXml, proof(0, [])), /count/i)
})

test('rejects pitched targets and missing, malformed or mismatched explicit duration', () => {
  assert.throws(() => normalize(xml(pitch), proof(1, [entry(0)])), /rest/i)
  for (const duration of ['', 'oops', '0', '-1', '9007199254740992']) {
    assert.throws(() => normalize(xml(rest(duration)), proof(1, [entry(0)])), /duration/i)
  }
  assert.throws(() => normalize(xml('<note><rest/><voice>1</voice></note>'), proof(1, [entry(0)])), /duration/i)
  assert.throws(() => normalize(xml(rest('16')), proof(1, [entry(0)])), /duration/i)
  assert.throws(() => normalize(xml(rest()), proof(1, [{ ...entry(0), durationTicks: '8' }])), /duration/i)
})

test('validates every target before conversion and rejects malformed or unsafe MusicXML', () => {
  assert.throws(() => normalize(xml(rest(), pitch), proof(2, [entry(0), entry(1)])), /rest/i)
  assert.throws(() => normalize('<score-partwise><note></score-partwise>', proof(1, [entry(0)])), /xml/i)
  assert.throws(() => normalize('<!DOCTYPE score-partwise [<!ENTITY x SYSTEM "file:///secret">]><score-partwise/>', proof(0, [])), /xml/i)
  assert.throws(() => normalize(`<score-partwise>${' '.repeat(10 * 1024 * 1024)}</score-partwise>`, proof(0, [])), /xml|size/i)
})
