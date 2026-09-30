import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_MUSIC_XML_SIZE_BYTES } from '../musicXmlSecurity.js'
import { SmoosicTestDOMParser, SmoosicTestXMLSerializer } from './support/smoosicXmlDom.js'
import { parseMusicXmlToNotes } from '../src/services/musicEngine.js'
import {
  registerPrDProductMusicXml,
} from '../src/services/editorPrDRevisionMusicXmlRegistry.js'
import {
  createSmoosicProductAuthority,
} from '../src/services/smoosicProductWriteback.js'
import {
  createTeacherWorkspace,
  getTeacherWorkspaceCurrentRevision,
} from '../src/services/teacherWorkspaceModel.js'
import {
  createFinalMusicXmlIntake,
} from '../src/services/finalMusicXmlIntake.js'

globalThis.DOMParser = SmoosicTestDOMParser
globalThis.XMLSerializer = SmoosicTestXMLSerializer

const SOURCE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`

function notesFor(xml) {
  const parsed = parseMusicXmlToNotes(xml)
  assert.equal(parsed.error, undefined)
  assert.ok(Array.isArray(parsed.notes))
  assert.ok(parsed.notes.length > 0)
  return parsed.notes
}

function authority({
  xml = SOURCE_XML,
  sourceId = 'ses-116-source',
  automaticRevisionId = 'ses-116-revision',
  historyId = 'ses-116-history',
} = {}) {
  return createSmoosicProductAuthority({
    notes: notesFor(xml),
    musicXml: xml,
    sourceId,
    automaticRevisionId,
    historyId,
    actorId: 'teacher-a',
    createdAt: '2026-09-30T10:30:00Z',
  })
}

function manualWorkspace({
  sourceId = 'manual-source',
  revisionId = 'manual-revision',
  historyId = 'manual-history',
} = {}) {
  return createTeacherWorkspace({
    content: [{ measure: 1, step: 'C', octave: 4 }],
    actorId: 'teacher-a',
    sourceId,
    automaticRevisionId: revisionId,
    historyId,
    createdAt: '2026-09-30T10:30:00Z',
  })
}

test('accepts only exact current revision MusicXML and returns immutable bound intake authority', async () => {
  const root = authority()
  const revision = getTeacherWorkspaceCurrentRevision(root.workspace)
  const beforeRevision = JSON.stringify(revision)
  const beforeWorkspace = JSON.stringify(root.workspace)

  const intake = await createFinalMusicXmlIntake({
    workspace: root.workspace,
    revision,
  })

  assert.equal(intake.schemaVersion, 1)
  assert.equal(intake.sourceId, revision.sourceId)
  assert.equal(intake.sourceRevisionId, revision.sourceRevisionId)
  assert.equal(intake.revisionId, revision.revisionId)
  assert.equal(intake.revisionKind, revision.revisionKind)
  assert.equal(intake.contentFingerprint, revision.contentFingerprint)
  assert.equal(intake.lineageFingerprint, revision.lineageFingerprint)
  assert.equal(intake.musicXml, SOURCE_XML)
  assert.equal(intake.semanticNoteCount, revision.content.length)
  assert.match(intake.musicXmlFingerprint, /^[a-f0-9]{64}$/)
  assert.match(intake.authorityFingerprint, /^[a-f0-9]{64}$/)
  assert.equal(Object.isFrozen(intake), true)
  assert.equal(JSON.stringify(revision), beforeRevision)
  assert.equal(JSON.stringify(root.workspace), beforeWorkspace)
})

test('fingerprints exact MusicXML bytes deterministically and separately binds revision authority', async () => {
  const first = authority({
    sourceId: 'source-a',
    automaticRevisionId: 'revision-a',
    historyId: 'history-a',
  })
  const firstRevision = getTeacherWorkspaceCurrentRevision(first.workspace)
  const firstIntake = await createFinalMusicXmlIntake({
    workspace: first.workspace,
    revision: firstRevision,
  })
  const firstRepeat = await createFinalMusicXmlIntake({
    workspace: first.workspace,
    revision: firstRevision,
  })

  assert.equal(firstIntake.musicXmlFingerprint, firstRepeat.musicXmlFingerprint)
  assert.equal(firstIntake.authorityFingerprint, firstRepeat.authorityFingerprint)

  const whitespaceVariant = SOURCE_XML.replace(
    '<part id="P1">',
    '<part id="P1">\n    <!-- exact-byte change -->',
  )
  const changed = authority({
    xml: whitespaceVariant,
    sourceId: 'source-a',
    automaticRevisionId: 'revision-b',
    historyId: 'history-b',
  })
  const changedRevision = getTeacherWorkspaceCurrentRevision(changed.workspace)
  const changedIntake = await createFinalMusicXmlIntake({
    workspace: changed.workspace,
    revision: changedRevision,
  })

  assert.notEqual(
    firstIntake.musicXmlFingerprint,
    changedIntake.musicXmlFingerprint,
  )

  const sameXmlDifferentBinding = authority({
    sourceId: 'source-b',
    automaticRevisionId: 'revision-c',
    historyId: 'history-c',
  })
  const differentlyBoundRevision =
    getTeacherWorkspaceCurrentRevision(sameXmlDifferentBinding.workspace)
  const differentlyBoundIntake = await createFinalMusicXmlIntake({
    workspace: sameXmlDifferentBinding.workspace,
    revision: differentlyBoundRevision,
  })

  assert.equal(
    firstIntake.musicXmlFingerprint,
    differentlyBoundIntake.musicXmlFingerprint,
  )
  assert.notEqual(
    firstIntake.authorityFingerprint,
    differentlyBoundIntake.authorityFingerprint,
  )
})

test('stale or different revision binding fails closed', async () => {
  const oldAuthority = authority({
    sourceId: 'shared-source',
    automaticRevisionId: 'old-revision',
    historyId: 'old-history',
  })
  const currentAuthority = authority({
    sourceId: 'shared-source',
    automaticRevisionId: 'current-revision',
    historyId: 'current-history',
  })
  const staleRevision = getTeacherWorkspaceCurrentRevision(oldAuthority.workspace)

  await assert.rejects(
    () => createFinalMusicXmlIntake({
      workspace: currentAuthority.workspace,
      revision: staleRevision,
    }),
    /stale|current|revision/i,
  )
})

test('missing or mismatched revision-scoped MusicXML registry record fails closed', async () => {
  const workspace = manualWorkspace()
  const revision = getTeacherWorkspaceCurrentRevision(workspace)

  await assert.rejects(
    () => createFinalMusicXmlIntake({ workspace, revision }),
    /registry|musicxml|missing/i,
  )

  registerPrDProductMusicXml(
    {
      revisionId: 'forged-revision',
      content: revision.content,
    },
    SOURCE_XML,
    { evidence: 'forged-test-record' },
  )

  await assert.rejects(
    () => createFinalMusicXmlIntake({ workspace, revision }),
    /registry|musicxml|mismatch|missing/i,
  )
})

test('unsafe, oversized and semantically empty MusicXML fail closed', async () => {
  const unsafeWorkspace = manualWorkspace({
    sourceId: 'unsafe-source',
    revisionId: 'unsafe-revision',
    historyId: 'unsafe-history',
  })
  const unsafeRevision = getTeacherWorkspaceCurrentRevision(unsafeWorkspace)
  registerPrDProductMusicXml(
    unsafeRevision,
    '<html><body>not musicxml</body></html>',
    { evidence: 'unsafe-test-record' },
  )

  await assert.rejects(
    () => createFinalMusicXmlIntake({
      workspace: unsafeWorkspace,
      revision: unsafeRevision,
    }),
    /invalid|unsafe|musicxml|html/i,
  )

  const oversizedWorkspace = manualWorkspace({
    sourceId: 'oversized-source',
    revisionId: 'oversized-revision',
    historyId: 'oversized-history',
  })
  const oversizedRevision = getTeacherWorkspaceCurrentRevision(oversizedWorkspace)
  const oversizedXml =
    '<score-partwise>' +
    ' '.repeat(MAX_MUSIC_XML_SIZE_BYTES + 1) +
    '</score-partwise>'
  registerPrDProductMusicXml(
    oversizedRevision,
    oversizedXml,
    { evidence: 'oversized-test-record' },
  )

  await assert.rejects(
    () => createFinalMusicXmlIntake({
      workspace: oversizedWorkspace,
      revision: oversizedRevision,
    }),
    /large|size|musicxml/i,
  )

  const emptyWorkspace = manualWorkspace({
    sourceId: 'empty-source',
    revisionId: 'empty-revision',
    historyId: 'empty-history',
  })
  const emptyRevision = getTeacherWorkspaceCurrentRevision(emptyWorkspace)
  registerPrDProductMusicXml(
    emptyRevision,
    '<score-partwise version="4.0"><part-list/></score-partwise>',
    { evidence: 'empty-test-record' },
  )

  await assert.rejects(
    () => createFinalMusicXmlIntake({
      workspace: emptyWorkspace,
      revision: emptyRevision,
    }),
    /semantic|note|empty|parse/i,
  )
})
