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
  .replace('<step>C</step><octave>4</octave>', '<step>B</step><octave>4</octave>')

const SMOOSIC_UNPROVABLE_SECOND_PART_TIMING_XML =
  SMOOSIC_MISSING_SECOND_PART_DIVISIONS_XML.replace(
    '<note><pitch><step>G</step><octave>3</octave></pitch><duration>4096</duration>',
    '<note><pitch><step>G</step><octave>3</octave></pitch><duration>1234</duration>',
  )

const MISSING_SECOND_PART_WITHOUT_SMOOSIC_PROOF_XML = SOURCE_XML
  .replace(
    '<part id="P2"><measure number="1">\n    <attributes><divisions>12</divisions>',
    '<part id="P2"><measure number="1">\n    <attributes>',
  )
  .replace('<step>C</step><octave>4</octave>', '<step>B</step><octave>4</octave>')

const MALFORMED_SMOOSIC_DIVISIONS_XML = SMOOSIC_MISSING_SECOND_PART_DIVISIONS_XML
  .replace('<divisions>4096</divisions>', '<divisions>not-a-number</divisions>')

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

function writeback(root, musicXml, suffix) {
  return applySmoosicProductWriteback({
    authority: root,
    musicXml,
    paddingRestProvenance: emptyProof(musicXml),
    sourceRevision: 7,
    revisionId: `smpb-01-${suffix}`,
    eventId: `smpb-01-${suffix}-event`,
    operationIdPrefix: `smpb-01-${suffix}-op`,
    createdAt: '2026-10-05T18:47:00Z',
    DOMParserCtor: SmoosicTestDOMParser,
    XMLSerializerCtor: SmoosicTestXMLSerializer,
  })
}

function assertFailClosed(result, root, current) {
  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.UNSUPPORTED_STRUCTURE)
  assert.equal(result.authority, root)
  assert.equal(root.workspace.history.revisions.length, 1)
  assert.equal(getTeacherWorkspaceCurrentRevision(root.workspace), current)
  assert.equal(resolvePrDProductMusicXml(current)?.musicXml, SOURCE_XML)
}

test('SMPB-01 restores a missing later-part Smoosic timing basis before immutable writeback', () => {
  const root = authority()
  const current = getTeacherWorkspaceCurrentRevision(root.workspace)

  const result = writeback(root, SMOOSIC_MISSING_SECOND_PART_DIVISIONS_XML, 'edit')

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.APPLIED)
  assert.deepEqual(result.changedIndexes, [0])
  assert.equal(result.revision.content[0].step, 'B')
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

test('SMPB-01 fails closed when a later-part Smoosic timing basis cannot be projected safely', () => {
  const root = authority()
  const current = getTeacherWorkspaceCurrentRevision(root.workspace)

  const result = writeback(root, SMOOSIC_UNPROVABLE_SECOND_PART_TIMING_XML, 'unproven-duration')

  assertFailClosed(result, root, current)
})

test('SMPB-01 fails closed when a later part is missing divisions without first-part Smoosic 4096 proof', () => {
  const root = authority()
  const current = getTeacherWorkspaceCurrentRevision(root.workspace)

  const result = writeback(root, MISSING_SECOND_PART_WITHOUT_SMOOSIC_PROOF_XML, 'missing-proof')

  assertFailClosed(result, root, current)
})

test('SMPB-01 fails closed on malformed divisions instead of accepting a broken candidate', () => {
  const root = authority()
  const current = getTeacherWorkspaceCurrentRevision(root.workspace)

  const result = writeback(root, MALFORMED_SMOOSIC_DIVISIONS_XML, 'malformed-divisions')

  assertFailClosed(result, root, current)
})
