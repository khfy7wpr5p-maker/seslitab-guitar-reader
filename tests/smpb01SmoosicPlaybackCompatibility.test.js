import test from 'node:test'
import assert from 'node:assert/strict'
import '../scripts/runOmrQualityReport.js'

import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
import { getTeacherWorkspaceCurrentRevision } from '../src/services/teacherWorkspaceModel.js'
import { resolvePrDProductMusicXml } from '../src/services/editorPrDRevisionMusicXmlRegistry.js'
import {
  SMOOSIC_WRITEBACK_STATUS,
  applySmoosicProductWriteback,
  createSmoosicProductAuthority,
} from '../src/services/smoosicProductWriteback.js'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

const SOURCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Upper</part-name></score-part>
    <score-part id="P2"><part-name>Lower</part-name></score-part>
  </part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>12</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>12</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>12</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>12</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
    <note><pitch><step>F</step><octave>4</octave></pitch><duration>12</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
  </measure></part>
  <part id="P2"><measure number="1">
    <attributes><divisions>12</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>G</step><octave>3</octave></pitch><duration>12</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
    <note><pitch><step>A</step><octave>3</octave></pitch><duration>12</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
    <note><pitch><step>B</step><octave>3</octave></pitch><duration>12</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>12</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
  </measure></part>
</score-partwise>`

const SMOOSIC_MISSING_SECOND_PART_DIVISIONS_XML = SOURCE_XML
  .replaceAll('<divisions>12</divisions>', '<divisions>4096</divisions>')
  .replaceAll('<duration>12</duration>', '<duration>4096</duration>')
  .replace(
    '<part id="P2"><measure number="1">\n    <attributes><divisions>4096</divisions>',
    '<part id="P2"><measure number="1">\n    <attributes>',
  )
  .replace('<step>G</step><octave>3</octave>', '<step>F</step><octave>3</octave>')

function notes(xml) {
  const parsed = parseMusicXmlToNotes(xml)
  assert.equal(parsed.error, undefined)
  assert.ok(Array.isArray(parsed.notes))
  return parsed.notes
}

function emptyProof(xml) {
  return {
    version: 1,
    sourceRevision: 7,
    rawNoteCount: (xml.match(/<note\b/g) ?? []).length,
    entries: [],
  }
}

function authority() {
  return createSmoosicProductAuthority({
    notes: notes(SOURCE_XML),
    musicXml: SOURCE_XML,
    sourceId: 'smpb-01-source',
    automaticRevisionId: 'smpb-01-auto',
    historyId: 'smpb-01-history',
    actorId: 'smoosic-local-editor',
    createdAt: '2026-10-05T18:45:00Z',
  })
}

test('SMPB-01 restores a missing later-part Smoosic timing basis before immutable writeback', () => {
  const root = authority()
  const current = getTeacherWorkspaceCurrentRevision(root.workspace)

  const result = applySmoosicProductWriteback({
    authority: root,
    musicXml: SMOOSIC_MISSING_SECOND_PART_DIVISIONS_XML,
    paddingRestProvenance: emptyProof(SMOOSIC_MISSING_SECOND_PART_DIVISIONS_XML),
    sourceRevision: 7,
    revisionId: 'smpb-01-edit',
    eventId: 'smpb-01-event',
    operationIdPrefix: 'smpb-01-op',
    createdAt: '2026-10-05T18:46:00Z',
    DOMParserCtor: SmoosicTestDOMParser,
    XMLSerializerCtor: SmoosicTestXMLSerializer,
  })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.APPLIED)
  assert.deepEqual(result.changedIndexes, [4])
  assert.equal(result.revision.content[4].step, 'F')
  assert.equal(root.workspace.history.revisions.length, 1)
  assert.equal(result.authority.workspace.history.revisions.length, 2)
  assert.equal(resolvePrDProductMusicXml(current)?.musicXml, SOURCE_XML)
  assert.equal(resolvePrDProductMusicXml(result.revision)?.musicXml, result.musicXml)

  const secondPart = result.musicXml.match(/<part id="P2">[\s\S]*?<\/part>/i)?.[0] ?? ''
  assert.match(secondPart, /<divisions>12<\/divisions>/)
  assert.equal((result.musicXml.match(/<divisions>12<\/divisions>/g) ?? []).length, 2)
  assert.doesNotMatch(result.musicXml, /<divisions>4096<\/divisions>/)
  assert.doesNotMatch(result.musicXml, /<duration>4096<\/duration>/)
})
