import assert from 'node:assert/strict'
import test from 'node:test'

import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'
import {
  extractGuitarTabScoreInventory,
  prepareGuitarTabEditorSourceXml,
} from '../src/services/guitarTabScoreInventory.js'

const parserOptions = Object.freeze({ DOMParserCtor: SmoosicTestDOMParser })

const SINGLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
  </measure></part>
</score-partwise>`

const PIANO_AND_VIOLIN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <score-part id="P2"><part-name>Violin</part-name></score-part>
  </part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>
    <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
    <note><pitch><step>D</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
    <note><pitch><step>E</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
    <note><pitch><step>F</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
    <backup><duration>4</duration></backup>
    <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><staff>1</staff></note>
    <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><staff>1</staff></note>
    <backup><duration>2</duration></backup>
    <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff></note>
    <note><pitch><step>D</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff></note>
    <note><pitch><step>E</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff></note>
    <note><pitch><step>F</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff></note>
  </measure></part>
  <part id="P2"><measure number="1"><attributes><divisions>1</divisions></attributes>
    <note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
    <note><pitch><step>A</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
  </measure></part>
</score-partwise>`

test('extracts exact source-order Part Staff Voice inventory from pitched evidence', () => {
  const inventory = extractGuitarTabScoreInventory(PIANO_AND_VIOLIN_XML, parserOptions)
  assert.deepEqual(inventory, {
    parts: [
      {
        partId: 'P1',
        partIndex: 0,
        name: 'Piano',
        staves: [
          {
            staff: 1,
            voices: [
              { voice: 1, pitchedEventCount: 4 },
              { voice: 2, pitchedEventCount: 2 },
            ],
          },
          {
            staff: 2,
            voices: [
              { voice: 1, pitchedEventCount: 4 },
            ],
          },
        ],
      },
      {
        partId: 'P2',
        partIndex: 1,
        name: 'Violin',
        staves: [
          {
            staff: 1,
            voices: [
              { voice: 1, pitchedEventCount: 2 },
            ],
          },
        ],
      },
    ],
  })
  assert.equal(Object.isFrozen(inventory), true)
  assert.equal(Object.isFrozen(inventory.parts), true)
  assert.equal(Object.isFrozen(inventory.parts[0].staves[0].voices), true)
})

test('keeps a one-part one-staff one-voice inventory exact', () => {
  const inventory = extractGuitarTabScoreInventory(SINGLE_XML, parserOptions)
  assert.deepEqual(inventory.parts, [{
    partId: 'P1',
    partIndex: 0,
    name: 'Violin',
    staves: [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }],
  }])
})

test('fails closed on duplicate or contradictory part identity', () => {
  const duplicate = PIANO_AND_VIOLIN_XML
    .replace('<score-part id="P2">', '<score-part id="P1">')
    .replace('<part id="P2">', '<part id="P1">')
  assert.throws(
    () => extractGuitarTabScoreInventory(duplicate, parserOptions),
    /duplicate.*part|part.*duplicate/i,
  )

  const bodyMismatch = PIANO_AND_VIOLIN_XML.replace('<part id="P2">', '<part id="P9">')
  assert.throws(
    () => extractGuitarTabScoreInventory(bodyMismatch, parserOptions),
    /part.*mismatch|body.*part|part-list/i,
  )
})

test('uses implicit first staff and voice for ordinary single-voice MusicXML notes', () => {
  const restOnly = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><note><rest/><duration>1</duration><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>`
  assert.deepEqual(
    extractGuitarTabScoreInventory(restOnly, parserOptions).parts[0].staves,
    [],
  )

  const missingAssignments = SINGLE_XML.replace('<staff>1</staff>', '').replace('<voice>1</voice>', '')
  assert.deepEqual(
    extractGuitarTabScoreInventory(missingAssignments, parserOptions).parts[0].staves,
    [{ staff: 1, voices: [{ voice: 1, pitchedEventCount: 1 }] }],
  )
})

test('prepares an editor-only XML view with implicit staff and voice while preserving source bytes', () => {
  const source = SINGLE_XML.replace('<staff>1</staff>', '').replace('<voice>1</voice>', '')
  const editorXml = prepareGuitarTabEditorSourceXml(source, { partId: 'P1', partIndex: 0, staff: 1, voice: 1 }, {
    DOMParserCtor: SmoosicTestDOMParser,
    XMLSerializerCtor: SmoosicTestXMLSerializer,
  })

  assert.notEqual(editorXml, source)
  assert.match(editorXml, /<voice>1<\/voice>/u)
  assert.match(editorXml, /<staff>1<\/staff>/u)
  assert.equal(source.includes('<voice>'), false)
  assert.equal(source.includes('<staff>'), false)
})

test('does not coerce malformed or non-numeric staff and voice identities', () => {
  const badStaff = SINGLE_XML.replace('<staff>1</staff>', '<staff>upper</staff>')
  assert.deepEqual(
    extractGuitarTabScoreInventory(badStaff, parserOptions).parts[0].staves,
    [],
  )

  const badVoice = SINGLE_XML.replace('<voice>1</voice>', '<voice>melody</voice>')
  assert.deepEqual(
    extractGuitarTabScoreInventory(badVoice, parserOptions).parts[0].staves,
    [],
  )
})

test('part display name whitespace falls back to stable partId without rejecting the score', () => {
  const empty = SINGLE_XML.replace('<part-name>Violin</part-name>', '<part-name>   </part-name>')
  assert.equal(extractGuitarTabScoreInventory(empty, parserOptions).parts[0].name, 'P1')
})

test('does not advertise leading-zero staff or voice identities as canonical targets', () => {
  const leadingZeroStaff = SINGLE_XML.replace('<staff>1</staff>', '<staff>01</staff>')
  const leadingZeroVoice = SINGLE_XML.replace('<voice>1</voice>', '<voice>01</voice>')
  assert.deepEqual(
    extractGuitarTabScoreInventory(leadingZeroStaff, parserOptions).parts[0].staves,
    [],
  )
  assert.deepEqual(
    extractGuitarTabScoreInventory(leadingZeroVoice, parserOptions).parts[0].staves,
    [],
  )
})
