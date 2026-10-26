import assert from 'node:assert/strict'
import test from 'node:test'

import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'
import {
  extractGuitarTabScoreInventory,
  prepareGuitarTabEditorSourceXml,
} from '../src/services/guitarTabScoreInventory.js'

const parseOptions = Object.freeze({ DOMParserCtor: SmoosicTestDOMParser })
const editorOptions = Object.freeze({
  DOMParserCtor: SmoosicTestDOMParser,
  XMLSerializerCtor: SmoosicTestXMLSerializer,
})

function score(notes, staves = '') {
  return `<?xml version="1.0"?><score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Source</part-name></score-part></part-list>
    <part id="P1"><measure number="1"><attributes><divisions>1</divisions>${staves}</attributes>${notes}</measure></part>
  </score-partwise>`
}

const TARGET = Object.freeze({ partId: 'P1', partIndex: 0, staff: 1, voice: 1 })

test('inventory and derived editor XML share safe implicit Staff 1 Voice 1 policy', () => {
  const source = score('<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>', '<staves>1</staves>')
  const inventory = extractGuitarTabScoreInventory(source, parseOptions)
  assert.deepEqual(inventory.parts[0].staves, [
    { staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] },
  ])

  const derived = prepareGuitarTabEditorSourceXml(source, TARGET, editorOptions)
  assert.match(derived, /<voice>1<\/voice>/u)
  assert.match(derived, /<staff>1<\/staff>/u)
  assert.equal(source.includes('<voice>'), false)
  assert.equal(source.includes('<staff>'), false)
})

test('multi-staff missing staff fails closed instead of materializing Staff 1', () => {
  const source = score(`
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
    <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff></note>`, '<staves>2</staves>')

  assert.throws(() => extractGuitarTabScoreInventory(source, parseOptions), (error) => {
    assert.equal(error?.category, 'IDENTITY')
    assert.equal(error?.code, 'STAFF_IDENTITY_AMBIGUOUS')
    return true
  })
  assert.throws(() => prepareGuitarTabEditorSourceXml(source, TARGET, editorOptions), /staff/i)
})

test('multi-voice missing voice fails closed instead of materializing Voice 1', () => {
  const source = score(`
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><staff>1</staff></note>
    <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><staff>1</staff></note>`)

  assert.throws(() => extractGuitarTabScoreInventory(source, parseOptions), (error) => {
    assert.equal(error?.category, 'IDENTITY')
    assert.equal(error?.code, 'VOICE_IDENTITY_AMBIGUOUS')
    return true
  })
})

test('wrong part index remains fail-closed and source bytes remain untouched', () => {
  const source = score('<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>')
  const original = source
  assert.throws(
    () => prepareGuitarTabEditorSourceXml(source, { ...TARGET, partIndex: 1 }, editorOptions),
    /part/i,
  )
  assert.equal(source, original)
})
