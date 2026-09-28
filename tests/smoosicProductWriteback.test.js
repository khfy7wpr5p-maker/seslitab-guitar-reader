import test from 'node:test'
import assert from 'node:assert/strict'
import '../scripts/runOmrQualityReport.js'

import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
import {
  approveTeacherWorkspace,
  getTeacherWorkspaceApplicableApproval,
  getTeacherWorkspaceCurrentRevision,
} from '../src/services/teacherWorkspaceModel.js'
import { MAX_MUSIC_XML_FILE_SIZE } from '../src/services/musicXmlFile.js'
import { resolvePrDProductMusicXml } from '../src/services/editorPrDRevisionMusicXmlRegistry.js'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'

const ProductDOMParser = SmoosicTestDOMParser
globalThis.DOMParser = ProductDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

const emptyProof = (xml, sourceRevision = 7) => ({
  version: 1, sourceRevision, rawNoteCount: (xml.match(/<note\b/g) ?? []).length, entries: [],
})

async function loadWriteback() {
  try {
    return await import('../src/services/smoosicProductWriteback.js')
  } catch (error) {
    assert.fail(`S15 write-back service unavailable: ${error?.code || error?.message || error}`)
  }
}

const SOURCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Test</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>1</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef>
    </attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
  </measure></part>
</score-partwise>`

const RHYTHM_SOURCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Rhythm</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>2</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time>
    </attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>half</type></note>
  </measure></part>
</score-partwise>`

const RHYTHM_EDIT_XML = RHYTHM_SOURCE_XML
  .replace(
    '<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>',
    '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>half</type></note>',
  )
  .replace(
    '<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>half</type></note>',
    '<note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type></note>',
  )

const REAL_REST = '<note><rest/><duration>1</duration><voice>2</voice><type>quarter</type></note>'
const PADDING_REST = '<note><rest/><duration>1</duration><voice>1</voice><type>quarter</type></note>'
const SOURCE_GAP = '<forward><duration>1</duration><voice>2</voice></forward>'
const REST_SOURCE_XML = SOURCE_XML.replaceAll('<voice>1</voice>', '<voice>2</voice>')
  .replace(/<note><pitch><step>D<\/step>[\s\S]*?<\/note>/, REAL_REST)
  .replace(/<note><pitch><step>F<\/step>[\s\S]*?<\/note>/, SOURCE_GAP)
const PADDED_EDIT_XML = REST_SOURCE_XML.replaceAll('<voice>2</voice>', '<voice>1</voice>')
  .replaceAll('id="P1"', 'id="P0"')
  .replace('<step>C</step>', '<step>G</step>')
  .replace('<forward><duration>1</duration><voice>1</voice></forward>', PADDING_REST)
const paddingEntry = (rawNoteOrdinal = 3) => ({
  staffIndex: 0, measureIndex: 0, voiceIndex: 0, noteIndex: rawNoteOrdinal,
  rawNoteOrdinal, noteIdentity: 'import-padding-1', durationTicks: 1,
})
const paddingProof = () => ({ version: 1, sourceRevision: 7, rawNoteCount: 4, entries: [paddingEntry()] })

test('certified padding plus a pitch edit preserves genuine rests through immutable canonical revalidation', async () => {
  const { applySmoosicProductWriteback } = await loadWriteback()
  const root = await authority({ xml: REST_SOURCE_XML })
  const current = getTeacherWorkspaceCurrentRevision(root.workspace)
  const before = JSON.stringify(current)
  const result = applySmoosicProductWriteback({
    authority: root, musicXml: PADDED_EDIT_XML, paddingRestProvenance: paddingProof(), sourceRevision: 7,
    revisionId: 'padding-edit', eventId: 'padding-event', operationIdPrefix: 'padding-op',
    DOMParserCtor: ProductDOMParser,
  })
  assert.equal(result.status, 'APPLIED')
  assert.deepEqual(result.changedIndexes, [0])
  assert.equal(result.authority.workspace.history.revisions.length, 2)
  assert.equal(result.revision.parentRevisionId, current.revisionId)
  assert.equal(result.revision.content.length, 3)
  assert.equal(result.revision.content[0].step, 'G')
  assert.equal(result.revision.content[0].partId, 'P1')
  assert.equal(result.revision.content[0].voice, 2)
  assert.deepEqual(result.revision.content[1], current.content[1])
  assert.ok(result.musicXml.includes(REAL_REST))
  assert.match(result.musicXml, /<forward><duration>1<\/duration><voice>1<\/voice><\/forward>/)
  assert.equal(resolvePrDProductMusicXml(result.revision)?.musicXml, result.musicXml)
  assert.equal(JSON.stringify(current), before)
  assert.equal(root.workspace.history.revisions.length, 1)
})

test('proof failures and unproven structural edits leave the exact authority and revision unchanged', async (t) => {
  const { applySmoosicProductWriteback } = await loadWriteback()
  const noPaddingEdit = REST_SOURCE_XML.replace('<step>C</step>', '<step>G</step>')
  const cases = [
    ['missing proof', noPaddingEdit, undefined],
    ['tampered proof', noPaddingEdit, { ...emptyProof(noPaddingEdit), version: 2 }],
    ['stale sourceRevision', noPaddingEdit, emptyProof(noPaddingEdit, 6)],
    ['string sourceRevision', noPaddingEdit, emptyProof(noPaddingEdit, '7')],
    ['inserted note', PADDED_EDIT_XML.replace('</measure>', '<note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note></measure>'), { ...paddingProof(), rawNoteCount: 5 }],
    ['deleted note', PADDED_EDIT_XML.replace(/<note><pitch><step>E<\/step>[\s\S]*?<\/note>/, ''), { ...paddingProof(), rawNoteCount: 3, entries: [paddingEntry(2)] }],
    ['voice relocation', PADDED_EDIT_XML.replace('<voice>1</voice>', '<voice>2</voice>'), paddingProof()],
    ['reordered certified identity', PADDED_EDIT_XML, { ...paddingProof(), entries: [{ ...paddingEntry(), rawNoteOrdinal: 1 }] }],
    ['certified genuine rest', noPaddingEdit.replaceAll('<voice>2</voice>', '<voice>1</voice>'), { ...emptyProof(noPaddingEdit), entries: [paddingEntry(1)] }],
    ['certified genuine rest with compensating unproven padding', PADDED_EDIT_XML, { ...paddingProof(), entries: [paddingEntry(1)] }],
    ['extra unproven rest', PADDED_EDIT_XML.replace('</measure>', `${PADDING_REST}</measure>`), { ...paddingProof(), rawNoteCount: 5 }],
    ['tampered duration', PADDED_EDIT_XML, { ...paddingProof(), entries: [{ ...paddingEntry(), durationTicks: 2 }] }],
  ]
  for (const [name, musicXml, paddingRestProvenance] of cases) await t.test(name, async () => {
    const root = await authority({ xml: REST_SOURCE_XML })
    const current = getTeacherWorkspaceCurrentRevision(root.workspace)
    const before = JSON.stringify(root)
    const result = applySmoosicProductWriteback({
      authority: root, musicXml, paddingRestProvenance, sourceRevision: 7,
      revisionId: 'rejected-edit', eventId: 'rejected-event', operationIdPrefix: 'rejected-op',
      DOMParserCtor: ProductDOMParser,
    })
    assert.equal(result.status, 'UNSUPPORTED_STRUCTURE')
    assert.equal(result.authority, root)
    assert.equal(getTeacherWorkspaceCurrentRevision(root.workspace), current)
    assert.equal(JSON.stringify(root), before)
    assert.equal(resolvePrDProductMusicXml(current)?.musicXml, REST_SOURCE_XML)
  })
})

test('source rest topology changes are structural even when note cardinality is unchanged', async (t) => {
  const { applySmoosicProductWriteback } = await loadWriteback()
  const sourceXml = RHYTHM_SOURCE_XML.replace('<pitch><step>D</step><octave>4</octave></pitch>', '<rest/>')
  const cases = [
    ['rest replaced by pitch', sourceXml.replace('<rest/>', '<pitch><step>D</step><octave>4</octave></pitch>')],
    ['pitch replaced by rest', sourceXml.replace('<pitch><step>C</step><octave>4</octave></pitch>', '<rest/>')],
    ['rest moved to another event', sourceXml
      .replace('<rest/>', '<pitch><step>D</step><octave>4</octave></pitch>')
      .replace('<pitch><step>E</step><octave>4</octave></pitch>', '<rest/>')],
    ['rest onset shifted by pitched duration redistribution', RHYTHM_EDIT_XML
      .replace('<pitch><step>D</step><octave>4</octave></pitch>', '<rest/>')],
    ['rest duration redistributed', sourceXml
      .replace('<rest/><duration>2</duration><voice>1</voice><type>quarter</type>', '<rest/><duration>4</duration><voice>1</voice><type>half</type>')
      .replace('<pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>half</type>', '<pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type>')],
    ['rest notation changed', sourceXml.replace('<rest/>', '<rest/><beam number="1">begin</beam>')],
  ]
  for (const [name, musicXml] of cases) await t.test(name, async () => {
    const root = await authority({ xml: sourceXml })
    const current = getTeacherWorkspaceCurrentRevision(root.workspace)
    const before = JSON.stringify(root)
    const result = applySmoosicProductWriteback({
      authority: root, musicXml, paddingRestProvenance: emptyProof(musicXml), sourceRevision: 7,
      revisionId: 'rest-topology-edit', eventId: 'rest-topology-event', operationIdPrefix: 'rest-topology-op',
      DOMParserCtor: ProductDOMParser,
    })
    assert.equal(result.status, 'UNSUPPORTED_STRUCTURE')
    assert.equal(result.authority, root)
    assert.equal(getTeacherWorkspaceCurrentRevision(root.workspace), current)
    assert.equal(JSON.stringify(root), before)
    assert.equal(resolvePrDProductMusicXml(current)?.musicXml, sourceXml)
  })
})

test('pitched duration redistribution preserves an unchanged preceding source rest', async () => {
  const { applySmoosicProductWriteback } = await loadWriteback()
  const sourceXml = RHYTHM_SOURCE_XML.replace('<pitch><step>C</step><octave>4</octave></pitch>', '<rest/>')
  const musicXml = sourceXml
    .replace('<pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type>', '<pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>half</type>')
    .replace('<pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>half</type>', '<pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type>')
  const root = await authority({ xml: sourceXml })
  const current = getTeacherWorkspaceCurrentRevision(root.workspace)
  const result = applySmoosicProductWriteback({
    authority: root, musicXml, paddingRestProvenance: emptyProof(musicXml), sourceRevision: 7,
    revisionId: 'rest-preserved-edit', eventId: 'rest-preserved-event', operationIdPrefix: 'rest-preserved-op',
    DOMParserCtor: ProductDOMParser,
  })
  assert.equal(result.status, 'APPLIED')
  assert.deepEqual(result.changedIndexes, [1, 2])
  assert.deepEqual(result.revision.content[0], current.content[0])
  assert.equal(result.authority.workspace.history.revisions.length, 2)
})

function parseNotes(xml = SOURCE_XML) {
  const parsed = parseMusicXmlToNotes(xml)
  assert.equal(Boolean(parsed.error), false)
  assert.ok(Array.isArray(parsed.notes))
  assert.ok(parsed.notes.length > 0)
  return parsed.notes
}

async function authority({
  xml = SOURCE_XML,
  sourceId = 's15-source-1',
  automaticRevisionId = 's15-auto-1',
  historyId = 's15-history-1',
  createdAt = '2026-09-21T10:00:00Z',
} = {}) {
  const { createSmoosicProductAuthority } = await loadWriteback()
  return createSmoosicProductAuthority({
    notes: parseNotes(xml),
    musicXml: xml,
    sourceId,
    automaticRevisionId,
    historyId,
    actorId: 'smoosic-local-editor',
    createdAt,
  })
}

test('creates one immutable root authority and registers its exact MusicXML', async () => {
  const value = await authority()
  const revision = getTeacherWorkspaceCurrentRevision(value.workspace)
  assert.equal(revision.revisionId, 's15-auto-1')
  assert.equal(revision.revisionKind, 'automatic')
  assert.equal(revision.content.length, 4)
  assert.equal(resolvePrDProductMusicXml(revision)?.musicXml, SOURCE_XML)
})

test('applies one pitch edit as one new immutable revision without inheriting approval', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    applySmoosicProductWriteback,
  } = await loadWriteback()
  const root = await authority()
  const approvedWorkspace = approveTeacherWorkspace({
    workspace: root.workspace,
    approvalId: 'root-approval-1',
    createdAt: '2026-09-21T10:00:30Z',
  })
  assert.ok(getTeacherWorkspaceApplicableApproval(approvedWorkspace))

  const candidate = SOURCE_XML.replace('<step>C</step>', '<step>G</step>')
  const result = applySmoosicProductWriteback({
    authority: Object.freeze({ workspace: approvedWorkspace }),
    musicXml: candidate,
    sourceRevision: 7,
    paddingRestProvenance: emptyProof(candidate),
    revisionId: 's15-edit-1',
    eventId: 's15-event-1',
    operationIdPrefix: 's15-op-1',
    createdAt: '2026-09-21T10:01:00Z',
    DOMParserCtor: ProductDOMParser,
  })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.APPLIED)
  assert.deepEqual(result.changedIndexes, [0])
  assert.equal(result.revision.revisionId, 's15-edit-1')
  assert.equal(result.authority.workspace.history.revisions.length, 2)
  assert.equal(resolvePrDProductMusicXml(result.revision)?.musicXml, candidate)
  assert.equal(getTeacherWorkspaceApplicableApproval(result.authority.workspace), null)
})



test('normalizes Smoosic canonical single-voice labels before structural classification', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    applySmoosicProductWriteback,
  } = await loadWriteback()
  const sourceXml = SOURCE_XML.replaceAll('<voice>1</voice>', '<voice>2</voice>')
  const root = await authority({
    xml: sourceXml,
    sourceId: 's15-voice-source',
    automaticRevisionId: 's15-voice-auto',
    historyId: 's15-voice-history',
  })
  const candidate = sourceXml
    .replaceAll('<voice>2</voice>', '<voice>1</voice>')
    .replace('<step>C</step>', '<step>G</step>')

  const result = applySmoosicProductWriteback({
    authority: root,
    musicXml: candidate,
    revisionId: 's15-voice-edit',
    sourceRevision: 7,
    paddingRestProvenance: emptyProof(candidate),
    eventId: 's15-voice-event',
    operationIdPrefix: 's15-voice-op',
    createdAt: '2026-09-27T20:30:00Z',
    DOMParserCtor: ProductDOMParser,
  })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.APPLIED)
  assert.deepEqual(result.changedIndexes, [0])
  assert.equal(result.revision.content[0].voice, 2)
  assert.match(result.musicXml, /<voice>2<\/voice>/)
  assert.doesNotMatch(result.musicXml, /<voice>1<\/voice>/)
})


test('normalizes Smoosic single-part id rewrite before strict product revalidation', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    applySmoosicProductWriteback,
  } = await loadWriteback()
  const root = await authority()
  const candidate = SOURCE_XML
    .replaceAll('id="P1"', 'id="P0"')
    .replace('<step>C</step>', '<step>G</step>')

  const result = applySmoosicProductWriteback({
    authority: root,
    musicXml: candidate,
    revisionId: 's15-part-normalized-edit',
    sourceRevision: 7,
    paddingRestProvenance: emptyProof(candidate),
    eventId: 's15-part-normalized-event',
    operationIdPrefix: 's15-part-normalized-op',
    createdAt: '2026-09-21T10:01:30Z',
    DOMParserCtor: ProductDOMParser,
  })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.APPLIED)
  assert.deepEqual(result.changedIndexes, [0])
  assert.match(result.musicXml, /<score-part id="P1">/)
  assert.match(result.musicXml, /<part id="P1">/)
  assert.doesNotMatch(result.musicXml, /<(?:score-part|part) id="P0">/)
  assert.equal(result.revision.content[0].partId, 'P1')
})


test('returns NO_CHANGE without creating a revision for exact current MusicXML', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    applySmoosicProductWriteback,
  } = await loadWriteback()
  const root = await authority()
  const result = applySmoosicProductWriteback({
    authority: root,
    musicXml: SOURCE_XML,
    sourceRevision: 7,
    paddingRestProvenance: emptyProof(SOURCE_XML),
    revisionId: 'unused-revision',
    eventId: 'unused-event',
    operationIdPrefix: 'unused-op',
    DOMParserCtor: ProductDOMParser,
  })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.NO_CHANGE)
  assert.equal(result.authority.workspace.history.revisions.length, 1)
})

test('builds typed stale-source and retryable publish-failure outcomes', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    createSmoosicWritebackOutcome,
  } = await loadWriteback()

  assert.deepEqual(
    createSmoosicWritebackOutcome(SMOOSIC_WRITEBACK_STATUS.STALE_SOURCE),
    { status: SMOOSIC_WRITEBACK_STATUS.STALE_SOURCE },
  )
  assert.deepEqual(
    createSmoosicWritebackOutcome(SMOOSIC_WRITEBACK_STATUS.PUBLISH_FAILED, {
      revision: { revisionId: 's15-edit-1' },
      musicXml: '<score-partwise />',
    }),
    {
      status: SMOOSIC_WRITEBACK_STATUS.PUBLISH_FAILED,
      revision: { revisionId: 's15-edit-1' },
      musicXml: '<score-partwise />',
    },
  )
  assert.deepEqual(
    createSmoosicWritebackOutcome(SMOOSIC_WRITEBACK_STATUS.APPLIED, {
      revision: { revisionId: 's15-edit-1' },
      musicXml: '<score-partwise />',
      retriedPublication: true,
    }),
    {
      status: SMOOSIC_WRITEBACK_STATUS.APPLIED,
      revision: { revisionId: 's15-edit-1' },
      musicXml: '<score-partwise />',
      retriedPublication: true,
    },
  )
})

test('rejects note removal as unsupported structure without partial history', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    applySmoosicProductWriteback,
  } = await loadWriteback()
  const root = await authority()
  const candidate = SOURCE_XML.replace(
    '<note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>',
    '',
  )
  const result = applySmoosicProductWriteback({
    authority: root,
    musicXml: candidate,
    revisionId: 's15-structural-1',
    sourceRevision: 7,
    paddingRestProvenance: emptyProof(candidate),
    eventId: 's15-structural-event-1',
    operationIdPrefix: 's15-structural-op-1',
    DOMParserCtor: ProductDOMParser,
  })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.UNSUPPORTED_STRUCTURE)
  assert.equal(root.workspace.history.revisions.length, 1)
})

test('rejects a voice relocation as unsupported structure', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    applySmoosicProductWriteback,
  } = await loadWriteback()
  const root = await authority()
  const candidate = SOURCE_XML.replace('<voice>1</voice>', '<voice>2</voice>')
  const result = applySmoosicProductWriteback({
    authority: root,
    musicXml: candidate,
    revisionId: 's15-voice-1',
    sourceRevision: 7,
    paddingRestProvenance: emptyProof(candidate),
    eventId: 's15-voice-event-1',
    operationIdPrefix: 's15-voice-op-1',
    DOMParserCtor: ProductDOMParser,
  })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.UNSUPPORTED_STRUCTURE)
  assert.equal(root.workspace.history.revisions.length, 1)
})

test('accepts exact MusicXML byte limit and rejects one byte over before revalidation', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    applySmoosicProductWriteback,
  } = await loadWriteback()
  const root = await authority()
  const sourceBytes = new TextEncoder().encode(SOURCE_XML).byteLength
  const exactLimit = SOURCE_XML + ' '.repeat(MAX_MUSIC_XML_FILE_SIZE - sourceBytes)
  const exact = applySmoosicProductWriteback({
    authority: root,
    musicXml: exactLimit,
    sourceRevision: 7,
    paddingRestProvenance: emptyProof(exactLimit),
    revisionId: 'exact-limit',
    eventId: 'exact-limit-event',
    operationIdPrefix: 'exact-limit-op',
    DOMParserCtor: ProductDOMParser,
  })
  assert.equal(exact.status, SMOOSIC_WRITEBACK_STATUS.NO_CHANGE)

  const oversized = exactLimit + ' '
  const result = applySmoosicProductWriteback({
    authority: root,
    musicXml: oversized,
    sourceRevision: 7,
    paddingRestProvenance: emptyProof(oversized),
    revisionId: 'oversized',
    eventId: 'oversized-event',
    operationIdPrefix: 'oversized-op',
    DOMParserCtor: ProductDOMParser,
  })
  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.INVALID_XML)
  assert.equal(root.workspace.history.revisions.length, 1)
})

test('a second supported edit extends the first corrected revision', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    applySmoosicProductWriteback,
  } = await loadWriteback()
  const firstXml = SOURCE_XML.replace('<step>C</step>', '<step>G</step>')
  const first = applySmoosicProductWriteback({
    authority: await authority(),
    musicXml: firstXml,
    sourceRevision: 7,
    paddingRestProvenance: emptyProof(firstXml),
    revisionId: 's15-edit-1',
    eventId: 's15-event-1',
    operationIdPrefix: 's15-op-1',
    createdAt: '2026-09-21T10:01:00Z',
    DOMParserCtor: ProductDOMParser,
  })
  assert.equal(first.status, SMOOSIC_WRITEBACK_STATUS.APPLIED)

  const secondXml = firstXml.replace('<step>D</step>', '<step>A</step>')
  const second = applySmoosicProductWriteback({
    authority: first.authority,
    musicXml: secondXml,
    sourceRevision: 8,
    paddingRestProvenance: emptyProof(secondXml, 8),
    revisionId: 's15-edit-2',
    eventId: 's15-event-2',
    operationIdPrefix: 's15-op-2',
    createdAt: '2026-09-21T10:02:00Z',
    DOMParserCtor: ProductDOMParser,
  })

  assert.equal(second.status, SMOOSIC_WRITEBACK_STATUS.APPLIED)
  assert.equal(second.authority.workspace.history.revisions.length, 3)
  assert.equal(second.revision.parentRevisionId, 's15-edit-1')
  assert.equal(resolvePrDProductMusicXml(second.revision)?.musicXml, secondXml)
})

test('duration redistribution commits every note whose semantic timeline changes', async () => {
  const {
    SMOOSIC_WRITEBACK_STATUS,
    applySmoosicProductWriteback,
    createSmoosicProductAuthority,
  } = await loadWriteback()
  const parsed = parseMusicXmlToNotes(RHYTHM_SOURCE_XML)
  assert.equal(Boolean(parsed.error), false)

  const root = createSmoosicProductAuthority({
    notes: parsed.notes,
    musicXml: RHYTHM_SOURCE_XML,
    sourceId: 's15-rhythm-source',
    automaticRevisionId: 's15-rhythm-auto',
    historyId: 's15-rhythm-history',
    actorId: 'smoosic-local-editor',
    createdAt: '2026-09-21T11:00:00Z',
  })

  const result = applySmoosicProductWriteback({
    authority: root,
    musicXml: RHYTHM_EDIT_XML,
    sourceRevision: 7,
    paddingRestProvenance: emptyProof(RHYTHM_EDIT_XML),
    revisionId: 's15-rhythm-edit',
    eventId: 's15-rhythm-event',
    operationIdPrefix: 's15-rhythm-op',
    createdAt: '2026-09-21T11:01:00Z',
    DOMParserCtor: ProductDOMParser,
  })

  assert.equal(result.status, SMOOSIC_WRITEBACK_STATUS.APPLIED)
  assert.deepEqual(result.changedIndexes, [0, 1, 2])
  assert.equal(result.revision.content[0].beats, 2)
  assert.equal(result.revision.content[1].startBeat, 2)
  assert.equal(result.revision.content[2].startBeat, 3)
})
